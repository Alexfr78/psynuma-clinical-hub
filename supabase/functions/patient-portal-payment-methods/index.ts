import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// Fase 2 · Incremento 1 — Gestión de la tarjeta en archivo desde el portal del
// paciente: `list` (ver la tarjeta activa) y `remove` (quitarla: detach en la
// cuenta conectada + status='removed'). Autenticación por el mismo token HMAC
// del portal que usa patient-portal-sessions.

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function validateSession(
  sessionToken: string,
): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) return { valid: false };

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
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));
    if (!isValid) return { valid: false };

    const payload = JSON.parse(data);
    if (payload.exp < Date.now()) return { valid: false };
    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch (_error) {
    return { valid: false };
  }
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { action, sessionToken } = await req.json();

    const session = await validateSession(sessionToken || "");
    if (!session.valid || !session.patientId || !session.centerId) {
      return json({ error: "Sesión no válida" }, 401);
    }

    if (action === "list") {
      const { data: card } = await supabase
        .from("patient_payment_methods")
        .select("id, brand, last4, exp_month, exp_year, created_at")
        .eq("center_id", session.centerId)
        .eq("patient_id", session.patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return json({ card: card ?? null });
    }

    if (action === "remove") {
      const { data: card } = await supabase
        .from("patient_payment_methods")
        .select("id, stripe_payment_method_id, connected_account_id")
        .eq("center_id", session.centerId)
        .eq("patient_id", session.patientId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!card) {
        return json({ error: "No hay ninguna tarjeta activa" }, 404);
      }

      // Detach en Stripe (mejor esfuerzo: si falla, igual marcamos removed para
      // no dejar la tarjeta visible/usable en Psycma).
      if (stripeSecretKey && card.stripe_payment_method_id && card.connected_account_id) {
        try {
          const resp = await fetch(
            `https://api.stripe.com/v1/payment_methods/${card.stripe_payment_method_id}/detach`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${stripeSecretKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "Stripe-Account": card.connected_account_id,
              },
            },
          );
          if (!resp.ok) {
            const body = await resp.json().catch(() => ({}));
            console.error("[patient-portal-payment-methods] detach failed", body);
          }
        } catch (detachError) {
          console.error("[patient-portal-payment-methods] detach error", detachError);
        }
      }

      const { error: updateError } = await supabase
        .from("patient_payment_methods")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("id", card.id);

      if (updateError) {
        return json({ error: "No se pudo eliminar la tarjeta" }, 500);
      }
      return json({ success: true });
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (error) {
    console.error("[patient-portal-payment-methods] error", error);
    return json({ error: "Error interno del servidor" }, 500);
  }
});
