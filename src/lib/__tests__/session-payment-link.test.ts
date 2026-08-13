import { describe, expect, it } from 'vitest';
import { getPaymentLinkUrlForSession } from '@/lib/session-payment-link';

describe('session payment link', () => {
  it('only exposes a generated link for the session that owns it', () => {
    const paymentLink = {
      sessionId: 'session-27-aug',
      url: 'https://checkout.stripe.com/expired-link',
    };

    expect(getPaymentLinkUrlForSession(paymentLink, 'session-27-aug')).toBe(paymentLink.url);
    expect(getPaymentLinkUrlForSession(paymentLink, 'session-31-aug')).toBeNull();
  });

  it('does not expose a link without an active session', () => {
    expect(getPaymentLinkUrlForSession(null, 'session-31-aug')).toBeNull();
    expect(
      getPaymentLinkUrlForSession(
        { sessionId: 'session-31-aug', url: 'https://checkout.stripe.com/new-link' },
        undefined,
      ),
    ).toBeNull();
  });
});
