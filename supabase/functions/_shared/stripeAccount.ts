// Cuenta Stripe en la que se cobra.
//
// Por defecto cada profesional cobra en su cuenta Connect (`acct_…`) y todas
// las llamadas llevan la cabecera `Stripe-Account`. Un centro con
// `centers.stripe_charge_mode = 'platform'` cobra directamente en la cuenta
// principal de la plataforma: su conexión guarda este valor en lugar de un
// `acct_…` y las llamadas van sin cabecera. Los triggers de la base impiden
// guardar este valor fuera de un centro en modo plataforma.
export const STRIPE_PLATFORM_ACCOUNT = "platform";

export function isStripePlatformAccount(accountId: string | null | undefined): boolean {
  return accountId === STRIPE_PLATFORM_ACCOUNT;
}

export function stripeAccountHeaders(accountId: string | null | undefined): Record<string, string> {
  return accountId && !isStripePlatformAccount(accountId) ? { "Stripe-Account": accountId } : {};
}
