import { describe, expect, it } from 'vitest';
import { currentMonthISO, isCustomExpenseRange, monthRange, resolveExpensePeriod } from '../expense-period';

describe('expense-period', () => {
  it('monthRange cubre el mes completo, incluido febrero bisiesto', () => {
    expect(monthRange('2024-02')).toEqual({ start: '2024-02-01', end: '2024-02-29' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  it('sin rango usa el mes', () => {
    expect(resolveExpensePeriod({ month: '2026-09' })).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('el rango completo manda sobre el mes y puede cruzar meses y años', () => {
    expect(resolveExpensePeriod({ month: '2026-09', startDate: '2025-12-20', endDate: '2026-01-10' }))
      .toEqual({ start: '2025-12-20', end: '2026-01-10' });
  });

  it('un rango a medias se ignora y cae al mes', () => {
    expect(resolveExpensePeriod({ month: '2026-09', startDate: '2026-09-10' }))
      .toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(isCustomExpenseRange({ startDate: '2026-09-10' })).toBe(false);
  });

  it('ordena un rango invertido y admite un solo día', () => {
    expect(resolveExpensePeriod({ startDate: '2026-10-05', endDate: '2026-10-01' }))
      .toEqual({ start: '2026-10-01', end: '2026-10-05' });
    expect(resolveExpensePeriod({ startDate: '2026-10-05', endDate: '2026-10-05' }))
      .toEqual({ start: '2026-10-05', end: '2026-10-05' });
  });

  it('sin filtro de fechas devuelve null', () => {
    expect(resolveExpensePeriod({})).toBeNull();
    expect(resolveExpensePeriod(undefined)).toBeNull();
  });

  it('currentMonthISO usa la fecha local', () => {
    expect(currentMonthISO(new Date(2026, 0, 31, 23, 30))).toBe('2026-01');
  });
});
