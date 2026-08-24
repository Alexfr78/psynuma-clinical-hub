import { describe, expect, it, vi } from 'vitest';
import {
  buildConnectedCheckoutIdempotencyKey,
  buildConnectedCheckoutRequest,
  canReuseConnectedCheckoutSession,
  createConnectedCheckoutSession,
  expireConnectedCheckoutSession,
  retrieveConnectedCheckoutSession,
  selectPaymentProfessionalId,
  StripeCheckoutRequestError,
} from '../../../supabase/functions/_shared/stripeConnectedCheckout';

const baseInput = {
  stripeSecretKey: 'sk_test_example',
  connectedAccountId: 'acct_connected',
  successUrl: 'https://example.test/success',
  cancelUrl: 'https://example.test/cancel',
  customerEmail: 'patient@example.test',
  lineItem: {
    name: 'Sesión clínica',
    description: 'Pago de prueba',
    amountInCents: 7_500,
  },
  metadata: {
    payment_type: 'debt_payment',
    debt_id: 'debt-1',
  },
  applicationFeeBpsRaw: '0',
  idempotencyKey: 'debt-checkout-debt-1-7500-bps-0',
};

describe('connected Stripe Checkout', () => {
  it('creates a direct charge on the professional account with no platform fee', () => {
    const request = buildConnectedCheckoutRequest(baseInput);

    expect(request.headers['Stripe-Account']).toBe('acct_connected');
    expect(request.headers['Idempotency-Key']).toBe(baseInput.idempotencyKey);
    expect(request.body.get('metadata[payment_type]')).toBe('debt_payment');
    expect(request.body.get('payment_intent_data[metadata][debt_id]')).toBe('debt-1');
    expect(request.body.get('metadata[platform_fee_bps]')).toBe('0');
    expect(request.body.has('payment_intent_data[application_fee_amount]')).toBe(false);
  });

  it('applies the same explicit fee rule to session, debt and bono metadata', () => {
    for (const paymentType of ['session_payment', 'debt_payment', 'bono_purchase']) {
      const request = buildConnectedCheckoutRequest({
        ...baseInput,
        metadata: { payment_type: paymentType },
        applicationFeeBpsRaw: '250',
      });

      expect(request.body.get('metadata[payment_type]')).toBe(paymentType);
      expect(request.body.get('payment_intent_data[application_fee_amount]')).toBe('188');
      expect(request.body.get('metadata[platform_fee_rule_version]')).toBe('bps-250');
    }
  });

  it('normalizes invalid fee configuration in idempotency keys', () => {
    expect(buildConnectedCheckoutIdempotencyKey('debt', 'debt-1', 7_500, 'invalid')).toBe(
      'debt-checkout-debt-1-7500-bps-0',
    );
  });

  it('routes money to the session professional, then patient assignment, then center default', () => {
    expect(selectPaymentProfessionalId('session-pro', 'patient-pro', 'center-pro')).toBe('session-pro');
    expect(selectPaymentProfessionalId(null, 'patient-pro', 'center-pro')).toBe('patient-pro');
    expect(selectPaymentProfessionalId(null, null, 'center-pro')).toBe('center-pro');
    expect(selectPaymentProfessionalId(null, null, null)).toBeNull();
  });

  it('returns the Checkout identifiers from Stripe', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/c/pay/cs_test_123',
    }), { status: 200 }));

    await expect(createConnectedCheckoutSession(baseInput, fetcher)).resolves.toEqual({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/c/pay/cs_test_123',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('surfaces a Stripe creation error without exposing credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'Connected account is not available' },
    }), { status: 400 }));

    await expect(createConnectedCheckoutSession(baseInput, fetcher)).rejects.toEqual(
      new StripeCheckoutRequestError('Connected account is not available'),
    );
  });
});

describe('stale checkout reuse guard (60 EUR -> 1 EUR)', () => {
  const openCheckout = (amountTotal: number | null) => ({
    id: 'cs_live_stale',
    status: 'open' as string | null,
    payment_status: 'unpaid' as string | null,
    url: 'https://checkout.stripe.com/c/pay/cs_live_stale',
    amount_total: amountTotal,
    currency: 'eur' as string | null,
  });

  it('reuses the stored checkout when the amount still matches', () => {
    expect(canReuseConnectedCheckoutSession(openCheckout(6_000), 6_000)).toBe(true);
  });

  it('does not reuse a 60 EUR checkout when the session price dropped to 1 EUR', () => {
    expect(canReuseConnectedCheckoutSession(openCheckout(6_000), 100)).toBe(false);
  });

  it('does not reuse checkouts without url, without amount or not open', () => {
    expect(canReuseConnectedCheckoutSession(null, 100)).toBe(false);
    expect(canReuseConnectedCheckoutSession(openCheckout(null), 100)).toBe(false);
    expect(
      canReuseConnectedCheckoutSession({ ...openCheckout(100), status: 'complete' }, 100),
    ).toBe(false);
    expect(
      canReuseConnectedCheckoutSession({ ...openCheckout(100), url: null }, 100),
    ).toBe(false);
  });

  it('reads amount_total and currency from the Stripe lookup', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'cs_live_stale',
        status: 'open',
        payment_status: 'unpaid',
        url: 'https://checkout.stripe.com/c/pay/cs_live_stale',
        amount_total: 6_000,
        currency: 'eur',
      }),
    });

    const state = await retrieveConnectedCheckoutSession(
      'sk_test_example', 'acct_connected', 'cs_live_stale', fetcher as unknown as typeof fetch,
    );

    expect(state?.amount_total).toBe(6_000);
    expect(state?.currency).toBe('eur');
    expect(canReuseConnectedCheckoutSession(state, 100)).toBe(false);
  });

  it('expires the stale checkout on the connected account', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const expired = await expireConnectedCheckoutSession(
      'sk_test_example', 'acct_connected', 'cs_live_stale', fetcher as unknown as typeof fetch,
    );
    expect(expired).toBe(true);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions/cs_live_stale/expire');
    expect(init.method).toBe('POST');
    expect(init.headers['Stripe-Account']).toBe('acct_connected');
  });

  it('reports failure when Stripe refuses to expire the checkout', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    await expect(expireConnectedCheckoutSession(
      'sk_test_example', 'acct_connected', 'cs_live_stale', fetcher as unknown as typeof fetch,
    )).resolves.toBe(false);
  });
});
