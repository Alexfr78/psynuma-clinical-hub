/**
 * Pure logic for computing when a recurring expense template
 * (`expense_recurring_templates`) should generate its next `expenses` row.
 *
 * Mirrors the pseudocode in the expense module design doc (section 3.1) and
 * is called both conceptually by the `generate-recurring-expenses` edge
 * function (Deno, logic duplicated there — see that file) and tested here in
 * isolation so the period-boundary math can be verified without a database.
 *
 * All dates are plain ISO strings ('YYYY-MM-DD') to avoid timezone-related
 * off-by-one bugs when comparing to the server's UTC clock, consistent with
 * the rest of the project's crons (none of which do explicit TZ handling).
 */

export type ExpenseRecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface RecurringTemplatePeriodConfig {
  frequency: ExpenseRecurrenceFrequency;
  /** Day of the month (1-28) the annotation should be generated on. */
  dayOfPeriod: number;
  /** Month (1-12) anchoring the quarterly/yearly cycle. Ignored for 'monthly'. */
  anchorMonth: number | null;
  /** First day the template is active (inclusive), 'YYYY-MM-DD'. */
  startsOn: string;
  /** Last day the template is active (inclusive), or null for indefinite. */
  endsOn: string | null;
  /** First day of the last period already generated, or null if never generated. */
  lastGeneratedPeriod: string | null;
}

interface ParsedDate {
  y: number;
  m: number; // 1-12
  d: number;
}

function parseISODate(iso: string): ParsedDate {
  const [y, m, d] = iso.split('-').map((part) => parseInt(part, 10));
  return { y, m, d };
}

function toISODate(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** True if `periodStart` has already been generated according to `lastGeneratedPeriod`. */
function isAlreadyGenerated(lastGeneratedPeriod: string | null, periodStart: string): boolean {
  return !!lastGeneratedPeriod && lastGeneratedPeriod >= periodStart;
}

/**
 * Given a template's recurrence config and today's date (server clock, as an
 * ISO date string), returns the first day of the period that should be
 * generated today, or null if nothing should be generated today (wrong day
 * of month, wrong anchor month, outside the active window, or already
 * generated).
 */
export function computeRecurringExpensePeriod(
  config: RecurringTemplatePeriodConfig,
  todayISO: string,
): string | null {
  if (todayISO < config.startsOn) return null;
  if (config.endsOn && todayISO > config.endsOn) return null;

  const today = parseISODate(todayISO);
  if (today.d !== config.dayOfPeriod) return null;

  if (config.frequency === 'monthly') {
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(config.lastGeneratedPeriod, periodStart) ? null : periodStart;
  }

  if (config.frequency === 'quarterly') {
    const anchor = config.anchorMonth ?? 1;
    const diff = ((today.m - anchor) % 3 + 3) % 3;
    if (diff !== 0) return null;
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(config.lastGeneratedPeriod, periodStart) ? null : periodStart;
  }

  if (config.frequency === 'yearly') {
    const anchor = config.anchorMonth ?? 1;
    if (today.m !== anchor) return null;
    const periodStart = toISODate(today.y, today.m, 1);
    return isAlreadyGenerated(config.lastGeneratedPeriod, periodStart) ? null : periodStart;
  }

  return null;
}

/** Default due date offset (days after the period start) used when generating. */
export const DEFAULT_RECURRING_EXPENSE_DUE_DAYS = 7;

export function computeRecurringExpenseDueDate(periodStartISO: string, offsetDays = DEFAULT_RECURRING_EXPENSE_DUE_DAYS): string {
  const { y, m, d } = parseISODate(periodStartISO);
  // Use UTC Date arithmetic purely for the +N days offset; inputs/outputs stay as ISO date strings.
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return toISODate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}
