// Shared helpers for adding advance-payment instructions to session messages.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PaymentNotificationChannel = "email" | "whatsapp" | "sms";

interface CenterPaymentData {
  id: string;
  name: string | null;
  portal_slug?: string | null;
  bizum_phone?: string | null;
  bank_transfer_info?: string | null;
}

interface SessionPaymentData {
  id: string;
  center_id: string;
  patient_id: string;
  professional_id: string | null;
  session_date: string | null;
  session_type: string | null;
  access_token?: string | null;
  price: number | string | null;
  payment_status: string | null;
  payment_mode: string | null;
  advance_payment_send_at: string | null;
  advance_payment_due_at: string | null;
}

interface PatientPaymentData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface BuildAdvancePaymentBlockArgs {
  supabase: SupabaseClient;
  centerId: string;
  sessionId: string;
  channel: PaymentNotificationChannel;
  baseUrl: string;
}

interface BuildAdvancePaymentBlockResult {
  block: string;
  hasPaymentInstructions: boolean;
  stripeError: string | null;
}

const DEFAULT_PAYMENT_OPTIONS = {
  email: {
    intro: "Puedes realizar el pago por las siguientes opciones:",
    stripe: "Pagar con tarjeta: {link_pago_stripe}",
    bizum: "Bizum al numero {bizum_numero}",
    transfer: "Transferencia bancaria:\n{datos_transferencia}",
  },
  whatsapp: {
    intro: "Opciones de pago:",
    stripe: "Pagar por tarjeta: {link_pago_stripe}",
    bizum: "Bizum al {bizum_numero}",
    transfer: "Transferencia:\n{datos_transferencia}",
  },
  sms: {
    intro: "Pago:",
    stripe: "Pagar: {link_pago_stripe}",
    bizum: "Bizum: {bizum_numero}",
    transfer: "Transf: {datos_transferencia}",
  },
};

function isAdvancePaymentPending(session: Pick<SessionPaymentData, "payment_status" | "advance_payment_due_at" | "price">): boolean {
  const price = Number(session.price ?? 0);
  const status = (session.payment_status ?? "").toLowerCase();
  return price > 0
    && !!session.advance_payment_due_at
    && status !== "paid"
    && status !== "bono"
    && status !== "refunded";
}

function formatDueAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function replacePaymentVars(
  text: string,
  vars: {
    stripeCheckoutUrl: string;
    bizumPhone: string;
    transferInfo: string;
  },
): string {
  return text
    .replace(/{link_pago_stripe}/g, vars.stripeCheckoutUrl)
    .replace(/{bizum_numero}/g, vars.bizumPhone)
    .replace(/{datos_transferencia}/g, vars.transferInfo);
}

async function loadTemplate(supabase: SupabaseClient, centerId: string, channel: PaymentNotificationChannel) {
  const { data } = await supabase
    .from("communication_templates")
    .select("email_payment_text, payment_option_stripe, payment_option_bizum, payment_option_transfer")
    .eq("center_id", centerId)
    .eq("channel", channel)
    .eq("template_type", "payment_reminder")
    .maybeSingle();

  return data;
}

async function canUseStripeForSession(
  supabase: SupabaseClient,
  professionalId: string | null,
): Promise<boolean> {
  if (!professionalId) return false;

  const { data: integrations } = await supabase
    .from("professional_integrations")
    .select("stripe_enabled")
    .eq("professional_id", professionalId)
    .maybeSingle();

  if (!integrations?.stripe_enabled) return false;

  const { data: connection } = await supabase
    .from("oauth_connections")
    .select("stripe_account_id, stripe_account_status")
    .eq("professional_id", professionalId)
    .eq("provider", "stripe")
    .maybeSingle();

  return !!connection?.stripe_account_id && connection.stripe_account_status === "active";
}

async function createStripeCheckoutUrl(
  supabase: SupabaseClient,
  session: SessionPaymentData,
  patient: PatientPaymentData,
  baseUrl: string,
): Promise<{ url: string; error: string | null }> {
  if (!session.professional_id) return { url: "", error: "La cita no tiene profesional asignado" };
  if (!(await canUseStripeForSession(supabase, session.professional_id))) {
    return { url: "", error: null };
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
      ...(serviceRoleKey
        ? {
            headers: {
              Authorization: `Bearer ${serviceRoleKey}`,
              apikey: serviceRoleKey,
            },
          }
        : {}),
      body: {
        professional_id: session.professional_id,
        session_id: session.id,
        patient_id: session.patient_id,
        patient_email: patient.email,
        patient_name: `${patient.first_name || ""} ${patient.last_name || ""}`.trim(),
        amount: Number(session.price ?? 0),
        session_type: session.session_type,
        session_date: session.session_date,
        success_url: session.access_token ? `${baseUrl}/cita/${session.access_token}?pago=ok` : undefined,
        cancel_url: session.access_token ? `${baseUrl}/cita/${session.access_token}?pago=cancelado` : undefined,
      },
    });

    if (error) return { url: "", error: error.message || "No se pudo crear el enlace de Stripe" };
    if (data?.error) return { url: "", error: data.error };
    return { url: data?.checkout_url || "", error: null };
  } catch (error) {
    return {
      url: "",
      error: error instanceof Error ? error.message : "No se pudo crear el enlace de Stripe",
    };
  }
}

export async function buildAdvancePaymentBlock(
  args: BuildAdvancePaymentBlockArgs,
): Promise<BuildAdvancePaymentBlockResult> {
  const { supabase, centerId, sessionId, channel, baseUrl } = args;

  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("id, center_id, patient_id, professional_id, session_date, session_type, access_token, price, payment_status, payment_mode, advance_payment_send_at, advance_payment_due_at")
    .eq("id", sessionId)
    .single();
  const session = sessionRow as SessionPaymentData | null;

  if (!session || !isAdvancePaymentPending(session)) {
    return { block: "", hasPaymentInstructions: false, stripeError: null };
  }

  if (
    session.payment_mode === "scheduled_before"
    && session.advance_payment_send_at
    && new Date(session.advance_payment_send_at).getTime() > Date.now()
  ) {
    return { block: "", hasPaymentInstructions: false, stripeError: null };
  }

  const [{ data: centerRow }, { data: patientRow }, template] = await Promise.all([
    supabase
      .from("centers")
      .select("id, name, portal_slug, bizum_phone, bank_transfer_info")
      .eq("id", centerId)
      .single(),
    supabase
      .from("patients")
      .select("id, first_name, last_name, email")
      .eq("id", session.patient_id)
      .single(),
    loadTemplate(supabase, centerId, channel),
  ]);
  const center = centerRow as CenterPaymentData | null;
  const patient = patientRow as PatientPaymentData | null;

  if (!center || !patient) {
    return { block: "", hasPaymentInstructions: false, stripeError: "No se encontraron los datos para el aviso de pago" };
  }

  const stripe = await createStripeCheckoutUrl(supabase, session, patient, baseUrl);
  const defaults = DEFAULT_PAYMENT_OPTIONS[channel];
  const lines: string[] = [];
  const replaceVars = (text: string) => replacePaymentVars(text, {
    stripeCheckoutUrl: stripe.url,
    bizumPhone: center.bizum_phone || "",
    transferInfo: center.bank_transfer_info || "",
  });

  if (stripe.url) {
    const text = template?.payment_option_stripe || defaults.stripe;
    if (text) lines.push(replaceVars(text));
  }

  if (center.bizum_phone) {
    const text = template?.payment_option_bizum || defaults.bizum;
    if (text) lines.push(replaceVars(text));
  }

  if (center.bank_transfer_info) {
    const text = template?.payment_option_transfer || defaults.transfer;
    if (text) lines.push(replaceVars(text));
  }

  if (lines.length === 0) {
    return {
      block: "",
      hasPaymentInstructions: false,
      stripeError: stripe.error,
    };
  }

  const dueAt = formatDueAt(session.advance_payment_due_at);
  const intro = template?.email_payment_text || defaults.intro;
  const heading = [
    "Pago anticipado requerido",
    dueAt ? `La cita debe quedar abonada antes del ${dueAt}.` : "",
    "Si no se abona dentro del plazo, la cita puede ser cancelada por falta de pago.",
  ].filter(Boolean).join("\n");

  return {
    block: [heading, replaceVars(intro), lines.join("\n")].filter(Boolean).join("\n\n"),
    hasPaymentInstructions: true,
    stripeError: stripe.error,
  };
}

export async function markAdvancePaymentNotificationSent(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({
      advance_payment_notification_sent_at: new Date().toISOString(),
      advance_payment_notification_failed_at: null,
      advance_payment_notification_error: null,
    })
    .eq("id", sessionId);
}

export async function markAdvancePaymentNotificationFailed(
  supabase: SupabaseClient,
  sessionId: string,
  error: string,
): Promise<void> {
  await supabase
    .from("sessions")
    .update({
      advance_payment_notification_failed_at: new Date().toISOString(),
      advance_payment_notification_error: error,
    })
    .eq("id", sessionId);
}
