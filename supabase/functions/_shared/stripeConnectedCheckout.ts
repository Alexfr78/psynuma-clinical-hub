import {
  calculateStripeApplicationFeeAmount,
  getStripePlatformFeeConfig,
} from "./stripePlatformFee.ts";

export interface ConnectedCheckoutLineItem {
  name: string;
  description: string;
  amountInCents: number;
}

export interface ConnectedCheckoutInput {
  stripeSecretKey: string;
  connectedAccountId: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
  lineItem: ConnectedCheckoutLineItem;
  metadata: Record<string, string | number | null | undefined>;
  applicationFeeBpsRaw: string | null | undefined;
  idempotencyKey: string;
}

export interface ConnectedCheckoutRequest {
  body: URLSearchParams;
  headers: Record<string, string>;
  applicationFeeAmount: number;
  platformFeeBps: number;
  platformFeeVersion: string;
}

export interface ConnectedCheckoutResult {
  id: string;
  url: string;
}

export class StripeCheckoutRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeCheckoutRequestError";
  }
}

export function selectPaymentProfessionalId(
  sessionProfessionalId: string | null | undefined,
  patientProfessionalId: string | null | undefined,
  centerDefaultProfessionalId: string | null | undefined,
): string | null {
  return sessionProfessionalId || patientProfessionalId || centerDefaultProfessionalId || null;
}

export function buildConnectedCheckoutIdempotencyKey(
  scope: "session" | "debt" | "bono",
  entityKey: string,
  amountInCents: number,
  applicationFeeBpsRaw: string | null | undefined,
): string {
  const feeVersion = getStripePlatformFeeConfig(applicationFeeBpsRaw).version;
  return `${scope}-checkout-${entityKey}-${amountInCents}-${feeVersion}`;
}

export function buildConnectedCheckoutRequest(
  input: ConnectedCheckoutInput,
): ConnectedCheckoutRequest {
  if (!Number.isSafeInteger(input.lineItem.amountInCents) || input.lineItem.amountInCents <= 0) {
    throw new Error("Checkout amount must be a positive integer in cents");
  }

  const platformFee = getStripePlatformFeeConfig(input.applicationFeeBpsRaw);
  const applicationFeeAmount = calculateStripeApplicationFeeAmount(
    input.lineItem.amountInCents,
    platformFee.bps,
  );

  const body = new URLSearchParams({
    mode: "payment",
    "payment_method_types[0]": "card",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(input.lineItem.amountInCents),
    "line_items[0][price_data][product_data][name]": input.lineItem.name,
    "line_items[0][price_data][product_data][description]": input.lineItem.description,
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "metadata[platform_fee_bps]": String(platformFee.bps),
    "metadata[platform_fee_amount]": String(applicationFeeAmount),
    "metadata[platform_fee_rule_version]": platformFee.version,
  });

  if (input.customerEmail) {
    body.set("customer_email", input.customerEmail);
  }

  for (const [key, value] of Object.entries(input.metadata)) {
    if (value !== null && value !== undefined) {
      body.set(`metadata[${key}]`, String(value));
      body.set(`payment_intent_data[metadata][${key}]`, String(value));
    }
  }

  body.set("payment_intent_data[metadata][platform_fee_bps]", String(platformFee.bps));
  body.set("payment_intent_data[metadata][platform_fee_amount]", String(applicationFeeAmount));
  body.set("payment_intent_data[metadata][platform_fee_rule_version]", platformFee.version);

  // Omitting a zero fee prevents Stripe from creating an application-fee
  // object while still recording the server-side rule in Checkout metadata.
  if (applicationFeeAmount > 0) {
    body.set("payment_intent_data[application_fee_amount]", String(applicationFeeAmount));
  }

  return {
    body,
    headers: {
      Authorization: `Bearer ${input.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": input.connectedAccountId,
      "Idempotency-Key": input.idempotencyKey,
    },
    applicationFeeAmount,
    platformFeeBps: platformFee.bps,
    platformFeeVersion: platformFee.version,
  };
}

export async function createConnectedCheckoutSession(
  input: ConnectedCheckoutInput,
  fetcher: typeof fetch = fetch,
): Promise<ConnectedCheckoutResult> {
  const request = buildConnectedCheckoutRequest(input);
  const response = await fetcher("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  const payload = await response.json() as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.id || !payload.url) {
    throw new StripeCheckoutRequestError(
      payload.error?.message || "Stripe Checkout creation failed",
    );
  }

  return { id: payload.id, url: payload.url };
}

// ============================================================
// Checkout en modo `setup` — guarda una tarjeta (SetupIntent
// usage:off_session) en la cuenta conectada, sin mover dinero.
// Se usa para el mandato de cargos por cancelación (Fase 2).
// ============================================================

export interface ConnectedSetupSessionInput {
  stripeSecretKey: string;
  connectedAccountId: string;
  successUrl: string;
  cancelUrl: string;
  // Cliente existente en la cuenta conectada (para reutilizar tarjeta). Si no
  // se pasa, Stripe Checkout crea uno y lo devuelve en el SetupIntent.
  customerId?: string | null;
  customerEmail?: string | null;
  metadata: Record<string, string | number | null | undefined>;
  idempotencyKey: string;
}

export function buildConnectedSetupRequest(
  input: ConnectedSetupSessionInput,
): { body: URLSearchParams; headers: Record<string, string> } {
  const body = new URLSearchParams({
    mode: "setup",
    "payment_method_types[0]": "card",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "setup_intent_data[usage]": "off_session",
  });

  if (input.customerId) {
    body.set("customer", input.customerId);
  } else if (input.customerEmail) {
    body.set("customer_email", input.customerEmail);
  }

  for (const [key, value] of Object.entries(input.metadata)) {
    if (value !== null && value !== undefined) {
      body.set(`metadata[${key}]`, String(value));
      body.set(`setup_intent_data[metadata][${key}]`, String(value));
    }
  }

  return {
    body,
    headers: {
      Authorization: `Bearer ${input.stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": input.connectedAccountId,
      "Idempotency-Key": input.idempotencyKey,
    },
  };
}

export async function createConnectedSetupSession(
  input: ConnectedSetupSessionInput,
  fetcher: typeof fetch = fetch,
): Promise<ConnectedCheckoutResult> {
  const request = buildConnectedSetupRequest(input);
  const response = await fetcher("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
  const payload = await response.json() as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.id || !payload.url) {
    throw new StripeCheckoutRequestError(
      payload.error?.message || "Stripe setup session creation failed",
    );
  }

  return { id: payload.id, url: payload.url };
}
