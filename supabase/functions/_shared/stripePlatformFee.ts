export const MAX_STRIPE_APPLICATION_FEE_BPS = 10_000;

export interface StripePlatformFeeConfig {
  bps: number;
  version: string;
}

/**
 * Parses the server-controlled Stripe platform fee expressed in basis points.
 * Missing, malformed, negative, or greater-than-100% values fail closed to 0.
 */
export function parseStripeApplicationFeeBps(rawValue: string | null | undefined): number {
  if (!rawValue || !/^\d+$/.test(rawValue.trim())) {
    return 0;
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isSafeInteger(parsed) || parsed > MAX_STRIPE_APPLICATION_FEE_BPS) {
    return 0;
  }

  return parsed;
}

export function getStripePlatformFeeConfig(
  rawValue: string | null | undefined,
): StripePlatformFeeConfig {
  const bps = parseStripeApplicationFeeBps(rawValue);
  return {
    bps,
    version: `bps-${bps}`,
  };
}

export function calculateStripeApplicationFeeAmount(
  amountInCents: number,
  feeBps: number,
): number {
  if (
    !Number.isSafeInteger(amountInCents)
    || amountInCents <= 0
    || !Number.isSafeInteger(feeBps)
    || feeBps <= 0
    || feeBps > MAX_STRIPE_APPLICATION_FEE_BPS
  ) {
    return 0;
  }

  return Math.round((amountInCents * feeBps) / 10_000);
}
