import {
  SPECIAL_DAY_TYPE_LABELS,
  type SpecialDay,
  type SpecialDayScope,
} from './special-days';

export interface SpecialDayBlockedResult {
  blocked: true;
  reason: string;
  scope: SpecialDayScope;
  specialDay: SpecialDay;
}

function isWithinRange(date: string, sd: SpecialDay): boolean {
  return date >= sd.start_date && date <= sd.end_date;
}

function matchesScope(sd: SpecialDay, professionalId: string | null): boolean {
  if (sd.scope === 'center') return true;
  if (professionalId == null) return false;
  return sd.professional_id === professionalId;
}

function compareForPriority(a: SpecialDay, b: SpecialDay): number {
  if (a.scope !== b.scope) {
    return a.scope === 'professional' ? -1 : 1;
  }
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at ? -1 : 1;
  }
  return a.id > b.id ? -1 : 1;
}

export function getSpecialDaysForDate(
  date: string,
  professionalId: string | null,
  specialDays: SpecialDay[],
): SpecialDay[] {
  return specialDays.filter(
    (sd) => isWithinRange(date, sd) && matchesScope(sd, professionalId),
  );
}

export function pickApplicableSpecialDay(
  date: string,
  professionalId: string | null,
  specialDays: SpecialDay[],
): SpecialDay | null {
  const matches = getSpecialDaysForDate(date, professionalId, specialDays);
  if (matches.length === 0) return null;
  return [...matches].sort(compareForPriority)[0];
}

function timeInsideAnySlot(
  startTime: string,
  endTime: string,
  slots: SpecialDay['special_day_slots'],
): boolean {
  if (!slots || slots.length === 0) return false;
  return slots.some((slot) => {
    const s = slot.start_time.slice(0, 5);
    const e = slot.end_time.slice(0, 5);
    return startTime >= s && endTime <= e;
  });
}

export function getSpecialDayLabel(sd: SpecialDay): string {
  return sd.label?.trim() || SPECIAL_DAY_TYPE_LABELS[sd.type];
}

export function isDateBlockedBySpecialDay(
  date: string,
  startTime: string | null,
  endTime: string | null,
  professionalId: string | null,
  specialDays: SpecialDay[],
): SpecialDayBlockedResult | null {
  const applicable = pickApplicableSpecialDay(date, professionalId, specialDays);
  if (!applicable) return null;

  if (applicable.type === 'extended') return null;

  if (applicable.type === 'closed') {
    return {
      blocked: true,
      reason: getSpecialDayLabel(applicable),
      scope: applicable.scope,
      specialDay: applicable,
    };
  }

  // custom: blocked if the requested window doesn't fit inside any slot
  if (!startTime || !endTime) return null;
  if (timeInsideAnySlot(startTime, endTime, applicable.special_day_slots)) {
    return null;
  }
  return {
    blocked: true,
    reason: getSpecialDayLabel(applicable),
    scope: applicable.scope,
    specialDay: applicable,
  };
}
