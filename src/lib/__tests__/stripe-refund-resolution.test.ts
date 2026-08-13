import { describe, expect, it, vi } from 'vitest';
import { resolveRefundMetadata } from '../../../supabase/functions/_shared/stripeRefundResolution';

describe('Stripe refund metadata resolution', () => {
  it('uses charge metadata without calling Stripe for new payments', async () => {
    const fetcher = vi.fn();

    await expect(resolveRefundMetadata({
      chargeMetadata: { session_id: 'session-1', payment_type: 'session_payment' },
      paymentIntent: 'pi_test1',
      connectedAccountId: 'acct_connected',
      stripeSecretKey: 'sk_test_example',
    }, fetcher)).resolves.toEqual({
      session_id: 'session-1',
      payment_type: 'session_payment',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('recovers legacy metadata from Checkout using the connected PaymentIntent', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        object: 'checkout.session',
        metadata: { session_id: 'session-legacy', payment_type: 'session_payment' },
      }],
    }), { status: 200 }));

    await expect(resolveRefundMetadata({
      chargeMetadata: {},
      paymentIntent: 'pi_testlegacy',
      connectedAccountId: 'acct_connected',
      stripeSecretKey: 'sk_test_example',
    }, fetcher)).resolves.toEqual({
      session_id: 'session-legacy',
      payment_type: 'session_payment',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions?payment_intent=pi_testlegacy&limit=1',
      { headers: {
        Authorization: 'Bearer sk_test_example',
        'Stripe-Account': 'acct_connected',
      } },
    );
  });

  it('fails for a Stripe lookup error so the webhook can be retried', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(resolveRefundMetadata({
      chargeMetadata: {},
      paymentIntent: { id: 'pi_testretry' },
      stripeSecretKey: 'sk_test_example',
    }, fetcher)).rejects.toThrow('Stripe Checkout lookup for refund failed (503)');
  });
});
