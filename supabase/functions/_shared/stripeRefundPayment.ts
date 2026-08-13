export interface StripeRefundProgressInput {
  paymentAmount: number;
  previousRefundedAmount: number;
  stripeAmountRefunded: number;
  chargeFullyRefunded: boolean;
}

export interface StripeRefundProgress {
  refundedAmount: number;
  refundDelta: number;
  fullyRefunded: boolean;
}

export function calculateStripeRefundProgress({
  paymentAmount,
  previousRefundedAmount,
  stripeAmountRefunded,
  chargeFullyRefunded,
}: StripeRefundProgressInput): StripeRefundProgress {
  const safePaymentAmount = Math.max(0, paymentAmount);
  const safePreviousAmount = Math.min(safePaymentAmount, Math.max(0, previousRefundedAmount));
  const reportedAmount = Math.min(safePaymentAmount, Math.max(0, stripeAmountRefunded));
  const refundedAmount = Math.max(safePreviousAmount, reportedAmount);

  return {
    refundedAmount,
    refundDelta: refundedAmount - safePreviousAmount,
    fullyRefunded: chargeFullyRefunded || refundedAmount >= safePaymentAmount,
  };
}
