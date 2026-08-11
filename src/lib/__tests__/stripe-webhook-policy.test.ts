import { describe, expect, it } from 'vitest';
import {
  getStripePaymentOutcome,
  shouldReprocessClaimedStripeEvent,
} from '../../../supabase/functions/_shared/stripeWebhookPolicy';

describe('Stripe webhook policy', () => {
  it.each([
    ['checkout.session.expired', 'expired'],
    ['payment_intent.payment_failed', 'failed'],
    ['charge.refunded', 'refunded'],
  ] as const)('maps %s to %s', (eventType, outcome) => {
    expect(getStripePaymentOutcome(eventType)).toBe(outcome);
  });

  it('does not assign an error outcome to a completed Checkout', () => {
    expect(getStripePaymentOutcome('checkout.session.completed')).toBeNull();
  });

  it('prevents duplicate side effects for an already claimed event', () => {
    expect(shouldReprocessClaimedStripeEvent('charge.refunded', true)).toBe(false);
    expect(shouldReprocessClaimedStripeEvent('checkout.session.completed', false)).toBe(false);
  });

  it('allows reconciliation only for an incompletely processed successful Checkout', () => {
    expect(shouldReprocessClaimedStripeEvent('checkout.session.completed', true)).toBe(true);
  });
});
