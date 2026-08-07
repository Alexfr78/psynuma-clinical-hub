import { describe, expect, it } from 'vitest';
import { resolvePaymentSettings } from '@/lib/payment-mode';

describe('payment mode compatibility', () => {
  it('normalizes the legacy post_pay value to post_session', () => {
    expect(resolvePaymentSettings({ sessionPaymentMode: 'post_pay' }).paymentMode).toBe('post_session');
  });
});
