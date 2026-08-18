import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createConnectedPaymentIntent } from "../_shared/stripeConnectedCheckout.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Fase 2 · Incremento 2a — Cobro SUPERVISADO del cargo por cancelación a la
// tarjeta guardada del paciente (PaymentIntent off-session, merchant-initiated).
// Antes de cobrar se genera la deuda desde el cargo, de modo que si el cobro
// requiere 3DS o se declina, el fallback (pagar la deuda por enlace) ya está
// listo. No mueve dinero salvo que el profesional pulse el botón.

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

async function assertCanCharge(
  supabase: SupabaseClient,
  authHeader: string | null,
  centerId: string,
): Promise<{ ok: boolean; status: number; error?: string; userId?: string }> {
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401, error: "No autorizado" };

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader || "" } } },
  );
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return { ok: false, status: 401, error: "No autorizado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("center_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.center_id || profile.center_id !== centerId) {
    return { ok: false, status: 403, error: "No tienes permiso sobre este cargo" };
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "professional"]);
  if (!roles?.length) {
    return { ok: false, status: 403, error: "No tienes permiso para cobrar" };
  }

  return { ok: true, status: 200, userId: user.id };
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
    if (!stripeSecretKey) return json({ error: "Stripe no está configurado" }, 500);

    const { chargeId } = await req.json();
    if (!chargeId) return json({ error: "chargeId es requerido" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: charge, error: chargeError } = await supabase
      .from("cancellation_charges")
      .select("id, center_id, patient_id, session_id, status, amount, concept, debt_id, percentage, base_session_price, original_amount")
      .eq("id", chargeId)
      .maybeSingle();
    if (chargeError || !charge) return json({ error: "Cargo no encontrado" }, 404);
    if (charge.status !== "pending_review") {
      return json({ error: "El cargo ya no está pendiente de revisión" }, 409);
    }

    const auth = await assertCanCharge(supabase, req.headers.get("authorization"), charge.center_id);
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const amount = Number(charge.amount) || 0;
    if (amount <= 0) return json({ error: "El importe del cargo debe ser mayor que 0" }, 400);

    // Tarjeta guardada activa del paciente.
    const { data: card } = await supabase
      .from("patient_payment_methods")
      .select("stripe_customer_id, stripe_payment_method_id, connected_account_id")
      .eq("center_id", charge.center_id)
      .eq("patient_id", charge.patient_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!card?.stripe_payment_method_id || !card.stripe_customer_id || !card.connected_account_id) {
      return json({ needsCard: true, message: "El paciente no tiene una tarjeta guardada." }, 200);
    }

    // 1) Genera la deuda desde el cargo (fallback listo antes de intentar cobrar).
    const notes = [
      charge.concept,
      "Origen: cancelación/no-show según política aceptada.",
      `Cálculo: ${charge.percentage}% de ${charge.base_session_price} EUR.`,
    ].filter(Boolean).join("\n");

    let debtId = charge.debt_id as string | null;
    if (!debtId) {
      const { data: debt, error: debtError } = await supabase
        .from("debts")
        .insert({
          center_id: charge.center_id,
          patient_id: charge.patient_id,
          session_id: charge.session_id,
          amount: Math.round(amount * 100) / 100,
          paid_amount: 0,
          status: "pending",
          notes,
        })
        .select("id")
        .single();
      if (debtError || !debt) {
        console.error("[charge-cancellation] no se pudo generar la deuda", debtError);
        return json({ error: "No se pudo generar la deuda" }, 500);
      }
      debtId = debt.id;
    }

    await supabase
      .from("cancellation_charges")
      .update({
        status: "confirmed",
        debt_id: debtId,
        reviewed_by: auth.userId ?? null,
        reviewed_at: new Date().toISOString(),
        off_session_error: null,
      })
      .eq("id", chargeId);

    // 2) Cobra off-session la tarjeta guardada.
    const feeBpsRaw = Deno.env.get("STRIPE_APPLICATION_FEE_BPS");
    let pi;
    try {
      pi = await createConnectedPaymentIntent({
        stripeSecretKey,
        connectedAccountId: card.connected_account_id,
        customerId: card.stripe_customer_id,
        paymentMethodId: card.stripe_payment_method_id,
        amountInCents: Math.round(amount * 100),
        applicationFeeBpsRaw: feeBpsRaw,
        idempotencyKey: `cancel-charge-${chargeId}`,
        metadata: {
          cancellation_charge_id: chargeId,
          debt_id: debtId,
          patient_id: charge.patient_id,
          center_id: charge.center_id,
          session_id: charge.session_id || "",
          payment_type: "debt_payment",
        },
      });
    } catch (stripeError) {
      const message = stripeError instanceof Error ? stripeError.message : "Error al cobrar";
      await supabase.from("cancellation_charges").update({ off_session_error: message }).eq("id", chargeId);
      return json({ status: "failed", message, debtId }, 200);
    }

    if (pi.status === "succeeded") {
      await supabase
        .from("cancellation_charges")
        .update({ status: "paid", stripe_payment_intent_id: pi.id, off_session_error: null })
        .eq("id", chargeId);
      // El pago sobre la deuda + factura los registra el webhook (payment_intent.succeeded).
      return json({ status: "succeeded", debtId, paymentIntentId: pi.id }, 200);
    }

    // 3DS (requires_action) o declinada: la deuda queda pendiente para el enlace.
    const errMsg = pi.errorMessage
      || (pi.status === "requires_action"
        ? "El banco requiere autenticación (3DS); no se puede cobrar sin el paciente."
        : "La tarjeta fue rechazada.");
    await supabase
      .from("cancellation_charges")
      .update({ stripe_payment_intent_id: pi.id, off_session_error: errMsg })
      .eq("id", chargeId);

    return json({
      status: pi.status === "requires_action" ? "requires_action" : "failed",
      message: errMsg,
      debtId,
    }, 200);
  } catch (error) {
    console.error("[charge-cancellation] error", error);
    return json({ error: error instanceof Error ? error.message : "Error interno del servidor" }, 500);
  }
});
