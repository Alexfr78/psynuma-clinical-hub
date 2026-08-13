export interface PaymentRefundFields {
  amount: number | string;
  status?: string | null;
  refunded_amount?: number | string | null;
}

export function getRefundedAmount(payment: PaymentRefundFields): number {
  const amount = Math.max(0, Number(payment.amount) || 0);
  const refundedAmount = Math.max(0, Number(payment.refunded_amount) || 0);
  return Math.min(amount, refundedAmount);
}

export function getNetPaymentAmount(payment: PaymentRefundFields): number {
  return Math.max(0, (Number(payment.amount) || 0) - getRefundedAmount(payment));
}

export function getPaymentRefundState(payment: PaymentRefundFields): 'paid' | 'partial' | 'refunded' {
  const refundedAmount = getRefundedAmount(payment);
  if (payment.status === 'refunded' || refundedAmount >= Number(payment.amount)) return 'refunded';
  if (refundedAmount > 0) return 'partial';
  return 'paid';
}

export function calculateNetPaymentStats<T extends PaymentRefundFields & { payment_method?: string | null }>(
  payments: T[],
) {
  return payments.reduce((stats, payment) => {
    const netAmount = getNetPaymentAmount(payment);
    const method = payment.payment_method || 'cash';

    stats.grossAmount += Math.max(0, Number(payment.amount) || 0);
    stats.grossCount += 1;
    stats.totalAmount += netAmount;
    stats.refundedAmount += getRefundedAmount(payment);
    stats.byMethod[method] = (stats.byMethod[method] || 0) + netAmount;
    if (netAmount > 0) stats.count += 1;

    return stats;
  }, {
    grossAmount: 0,
    grossCount: 0,
    totalAmount: 0,
    refundedAmount: 0,
    byMethod: {} as Record<string, number>,
    count: 0,
  });
}
