import { describe, expect, it } from 'vitest';
import {
  calculateStripeApplicationFeeAmount,
  getStripePlatformFeeConfig,
  parseStripeApplicationFeeBps,
} from '../../../supabase/functions/_shared/stripePlatformFee';

describe('Stripe platform fee configuration', () => {
  it.each([undefined, null, '', ' ', '-1', '2.5', 'abc', '10001'])(
    'defaults invalid value %s to zero',
    (rawValue) => {
      expect(parseStripeApplicationFeeBps(rawValue)).toBe(0);
    },
  );

  it('accepts basis points and creates a stable rule version', () => {
    expect(getStripePlatformFeeConfig('250')).toEqual({
      bps: 250,
      version: 'bps-250',
    });
  });

  it('calculates fees in cents using basis points', () => {
    expect(calculateStripeApplicationFeeAmount(6_000, 250)).toBe(150);
    expect(calculateStripeApplicationFeeAmount(5_999, 250)).toBe(150);
  });

  it('returns zero when the fee is disabled or inputs are invalid', () => {
    expect(calculateStripeApplicationFeeAmount(6_000, 0)).toBe(0);
    expect(calculateStripeApplicationFeeAmount(0, 250)).toBe(0);
    expect(calculateStripeApplicationFeeAmount(6_000.5, 250)).toBe(0);
    expect(calculateStripeApplicationFeeAmount(6_000, 10_001)).toBe(0);
  });
});
