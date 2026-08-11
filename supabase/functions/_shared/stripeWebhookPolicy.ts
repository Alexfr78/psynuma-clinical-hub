export type StripePaymentOutcome = "expired" | "failed" | "refunded";

const PAYMENT_OUTCOMES: Readonly<Record<string, StripePaymentOutcome>> = {
  "checkout.session.expired": "expired",
  "payment_intent.payment_failed": "failed",
  "charge.refunded": "refunded",
};

export function getStripePaymentOutcome(eventType: string): StripePaymentOutcome | null {
  return PAYMENT_OUTCOMES[eventType] ?? null;
}

/**
 * A claimed event is normally a no-op. The only exception is a completed
 * Checkout whose previous processing attempt left local payment state
 * incomplete; that event is deliberately reopened for reconciliation.
 */
export function shouldReprocessClaimedStripeEvent(
  eventType: string,
  localStateNeedsReconciliation: boolean,
): boolean {
  return eventType === "checkout.session.completed" && localStateNeedsReconciliation;
}
