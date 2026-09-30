import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INDICATOR_VISIBILITY,
  getSessionFlags,
  mergeIndicatorVisibility,
  parseIndicatorVisibility,
} from '../agenda-indicators';

describe('parseIndicatorVisibility', () => {
  it('uses defaults when nothing is stored', () => {
    expect(parseIndicatorVisibility(undefined)).toEqual(DEFAULT_INDICATOR_VISIBILITY);
    expect(parseIndicatorVisibility({})).toEqual(DEFAULT_INDICATOR_VISIBILITY);
    expect(parseIndicatorVisibility('garbage')).toEqual(DEFAULT_INDICATOR_VISIBILITY);
  });

  it('keeps the existing icons on and the new ones off by default', () => {
    expect(DEFAULT_INDICATOR_VISIBILITY.payment).toBe(true);
    expect(DEFAULT_INDICATOR_VISIBILITY.cancellation_policy).toBe(true);
    expect(DEFAULT_INDICATOR_VISIBILITY.recurring).toBe(true);
    expect(DEFAULT_INDICATOR_VISIBILITY.modality).toBe(false);
    expect(DEFAULT_INDICATOR_VISIBILITY.couple).toBe(false);
  });

  it('applies stored booleans and ignores invalid values and unknown keys', () => {
    const result = parseIndicatorVisibility({
      indicators: { payment: false, modality: true, notes: 'yes', unknown: true },
    });
    expect(result.payment).toBe(false);
    expect(result.modality).toBe(true);
    expect(result.notes).toBe(DEFAULT_INDICATOR_VISIBILITY.notes);
    expect(result).not.toHaveProperty('unknown');
  });
});

describe('mergeIndicatorVisibility', () => {
  it('preserves other preference keys', () => {
    const merged = mergeIndicatorVisibility({ other: 1, indicators: { payment: true } }, {
      ...DEFAULT_INDICATOR_VISIBILITY,
      payment: false,
    });
    expect(merged.other).toBe(1);
    expect((merged.indicators as Record<string, boolean>).payment).toBe(false);
  });
});

describe('getSessionFlags', () => {
  it('detects online, couple, notes, reminder and Google sync', () => {
    const flags = getSessionFlags({
      recurring_series_id: 'r1',
      session_modality: 'zoom',
      notes: 'Traer informe',
      reminder_sent_at: '2026-09-30T10:00:00Z',
      google_calendar_event_id: 'g1',
      participants: [{ patient_id: 'p2' }],
    });
    expect(flags).toEqual({
      recurring: true,
      online: true,
      couple: true,
      notes: true,
      reminder: true,
      googleSync: true,
    });
  });

  it('treats in-person sessions without extras as having no flags', () => {
    const flags = getSessionFlags({ session_modality: 'in_person', notes: '   ', participants: [] });
    expect(Object.values(flags).every((value) => value === false)).toBe(true);
  });

  it('does not count imported Google block titles as notes', () => {
    expect(getSessionFlags({ notes: '[Google Calendar] Médico' }).notes).toBe(false);
  });
});
