import { describe, expect, it } from 'vitest';
import { decideThreeWayScheduleSync } from '../../../supabase/functions/_shared/googleThreeWaySync';

const baseline = { date: '2026-07-20', start: '10:00', end: '11:00' };

describe('Google Calendar three-way schedule sync', () => {
  it('accepts a unilateral Google change', () => {
    expect(decideThreeWayScheduleSync(
      baseline,
      baseline,
      { date: '2026-07-21', start: '15:00', end: '16:00' },
    )).toBe('accept_google');
  });

  it('pushes a unilateral Psycma change', () => {
    expect(decideThreeWayScheduleSync(
      baseline,
      { date: '2026-07-20', start: '12:00', end: '13:00' },
      baseline,
    )).toBe('push_psycma');
  });

  it('does not overwrite simultaneous divergent changes', () => {
    expect(decideThreeWayScheduleSync(
      baseline,
      { date: '2026-07-20', start: '12:00', end: '13:00' },
      { date: '2026-07-22', start: '09:00', end: '10:00' },
    )).toBe('conflict');
  });

  it('accepts simultaneous changes that converge to the same value', () => {
    const same = { date: '2026-07-22', start: '09:00:00', end: '10:00:00' };
    expect(decideThreeWayScheduleSync(baseline, same, same)).toBe('already_converged');
  });
});
