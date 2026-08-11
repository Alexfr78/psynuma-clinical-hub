import { describe, expect, it } from 'vitest';
import { resolvePaymentRules } from '../../../supabase/functions/_shared/paymentRules';

describe('resolvePaymentRules', () => {
  it('uses the center setting when the patient has no override', () => {
    const result = resolvePaymentRules({
      centerDefaultPaymentMode: 'post_session',
      price: 75,
    });

    expect(result.paymentMode).toBe('post_session');
    expect(result.source).toBe('center');
    expect(result.advancePaymentSendAt).toBeNull();
    expect(result.advancePaymentDueAt).toBeNull();
  });

  it('keeps the patient override above the center setting', () => {
    const result = resolvePaymentRules({
      patientPaymentMode: 'required_now',
      centerDefaultPaymentMode: 'post_session',
      sessionDate: '2026-09-02',
      startTime: '18:00:00',
      price: 75,
    });

    expect(result.paymentMode).toBe('required_now');
    expect(result.source).toBe('patient');
  });

  it('separates the scheduled link time from the payment deadline', () => {
    const result = resolvePaymentRules({
      centerDefaultPaymentMode: 'scheduled_before',
      centerDefaultScheduledHoursBefore: 24,
      centerDefaultAdvancePaymentLimitHours: 12,
      sessionDate: '2026-09-02',
      startTime: '18:00:00',
      price: 75,
    });

    expect(result.advancePaymentSendAt).toBe('2026-09-01T16:00:00.000Z');
    expect(result.advancePaymentDueAt).toBe('2026-09-02T04:00:00.000Z');
  });
});
