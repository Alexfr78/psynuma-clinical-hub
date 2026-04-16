// Adapter que transforma filas crudas de Supabase en DayScheduleInput.
// Aplica reglas de negocio (prioridad, filtros, normalización TZ) fuera del core puro.

import type {
  BusyBlock,
  DayMode,
  DayScheduleInput,
  Interval,
} from "./availability-core.ts";

export const APP_TZ = "Europe/Madrid";

// ── Tipos crudos esperados (mínimos) ──────────────────────────────

export type RawAvailability = { start_time: string; end_time: string };
export type RawLocationSchedule = {
  start_time: string;
  end_time: string;
  is_open: boolean | null;
};

export type RawSpecialDay = {
  id: string;
  scope: "center" | "professional";
  professional_id: string | null;
  type: "closed" | "custom" | "extended";
  start_date: string; // YYYY-MM-DD
  end_date: string;
  affects_public_booking: boolean;
  created_at: string | null;
  special_day_slots: { start_time: string; end_time: string }[] | null;
};

export type RawScheduleException = {
  id: string;
  scope: "center" | "professional";
  professional_id: string | null;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  affects_booking: boolean;
};

// sessions.start_time / end_time son columnas TIME en Postgres (local HH:MM:SS,
// sin TZ). NO son timestamps ISO. Se interpretan como hora local del día indicado
// por sessions.session_date. Por eso `sessionsToBusy` usa timeToMinutes y NO
// isoToLocalMinutes.
export type RawSession = {
  id: string;
  start_time: string; // "HH:MM" o "HH:MM:SS" locales
  end_time: string;   // "HH:MM" o "HH:MM:SS" locales
};

export type RawCalendarEvent = {
  id: string;
  start_at: string | null;
  end_at: string | null;
  status: string | null;
  all_day: boolean | null;
  is_converted: boolean | null;
  deleted: boolean | null;
};

// ── Helpers de tiempo ─────────────────────────────────────────────

export function timeToMinutes(time: string): number {
  const [h, m] = time.substring(0, 5).split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

// Convierte un timestamp ISO a minutos locales del día indicado, en la TZ dada.
// Si el timestamp cae fuera del día (cruza medianoche), devuelve clampeado.
export function isoToLocalMinutes(
  iso: string,
  date: string, // YYYY-MM-DD del día resuelto
  timezone: string,
): number {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const mo = parts.find((p) => p.type === "month")?.value;
  const da = parts.find((p) => p.type === "day")?.value;
  const localDate = `${y}-${mo}-${da}`;
  const hh = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  if (localDate < date) return 0;
  if (localDate > date) return 1440;
  return hh * 60 + mm;
}

// ── Resolución de special_day aplicable ───────────────────────────

// De entre todos los special_days que cubren `date`, elige el de mayor prioridad:
// 1º profesional (si professional_id coincide), 2º centro.
// Si por inconsistencia hay varios en el mismo ámbito, ordena por created_at DESC, id DESC.
export function pickApplicableSpecialDay(
  specialDays: RawSpecialDay[],
  date: string,
  professionalId: string,
  isPublicContext: boolean,
): RawSpecialDay | null {
  const applicable = specialDays.filter((sd) => {
    if (sd.start_date > date || sd.end_date < date) return false;
    if (isPublicContext && !sd.affects_public_booking) return false;
    if (sd.scope === "professional" && sd.professional_id !== professionalId) {
      return false;
    }
    return true;
  });
  if (applicable.length === 0) return null;

  const cmp = (a: RawSpecialDay, b: RawSpecialDay) => {
    const ca = a.created_at ?? "";
    const cb = b.created_at ?? "";
    if (cb !== ca) return cb.localeCompare(ca);
    return b.id.localeCompare(a.id);
  };

  const profMatches = applicable
    .filter((sd) => sd.scope === "professional")
    .sort(cmp);
  if (profMatches.length > 0) return profMatches[0];

  const centerMatches = applicable
    .filter((sd) => sd.scope === "center")
    .sort(cmp);
  return centerMatches[0] ?? null;
}

function specialDayToWindows(sd: RawSpecialDay): Interval[] {
  const slots = sd.special_day_slots ?? [];
  return slots.map((s) => ({
    startMin: timeToMinutes(s.start_time),
    endMin: timeToMinutes(s.end_time),
  }));
}

// ── Construcción de busy blocks ───────────────────────────────────

function sessionsToBusy(sessions: RawSession[]): BusyBlock[] {
  return sessions.map((s) => ({
    startMin: timeToMinutes(s.start_time),
    endMin: timeToMinutes(s.end_time),
    source: "session",
    refId: s.id,
  }));
}

function calendarEventsToBusy(
  events: RawCalendarEvent[],
  date: string,
  timezone: string,
): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const e of events) {
    if (e.deleted) continue;
    if (e.is_converted) continue;
    if (e.status === "cancelled") continue;
    if (e.all_day) {
      out.push({ startMin: 0, endMin: 1440, source: "calendar", refId: e.id });
      continue;
    }
    if (!e.start_at) continue;
    const startMin = isoToLocalMinutes(e.start_at, date, timezone);
    const endMin = e.end_at
      ? isoToLocalMinutes(e.end_at, date, timezone)
      : Math.min(startMin + 60, 1440);
    if (endMin > startMin) {
      out.push({ startMin, endMin, source: "calendar", refId: e.id });
    }
  }
  return out;
}

// Semántica de schedule_exceptions.affects_booking en este proyecto:
// FALSE = excepción puramente informativa/anotación (etiqueta visual en agenda
//         interna); NO bloquea disponibilidad en ningún contexto.
// TRUE  = bloquea disponibilidad tanto interna como pública.
// Es DISTINTO de special_days.affects_public_booking, que sí distingue
// público vs interno.
function exceptionsToBusy(
  exceptions: RawScheduleException[],
  date: string,
  professionalId: string,
): BusyBlock[] {
  const out: BusyBlock[] = [];
  for (const exc of exceptions) {
    if (!exc.affects_booking) continue;
    if (exc.start_date > date || exc.end_date < date) continue;
    if (exc.scope === "professional" && exc.professional_id !== professionalId) {
      continue;
    }
    if (exc.all_day) {
      out.push({ startMin: 0, endMin: 1440, source: "exception", refId: exc.id });
      continue;
    }
    if (exc.start_time && exc.end_time) {
      const s = timeToMinutes(exc.start_time);
      const e = timeToMinutes(exc.end_time);
      if (e > s) {
        out.push({ startMin: s, endMin: e, source: "exception", refId: exc.id });
      }
    }
  }
  return out;
}

// ── Construcción de location windows ──────────────────────────────

// null  → sin restricción (no se pidió ubicación).
// []    → ubicación cerrada ese día.
// rows  → intervalos abiertos.
export function buildLocationWindows(
  schedules: RawLocationSchedule[] | null,
): Interval[] | null {
  if (schedules === null) return null;
  const open = schedules.filter((s) => s.is_open === true);
  if (open.length === 0) return [];
  return open.map((s) => ({
    startMin: timeToMinutes(s.start_time),
    endMin: timeToMinutes(s.end_time),
  }));
}

// ── Builder principal ─────────────────────────────────────────────

export type BuildDayInputArgs = {
  date: string; // YYYY-MM-DD del día resuelto (en TZ del centro)
  professionalId: string;
  isPublicContext: boolean; // true para portales anon (aplica affects_public_booking)
  weeklyAvailability: RawAvailability[]; // ya filtrado por day_of_week + is_available
  locationSchedules: RawLocationSchedule[] | null; // ya filtrado por day_of_week
  specialDays: RawSpecialDay[]; // ya filtrado por rango de fecha
  scheduleExceptions: RawScheduleException[];
  sessions: RawSession[];
  calendarEvents: RawCalendarEvent[];
  timezone?: string;
};

export function buildDayScheduleInput(args: BuildDayInputArgs): DayScheduleInput {
  const tz = args.timezone ?? APP_TZ;

  const weeklyWindows: Interval[] = args.weeklyAvailability.map((a) => ({
    startMin: timeToMinutes(a.start_time),
    endMin: timeToMinutes(a.end_time),
  }));

  const sd = pickApplicableSpecialDay(
    args.specialDays,
    args.date,
    args.professionalId,
    args.isPublicContext,
  );

  let mode: DayMode;
  let specialWindows: Interval[];
  if (sd === null) {
    mode = "weekly";
    specialWindows = [];
  } else {
    mode = sd.type;
    specialWindows = sd.type === "closed" ? [] : specialDayToWindows(sd);
  }

  const locationWindows = buildLocationWindows(args.locationSchedules);

  const busy: BusyBlock[] = [
    ...sessionsToBusy(args.sessions),
    ...calendarEventsToBusy(args.calendarEvents, args.date, tz),
    ...exceptionsToBusy(
      args.scheduleExceptions,
      args.date,
      args.professionalId,
    ),
  ];

  return { mode, weeklyWindows, specialWindows, locationWindows, busy };
}
