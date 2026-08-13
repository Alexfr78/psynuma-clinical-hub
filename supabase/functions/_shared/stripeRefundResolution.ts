export interface RefundMetadataResolutionInput {
  chargeMetadata?: Record<string, string> | null;
  paymentIntent?: string | { id?: string } | null;
  connectedAccountId?: string | null;
  stripeSecretKey: string;
}

type Fetcher = typeof fetch;

function paymentIntentId(value: RefundMetadataResolutionInput['paymentIntent']): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value.id === 'string') return value.id;
  return null;
}

/**
 * New Checkout flows copy their routing metadata to the PaymentIntent/Charge.
 * Older charges may not have it, so recover the Checkout Session through the
 * PaymentIntent before applying a refund to local records.
 */
export async function resolveRefundMetadata(
  input: RefundMetadataResolutionInput,
  fetcher: Fetcher = fetch,
): Promise<Record<string, string>> {
  const directMetadata = input.chargeMetadata || {};
  if (directMetadata.session_id || directMetadata.debt_id) return directMetadata;

  const intentId = paymentIntentId(input.paymentIntent);
  if (!intentId || !/^pi_[A-Za-z0-9]+$/.test(intentId)) return directMetadata;

  const query = new URLSearchParams({ payment_intent: intentId, limit: '1' });
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.stripeSecretKey}`,
  };
  if (input.connectedAccountId) headers['Stripe-Account'] = input.connectedAccountId;

  const response = await fetcher(`https://api.stripe.com/v1/checkout/sessions?${query}`, {
    headers,
  });
  if (!response.ok) {
    throw new Error(`Stripe Checkout lookup for refund failed (${response.status})`);
  }

  const payload = await response.json() as {
    data?: Array<{ object?: string; metadata?: Record<string, string> | null }>;
  };
  const checkoutSession = payload.data?.[0];
  if (!checkoutSession || checkoutSession.object !== 'checkout.session') return directMetadata;

  return {
    ...(checkoutSession.metadata || {}),
    ...directMetadata,
  };
}
