export interface CalendarSchedule {
  date: string;
  start: string;
  end: string;
}

export type ThreeWayScheduleDecision =
  | 'noop'
  | 'accept_google'
  | 'push_psycma'
  | 'already_converged'
  | 'conflict';

function normalizeTime(value: string): string {
  return value.slice(0, 5);
}

export function normalizeSchedule(schedule: CalendarSchedule): CalendarSchedule {
  return {
    date: schedule.date,
    start: normalizeTime(schedule.start),
    end: normalizeTime(schedule.end),
  };
}

export function schedulesEqual(a: CalendarSchedule, b: CalendarSchedule): boolean {
  const left = normalizeSchedule(a);
  const right = normalizeSchedule(b);
  return left.date === right.date && left.start === right.start && left.end === right.end;
}

/**
 * Resolves a schedule with a three-way merge. The baseline is the last value
 * confirmed by both systems, so unrelated updated_at changes never decide who wins.
 */
export function decideThreeWayScheduleSync(
  baseline: CalendarSchedule,
  psycma: CalendarSchedule,
  google: CalendarSchedule,
): ThreeWayScheduleDecision {
  const psycmaChanged = !schedulesEqual(psycma, baseline);
  const googleChanged = !schedulesEqual(google, baseline);

  if (!psycmaChanged && !googleChanged) return 'noop';
  if (!psycmaChanged && googleChanged) return 'accept_google';
  if (psycmaChanged && !googleChanged) return 'push_psycma';
  if (schedulesEqual(psycma, google)) return 'already_converged';
  return 'conflict';
}
