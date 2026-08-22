import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createConnectedSetupSession } from "../_shared/stripeConnectedCheckout.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";

// Fase 2 · Incremento 1 — Crea un Checkout en modo `setup` para guardar la
// tarjeta del paciente en la cuenta conectada del profesional. No mueve dinero;
// solo captura el método de pago + el mandato para futuros cargos por
// cancelación/no-show (el cobro real llega en el Incremento 2).

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type AccessContext = {
  patientId: string;
  centerId: string;
  sessionId: string;
  source: "portal" | "public-booking";
};

async function verifySignedToken(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [payloadB64, signatureB64] = token.split(".");
    if (!payloadB64 || !signatureB64) return null;

    const data = atob(payloadB64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(data),
    );
    if (!validSignature) return null;

    const payload = JSON.parse(data) as Record<string, unknown>;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function resolveAccessContext(
  portalSessionToken: string | undefined,
  bookingToken: string | undefined,
  userAgent: string,
): Promise<AccessContext | null> {
  if (portalSessionToken) {
    const payload = await verifySignedToken(portalSessionToken);
    if (!payload || typeof payload.patient_id !== "string" || typeof payload.center_id !== "string") {
      return null;
    }

    if (typeof payload.fp === "string") {
      const fingerprintBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userAgent));
      const fingerprint = Array.from(new Uint8Array(fingerprintBytes))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 16);
      if (payload.fp !== fingerprint) return null;
    }

    return {
      patientId: payload.patient_id,
      centerId: payload.center_id,
      sessionId: "",
      source: "portal",
    };
  }

  if (bookingToken) {
    const payload = await verifySignedToken(bookingToken);
    if (
      !payload
      || typeof payload.session_id !== "string"
      || typeof payload.patient_id !== "string"
      || typeof payload.center_id !== "string"
    ) {
      return null;
    }

    return {
      patientId: payload.patient_id,
      centerId: payload.center_id,
      sessionId: payload.session_id,
      source: "public-booking",
    };
  }

  return null;
}

async function getOrCreateConnectedCustomer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: {
    connectedAccountId: string;
    patientId: string;
    centerId: string;
    email: string | null;
    name: string | null;
  },
): Promise<string> {
  const { data: existing } = await supabase
    .from("patient_payment_methods")
    .select("stripe_customer_id")
    .eq("patient_id", args.patientId)
    .eq("connected_account_id", args.connectedAccountId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const body = new URLSearchParams();
  if (args.email) body.set("email", args.email);
  if (args.name) body.set("name", args.name);
  body.set("metadata[patient_id]", args.patientId);
  body.set("metadata[center_id]", args.centerId);

  const resp = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Account": args.connectedAccountId,
    },
    body,
  });
  const payload = await resp.json() as { id?: string; error?: { message?: string } };
  if (!resp.ok || !payload.id) {
    throw new Error(payload.error?.message || "No se pudo crear el cliente de Stripe");
  }
  return payload.id;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (!stripeSecretKey) {
      return json({ error: "Stripe no está configurado" }, 500);
    }

    const { sessionId, portalSessionToken, bookingToken, successUrl, cancelUrl } = await req.json();
    if (!sessionId) {
      return json({ error: "sessionId es requerido" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const clientIp = getClientIp(req);
    const rl = await checkIpRateLimit(supabase, clientIp, "create-setup-intent", 10, 10);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: "Demasiadas solicitudes. Inténtalo en unos minutos.", rateLimited: true }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const access = await resolveAccessContext(
      portalSessionToken,
      bookingToken,
      req.headers.get("user-agent") || "",
    );
    if (!access) {
      return json({ error: "No autorizado para guardar la tarjeta de esta cita" }, 401);
    }

    // Deriva todo desde la sesión (evita aceptar ids sueltos manipulables).
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("id, center_id, patient_id, professional_id, cancellation_policy_version_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return json({ error: "Sesión no encontrada" }, 404);
    }
    if (!session.patient_id || !session.professional_id) {
      return json({ error: "La sesión no tiene paciente o profesional asignado" }, 400);
    }

    if (access.source === "portal" && (session.patient_id !== access.patientId || session.center_id !== access.centerId)) {
      return json({ error: "No autorizado para guardar la tarjeta de esta cita" }, 403);
    }

    if (access.source === "public-booking" && (
      session.id !== access.sessionId
      || session.patient_id !== access.patientId
      || session.center_id !== access.centerId
    )) {
      return json({ error: "La reserva no coincide con la cita indicada" }, 403);
    }

    if (!["draft", "scheduled", "confirmed", "pending_approval"].includes(session.status)) {
      return json({ error: "Esta cita ya no admite guardar una tarjeta" }, 409);
    }

    await logAuditEvent({
      supabase,
      req,
      userId: null,
      userRole: "patient",
      organizationId: session.center_id,
      patientId: session.patient_id,
      resourceType: "payment_method",
      resourceId: session.id,
      action: "CREATE",
      routeOrEndpoint: "create-setup-intent",
      metadata: { source: access.source },
    });

    const { data: connection } = await supabase
      .from("oauth_connections")
      .select("stripe_account_id, stripe_account_status")
      .eq("professional_id", session.professional_id)
      .eq("provider", "stripe")
      .maybeSingle();
    if (!connection?.stripe_account_id || connection.stripe_account_status !== "active") {
      return json({ error: "El profesional no tiene una cuenta Stripe activa" }, 400);
    }
    const connectedAccountId = connection.stripe_account_id as string;

    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name, email")
      .eq("id", session.patient_id)
      .maybeSingle();

    const { data: center } = await supabase
      .from("centers")
      .select("public_domain, portal_slug")
      .eq("id", session.center_id)
      .maybeSingle();

    const baseUrl = center?.public_domain
      ? `https://${center.public_domain}`
      : (Deno.env.get("APP_BASE_URL") || "");
    const slugParam = center?.portal_slug ? `&slug=${encodeURIComponent(center.portal_slug)}` : "";

    const patientName = `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || null;

    const customerId = await getOrCreateConnectedCustomer(supabase, {
      connectedAccountId,
      patientId: session.patient_id,
      centerId: session.center_id,
      email: patient?.email ?? null,
      name: patientName,
    });

    const setupSession = await createConnectedSetupSession({
      stripeSecretKey,
      connectedAccountId,
      customerId,
      customerEmail: patient?.email ?? null,
      successUrl: successUrl || `${baseUrl}/pago-exitoso?setup=1${slugParam}`,
      cancelUrl: cancelUrl || baseUrl || "",
      metadata: {
        center_id: session.center_id,
        patient_id: session.patient_id,
        professional_id: session.professional_id,
        session_id: session.id,
        policy_version_id: session.cancellation_policy_version_id || "",
        purpose: "cancellation_mandate",
        mandate_ip: clientIp,
      },
      // Clave única por intento: el Checkout de setup no mueve dinero y cada
      // intento puede crear un Customer distinto, así que una clave fija provoca
      // conflictos de idempotencia en reintentos.
      idempotencyKey: `setup-${session.id}-${crypto.randomUUID()}`,
    });

    return json({ url: setupSession.url, session_id: setupSession.id });
  } catch (error) {
    console.error("[create-setup-intent] error", error);
    return json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, 500);
  }
});
