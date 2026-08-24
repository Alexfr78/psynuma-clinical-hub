export function assertStripeEnvironment(stripeSecretKey: string): void {
  const configuredEnvironment = (Deno.env.get("STRIPE_ENVIRONMENT") || "").trim().toLowerCase();
  const appBaseUrl = (Deno.env.get("APP_BASE_URL") || Deno.env.get("SITE_URL") || "").toLowerCase();
  const productionEnvironment = configuredEnvironment === "live"
    || appBaseUrl.includes("psycma.psicologosexual.com");

  if (productionEnvironment && !stripeSecretKey.startsWith("sk_live_")) {
    throw new Error("Stripe production is configured with a non-live secret key");
  }

  if (configuredEnvironment === "test" && !stripeSecretKey.startsWith("sk_test_")) {
    throw new Error("Stripe test is configured with a non-test secret key");
  }
}

export function isStripeTestCheckoutId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("cs_test_");
}
