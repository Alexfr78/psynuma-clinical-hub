import { describe, expect, it } from 'vitest';
import {
  buildVerificationResponsesPayload,
  getVerificationResponseValue,
  normalizeVerificationCheckboxes,
} from '@/lib/consent-checkboxes';

describe('normalizeVerificationCheckboxes', () => {
  it('derives a stable key from position for legacy plain-string checkboxes', () => {
    expect(normalizeVerificationCheckboxes(['He leído y acepto la política de cancelación'])).toEqual([
      { key: '0', label: 'He leído y acepto la política de cancelación', required: true },
    ]);
  });

  it('keeps the explicit key/label/required of the new object format', () => {
    expect(
      normalizeVerificationCheckboxes([
        { key: 'recording', label: 'Autorizo la grabación', required: true },
      ]),
    ).toEqual([{ key: 'recording', label: 'Autorizo la grabación', required: true }]);
  });

  it('falls back to a positional key when an object item has no key', () => {
    expect(normalizeVerificationCheckboxes([{ label: 'Sin clave' }])).toEqual([
      { key: '0', label: 'Sin clave', required: true },
    ]);
  });

  it('returns an empty array for null, undefined, or non-array jsonb values', () => {
    expect(normalizeVerificationCheckboxes(null)).toEqual([]);
    expect(normalizeVerificationCheckboxes(undefined)).toEqual([]);
    expect(normalizeVerificationCheckboxes('not-an-array')).toEqual([]);
  });
});

describe('getVerificationResponseValue', () => {
  it('treats both boolean and legacy string "true" as granted', () => {
    expect(getVerificationResponseValue({ recording: true }, 'recording')).toBe(true);
    expect(getVerificationResponseValue({ recording: 'true' }, 'recording')).toBe(true);
  });

  it('treats an explicit false or "false" as not granted', () => {
    expect(getVerificationResponseValue({ recording: false }, 'recording')).toBe(false);
    expect(getVerificationResponseValue({ recording: 'false' }, 'recording')).toBe(false);
  });

  it('returns undefined when the key was never answered', () => {
    expect(getVerificationResponseValue({}, 'recording')).toBeUndefined();
    expect(getVerificationResponseValue(null, 'recording')).toBeUndefined();
  });
});

describe('buildVerificationResponsesPayload', () => {
  it('keys the payload by checkbox key, not by position', () => {
    const checkboxes = normalizeVerificationCheckboxes([
      { key: 'recording', label: 'a' },
      { key: 'ai_processing', label: 'b' },
    ]);
    const payload = buildVerificationResponsesPayload(checkboxes, {
      recording: 'authorized',
      ai_processing: 'not_authorized',
    });
    expect(payload).toEqual({ recording: true, ai_processing: false });
  });

  it('omits checkboxes that have not been answered yet', () => {
    const checkboxes = normalizeVerificationCheckboxes([{ key: 'recording', label: 'a' }]);
    expect(buildVerificationResponsesPayload(checkboxes, {})).toEqual({});
  });
});
