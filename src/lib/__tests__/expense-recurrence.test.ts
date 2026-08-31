import { describe, expect, it } from 'vitest';
import {
  computeRecurringExpensePeriod,
  computeRecurringExpenseDueDate,
  type RecurringTemplatePeriodConfig,
} from '@/lib/expense-recurrence';

function baseConfig(overrides: Partial<RecurringTemplatePeriodConfig> = {}): RecurringTemplatePeriodConfig {
  return {
    frequency: 'monthly',
    dayOfPeriod: 1,
    anchorMonth: null,
    startsOn: '2026-01-01',
    endsOn: null,
    lastGeneratedPeriod: null,
    ...overrides,
  };
}

describe('computeRecurringExpensePeriod — monthly', () => {
  it('generates on the configured day of month', () => {
    const config = baseConfig({ dayOfPeriod: 1 });
    expect(computeRecurringExpensePeriod(config, '2026-08-01')).toBe('2026-08-01');
  });

  it('does not generate on a different day of month', () => {
    const config = baseConfig({ dayOfPeriod: 5 });
    expect(computeRecurringExpensePeriod(config, '2026-08-01')).toBeNull();
  });

  it('does not duplicate a period already generated', () => {
    const config = baseConfig({ dayOfPeriod: 1, lastGeneratedPeriod: '2026-08-01' });
    expect(computeRecurringExpensePeriod(config, '2026-08-01')).toBeNull();
  });

  it('generates the next month after a previous period was already generated', () => {
    const config = baseConfig({ dayOfPeriod: 1, lastGeneratedPeriod: '2026-08-01' });
    expect(computeRecurringExpensePeriod(config, '2026-09-01')).toBe('2026-09-01');
  });

  it('respects starts_on — does not generate before the template is active', () => {
    const config = baseConfig({ dayOfPeriod: 1, startsOn: '2026-09-01' });
    expect(computeRecurringExpensePeriod(config, '2026-08-01')).toBeNull();
  });

  it('respects ends_on — does not generate after the template has ended', () => {
    const config = baseConfig({ dayOfPeriod: 1, endsOn: '2026-07-31' });
    expect(computeRecurringExpensePeriod(config, '2026-08-01')).toBeNull();
  });
});

describe('computeRecurringExpensePeriod — quarterly', () => {
  it('generates on months matching the anchor cadence', () => {
    const config = baseConfig({ frequency: 'quarterly', dayOfPeriod: 1, anchorMonth: 1 });
    expect(computeRecurringExpensePeriod(config, '2026-01-01')).toBe('2026-01-01');
    expect(computeRecurringExpensePeriod(config, '2026-04-01')).toBe('2026-04-01');
    expect(computeRecurringExpensePeriod(config, '2026-07-01')).toBe('2026-07-01');
    expect(computeRecurringExpensePeriod(config, '2026-10-01')).toBe('2026-10-01');
  });

  it('does not generate on months outside the anchor cadence', () => {
    const config = baseConfig({ frequency: 'quarterly', dayOfPeriod: 1, anchorMonth: 1 });
    expect(computeRecurringExpensePeriod(config, '2026-02-01')).toBeNull();
    expect(computeRecurringExpensePeriod(config, '2026-05-01')).toBeNull();
  });

  it('honors a non-January anchor month', () => {
    const config = baseConfig({ frequency: 'quarterly', dayOfPeriod: 15, anchorMonth: 2 });
    expect(computeRecurringExpensePeriod(config, '2026-02-15')).toBe('2026-02-01');
    expect(computeRecurringExpensePeriod(config, '2026-05-15')).toBe('2026-05-01');
    expect(computeRecurringExpensePeriod(config, '2026-03-15')).toBeNull();
  });
});

describe('computeRecurringExpensePeriod — yearly', () => {
  it('generates only in the anchor month', () => {
    const config = baseConfig({ frequency: 'yearly', dayOfPeriod: 10, anchorMonth: 6 });
    expect(computeRecurringExpensePeriod(config, '2026-06-10')).toBe('2026-06-01');
    expect(computeRecurringExpensePeriod(config, '2027-06-10')).toBe('2027-06-01');
    expect(computeRecurringExpensePeriod(config, '2026-07-10')).toBeNull();
  });
});

describe('computeRecurringExpenseDueDate', () => {
  it('adds the default offset in days', () => {
    expect(computeRecurringExpenseDueDate('2026-08-01')).toBe('2026-08-08');
  });

  it('rolls over into the next month correctly', () => {
    expect(computeRecurringExpenseDueDate('2026-08-28', 7)).toBe('2026-09-04');
  });

  it('supports a custom offset', () => {
    expect(computeRecurringExpenseDueDate('2026-08-01', 30)).toBe('2026-08-31');
  });
});
