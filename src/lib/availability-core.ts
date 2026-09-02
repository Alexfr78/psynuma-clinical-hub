// Core puro de disponibilidad. Compartido entre frontend y edge functions.
// Sin React, sin DOM, sin Deno/Node, sin Supabase client, sin Date, sin Intl.
// Trabaja en minutos locales [0, 1440] del día ya resuelto por el caller.

export type Interval = { startMin: number; endMin: number };

export type BusySource = "session" | "calendar" | "exception";
export type BusyBlock = Interval & { source: BusySource; refId: string };

export type Slot = Interval & { score: number; isOptimal: boolean };

export type DayMode = "weekly" | "custom" | "extended" | "closed";

export type DayScheduleInput = {
  mode: DayMode;
  weeklyWindows: Interval[];
  specialWindows: Interval[];
  locationWindows: Interval[] | null;
  // Restricción opcional por servicio (tipo de sesión). null = sin restricción
  // (comportamiento por defecto, ningún tipo de sesión tiene horario propio).
  // [] = ese día está cerrado para este servicio. [intervals] = solo esas franjas.
  serviceWindows?: Interval[] | null;
  busy: BusyBlock[];
};

export type SlotConfig = {
  durationMin: number;
  stepMin: number;
  minPublicDurationMin: number;
};

const DAY_MIN = 1440;

function clamp(n: number): number {
  if (n < 0) return 0;
  if (n > DAY_MIN) return DAY_MIN;
  return n;
}

// Normaliza: clampea a [0,1440], descarta inválidos, ordena, fusiona solapes y adyacentes.
export function normalize(intervals: Interval[]): Interval[] {
  const clean: Interval[] = [];
  for (const iv of intervals) {
    const s = clamp(iv.startMin);
    const e = clamp(iv.endMin);
    if (e > s) clean.push({ startMin: s, endMin: e });
  }
  clean.sort((a, b) => a.startMin - b.startMin);
  const out: Interval[] = [];
  for (const iv of clean) {
    const last = out[out.length - 1];
    if (last && iv.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, iv.endMin);
    } else {
      out.push({ startMin: iv.startMin, endMin: iv.endMin });
    }
  }
  return out;
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const na = normalize(a);
  const nb = normalize(b);
  const out: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < na.length && j < nb.length) {
    const s = Math.max(na[i].startMin, nb[j].startMin);
    const e = Math.min(na[i].endMin, nb[j].endMin);
    if (e > s) out.push({ startMin: s, endMin: e });
    if (na[i].endMin < nb[j].endMin) i++;
    else j++;
  }
  return out;
}

export function mergeWindows(a: Interval[], b: Interval[]): Interval[] {
  return normalize([...a, ...b]);
}

export function subtract(base: Interval[], busy: Interval[]): Interval[] {
  let segments = normalize(base);
  const blocks = normalize(busy);
  for (const block of blocks) {
    const next: Interval[] = [];
    for (const seg of segments) {
      if (block.endMin <= seg.startMin || block.startMin >= seg.endMin) {
        next.push(seg);
        continue;
      }
      if (seg.startMin < block.startMin) {
        next.push({ startMin: seg.startMin, endMin: block.startMin });
      }
      if (seg.endMin > block.endMin) {
        next.push({ startMin: block.endMin, endMin: seg.endMin });
      }
    }
    segments = next;
    if (segments.length === 0) break;
  }
  return segments;
}

export function resolveBase(
  mode: DayMode,
  weekly: Interval[],
  special: Interval[],
): Interval[] {
  switch (mode) {
    case "closed":
      return [];
    case "custom":
      return normalize(special);
    case "extended":
      return mergeWindows(weekly, special);
    case "weekly":
      return normalize(weekly);
  }
}

// null = sin restricción (ubicación o servicio) → salta intersección.
// [] = cerrado → día sin disponibilidad.
// [intervals] = intersección normal.
// Misma función que la restricción por ubicación se reutiliza para la
// restricción opcional por servicio (tipo de sesión).
export function applyLocation(
  base: Interval[],
  loc: Interval[] | null,
): Interval[] {
  if (loc === null) return normalize(base);
  return intersect(base, loc);
}

export function scoreSlot(
  slotStart: number,
  slotEnd: number,
  window: Interval,
  minPublicDurationMin: number,
): { score: number; isOptimal: boolean } {
  let score = 0;
  const leftGap = slotStart - window.startMin;
  const rightGap = window.endMin - slotEnd;

  if (leftGap > 0 && leftGap < minPublicDurationMin) score -= 100;
  if (rightGap > 0 && rightGap < minPublicDurationMin) score -= 100;
  if (leftGap === 0) score += 20;
  if (rightGap === 0) score += 20;
  if (leftGap === 0 && rightGap === 0) score += 30;
  if (slotStart % 60 === 0) score += 5;

  return { score, isOptimal: score >= 0 };
}

export function generateSlots(windows: Interval[], cfg: SlotConfig): Slot[] {
  if (!(cfg.durationMin > 0)) {
    throw new Error("SlotConfig.durationMin must be > 0");
  }
  if (!(cfg.stepMin > 0)) {
    throw new Error("SlotConfig.stepMin must be > 0");
  }
  if (!(cfg.minPublicDurationMin >= 0)) {
    throw new Error("SlotConfig.minPublicDurationMin must be >= 0");
  }

  const { durationMin, stepMin, minPublicDurationMin } = cfg;
  const candidates: Slot[] = [];
  const seen = new Set<number>();

  for (const w of windows) {
    for (let t = w.startMin; t + durationMin <= w.endMin; t += stepMin) {
      if (seen.has(t)) continue;
      seen.add(t);
      const { score, isOptimal } = scoreSlot(
        t,
        t + durationMin,
        w,
        minPublicDurationMin,
      );
      candidates.push({ startMin: t, endMin: t + durationMin, score, isOptimal });
    }
  }

  candidates.sort((a, b) => a.startMin - b.startMin);
  return candidates;
}

export function resolveDayAvailability(
  input: DayScheduleInput,
  cfg: SlotConfig,
): Slot[] {
  if (input.mode === "closed") return [];
  const base = resolveBase(input.mode, input.weeklyWindows, input.specialWindows);
  if (base.length === 0) return [];
  const withLoc = applyLocation(base, input.locationWindows);
  if (withLoc.length === 0) return [];
  const withService = applyLocation(withLoc, input.serviceWindows ?? null);
  if (withService.length === 0) return [];
  const free = subtract(withService, input.busy);
  if (free.length === 0) return [];
  return generateSlots(free, cfg);
}
