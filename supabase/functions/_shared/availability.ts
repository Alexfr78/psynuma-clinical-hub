/**
 * Shared availability helpers for anti-fragmentation slot scoring.
 *
 * Core idea: build continuous free windows from the intersection of
 * professional availability × location schedule minus occupied blocks
 * (sessions + calendar events). Then score candidate slots based on
 * the residual gaps they leave, penalising gaps that are too small
 * to be booked by any public service.
 */

// ── Primitives ──────────────────────────────────────────────────

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function getLocalTimeMinutes(isoDatetime: string, timezone: string): number {
  const date = new Date(isoDatetime);
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    timeZone: timezone,
  });
  const parts = formatter.formatToParts(date);
  const hours = parseInt(parts.find((p) => p.type === "hour")?.value || "0");
  const minutes = parseInt(parts.find((p) => p.type === "minute")?.value || "0");
  return hours * 60 + minutes;
}

// ── Types ───────────────────────────────────────────────────────

export interface FreeWindow {
  start: number; // minutes from midnight
  end: number;
}

export interface ScoredSlot {
  startTime: string;
  endTime: string;
  score: number;
  isOptimal: boolean;
}

interface OccupiedBlock {
  start: number;
  end: number;
}

// ── Build free windows ──────────────────────────────────────────

/**
 * Compute the intersection of professional availability and location
 * schedule, then subtract occupied blocks (sessions + calendar events)
 * to produce continuous free windows.
 */
export function buildFreeWindows(
  profSlots: { start_time: string; end_time: string }[],
  locSlots: { start_time: string; end_time: string }[],
  sessions: { start_time: string; end_time: string }[] | null,
  calendarEvents: { start_at: string; end_at: string | null; status: string | null; all_day: boolean | null }[] | null,
  timezone: string
): FreeWindow[] {
  // 1. Compute prof×loc intersections
  const intersections: FreeWindow[] = [];
  for (const prof of profSlots) {
    const pStart = timeToMinutes(prof.start_time);
    const pEnd = timeToMinutes(prof.end_time);
    for (const loc of locSlots) {
      const lStart = timeToMinutes(loc.start_time);
      const lEnd = timeToMinutes(loc.end_time);
      const start = Math.max(pStart, lStart);
      const end = Math.min(pEnd, lEnd);
      if (start < end) intersections.push({ start, end });
    }
  }

  if (intersections.length === 0) return [];

  // 2. Build occupied blocks
  const occupied: OccupiedBlock[] = [];

  if (sessions) {
    for (const s of sessions) {
      occupied.push({
        start: timeToMinutes(s.start_time.substring(0, 5)),
        end: timeToMinutes(s.end_time.substring(0, 5)),
      });
    }
  }

  if (calendarEvents) {
    for (const e of calendarEvents) {
      if (e.status === "cancelled") continue;
      if (e.all_day) {
        // Block the whole day
        occupied.push({ start: 0, end: 24 * 60 });
        continue;
      }
      if (!e.start_at) continue;
      const eStart = getLocalTimeMinutes(e.start_at, timezone);
      const eEnd = e.end_at ? getLocalTimeMinutes(e.end_at, timezone) : eStart + 60;
      occupied.push({ start: eStart, end: eEnd });
    }
  }

  // Sort occupied by start
  occupied.sort((a, b) => a.start - b.start);

  // 3. Subtract occupied from each intersection
  const windows: FreeWindow[] = [];

  for (const inter of intersections) {
    let segments: FreeWindow[] = [{ start: inter.start, end: inter.end }];

    for (const block of occupied) {
      const next: FreeWindow[] = [];
      for (const seg of segments) {
        if (block.end <= seg.start || block.start >= seg.end) {
          // No overlap
          next.push(seg);
        } else {
          // Left remainder
          if (seg.start < block.start) {
            next.push({ start: seg.start, end: block.start });
          }
          // Right remainder
          if (seg.end > block.end) {
            next.push({ start: block.end, end: seg.end });
          }
        }
      }
      segments = next;
    }

    windows.push(...segments);
  }

  // Merge overlapping/adjacent windows and sort
  windows.sort((a, b) => a.start - b.start);
  const merged: FreeWindow[] = [];
  for (const w of windows) {
    if (w.start >= w.end) continue;
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ start: w.start, end: w.end });
    }
  }

  return merged;
}

// ── Score a single slot ─────────────────────────────────────────

export function scoreSlot(
  slotStart: number,
  slotEnd: number,
  window: FreeWindow,
  minPublicDuration: number
): { score: number; isOptimal: boolean } {
  let score = 0;

  const leftGap = slotStart - window.start;
  const rightGap = window.end - slotEnd;

  // Penalty: unbookable residual gap
  if (leftGap > 0 && leftGap < minPublicDuration) score -= 100;
  if (rightGap > 0 && rightGap < minPublicDuration) score -= 100;

  // Reward: edge packing
  if (leftGap === 0) score += 20;
  if (rightGap === 0) score += 20;

  // Reward: perfect fit
  if (leftGap === 0 && rightGap === 0) score += 30;

  // Bonus: full-hour alignment
  if (slotStart % 60 === 0) score += 5;

  return { score, isOptimal: score >= 0 };
}

// ── Generate scored slots ───────────────────────────────────────

/**
 * From free windows, generate candidate slots every `step` minutes,
 * score them, and filter to optimal ones when possible.
 */
export function generateScoredSlots(
  freeWindows: FreeWindow[],
  serviceDuration: number,
  step: number,
  minPublicDuration: number
): ScoredSlot[] {
  const candidates: ScoredSlot[] = [];
  const seen = new Set<string>();

  for (const w of freeWindows) {
    for (let t = w.start; t + serviceDuration <= w.end; t += step) {
      const key = `${t}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { score, isOptimal } = scoreSlot(t, t + serviceDuration, w, minPublicDuration);
      candidates.push({
        startTime: minutesToTime(t),
        endTime: minutesToTime(t + serviceDuration),
        score,
        isOptimal,
      });
    }
  }

  return filterOptimalSlots(candidates);
}

// ── Filter optimal slots ────────────────────────────────────────

/**
 * If at least one optimal slot exists, return only optimal ones.
 * Otherwise return all, sorted by score descending.
 */
export function filterOptimalSlots(slots: ScoredSlot[]): ScoredSlot[] {
  // Sort by time first
  slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const optimal = slots.filter((s) => s.isOptimal);
  if (optimal.length > 0) return optimal;

  // No optimal slots — return all sorted by score desc, then by time
  return [...slots].sort((a, b) => b.score - a.score || a.startTime.localeCompare(b.startTime));
}

// ── Count optimal slots (for monthly view) ──────────────────────

/**
 * Same logic as generateScoredSlots but returns only the count.
 */
export function countOptimalSlots(
  freeWindows: FreeWindow[],
  serviceDuration: number,
  step: number,
  minPublicDuration: number
): number {
  const seen = new Set<number>();
  let optimalCount = 0;
  let totalCount = 0;

  for (const w of freeWindows) {
    for (let t = w.start; t + serviceDuration <= w.end; t += step) {
      if (seen.has(t)) continue;
      seen.add(t);

      const { isOptimal } = scoreSlot(t, t + serviceDuration, w, minPublicDuration);
      totalCount++;
      if (isOptimal) optimalCount++;
    }
  }

  // If there are optimal slots, count only those; else count all
  return optimalCount > 0 ? optimalCount : totalCount;
}
