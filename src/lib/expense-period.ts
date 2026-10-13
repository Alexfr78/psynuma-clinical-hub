/**
 * Periodo de consulta del módulo de Gastos.
 *
 * Por defecto se consulta por mes ('YYYY-MM'). Si el usuario elige un rango
 * personalizado (startDate + endDate, ambos 'yyyy-MM-dd'), el rango manda.
 * `expense_date` es una columna `date`, así que comparamos strings
 * 'yyyy-MM-dd' (inclusivo en ambos extremos) y no hay líos de zona horaria.
 */

export interface ExpensePeriodInput {
  month?: string; // 'YYYY-MM'
  startDate?: string; // 'yyyy-MM-dd'
  endDate?: string; // 'yyyy-MM-dd'
}

export interface ExpensePeriod {
  start: string;
  end: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

export function currentMonthISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month: string): ExpensePeriod {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Periodo efectivo: rango personalizado si es válido; si no, el mes. Null si no hay filtro de fechas. */
export function resolveExpensePeriod(input?: ExpensePeriodInput): ExpensePeriod | null {
  if (input?.startDate && input?.endDate && ISO_DATE.test(input.startDate) && ISO_DATE.test(input.endDate)) {
    return input.startDate <= input.endDate
      ? { start: input.startDate, end: input.endDate }
      : { start: input.endDate, end: input.startDate };
  }
  if (input?.month && ISO_MONTH.test(input.month)) return monthRange(input.month);
  return null;
}

export function isCustomExpenseRange(input?: ExpensePeriodInput): boolean {
  return !!(input?.startDate && input?.endDate);
}
