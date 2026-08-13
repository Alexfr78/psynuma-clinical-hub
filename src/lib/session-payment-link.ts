export interface SessionPaymentLink {
  sessionId: string;
  url: string;
}

export function getPaymentLinkUrlForSession(
  paymentLink: SessionPaymentLink | null,
  sessionId: string | undefined,
): string | null {
  if (!paymentLink || !sessionId || paymentLink.sessionId !== sessionId) {
    return null;
  }

  return paymentLink.url;
}
