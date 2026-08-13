import { describe, expect, it } from 'vitest';
import {
  calculateNetPaymentStats,
  getNetPaymentAmount,
  getPaymentRefundState,
} from '@/lib/payment-refunds';
import { calculateStripeRefundProgress } from '../../../supabase/functions/_shared/stripeRefundPayment';

describe('payment refunds', () => {
  it('keeps fully refunded payments in history with a zero net amount', () => {
    const payment = { amount: 195, status: 'refunded' as const, refunded_amount: 195 };

    expect(getPaymentRefundState(payment)).toBe('refunded');
    expect(getNetPaymentAmount(payment)).toBe(0);
  });

  it('represents partial refunds without losing the original payment', () => {
    const payment = { amount: 75, status: 'paid' as const, refunded_amount: 25 };

    expect(getPaymentRefundState(payment)).toBe('partial');
    expect(getNetPaymentAmount(payment)).toBe(50);
  });

  it('excludes full refunds and subtracts partial refunds from collected totals', () => {
    const stats = calculateNetPaymentStats([
      { amount: 75, status: 'paid' as const, refunded_amount: 0, payment_method: 'stripe' },
      { amount: 195, status: 'refunded' as const, refunded_amount: 195, payment_method: 'stripe' },
      { amount: 60, status: 'paid' as const, refunded_amount: 10, payment_method: 'card' },
    ]);

    expect(stats.totalAmount).toBe(125);
    expect(stats.refundedAmount).toBe(205);
    expect(stats.count).toBe(2);
    expect(stats.byMethod).toEqual({ stripe: 75, card: 50 });
  });

  it('subtracts only the new amount when Stripe reports cumulative partial refunds', () => {
    const secondRefund = calculateStripeRefundProgress({
      paymentAmount: 75,
      previousRefundedAmount: 10,
      stripeAmountRefunded: 25,
      chargeFullyRefunded: false,
    });
    const repeatedEvent = calculateStripeRefundProgress({
      paymentAmount: 75,
      previousRefundedAmount: 25,
      stripeAmountRefunded: 25,
      chargeFullyRefunded: false,
    });

    expect(secondRefund).toEqual({ refundedAmount: 25, refundDelta: 15, fullyRefunded: false });
    expect(repeatedEvent.refundDelta).toBe(0);
  });
});
