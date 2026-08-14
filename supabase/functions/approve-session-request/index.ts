import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { autoApplyAvailableBonoToSession } from "../_shared/bonoAutomation.ts";
import { resolvePatientCancellationPolicyForSession } from "../_shared/cancellationPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function formatTime(time: string | null): string {
  return time?.substring(0, 5) || "";
}

async function assertCanApprove(
  supabase: SupabaseClient,
  authHeader: string | null,
  centerId: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
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
    return { ok: false, status: 403, error: "No tienes permiso para aprobar esta cita" };
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["admin", "professional"]);

  if (!roles?.length) {
    return { ok: false, status: 403, error: "No tienes permiso para aprobar esta cita" };
  }

  return { ok: true, status: 200 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "session_id requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(`
        id,
        center_id,
        patient_id,
        session_date,
        start_time,
        session_type,
        session_modality,
        status,
        location:center_locations(name)
      `)
      .eq("id", session_id)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Cita no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const auth = await assertCanApprove(supabase, req.headers.get("Authorization"), session.center_id);
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (session.status !== "pending_approval") {
      return new Response(
        JSON.stringify({ error: "La cita ya no esta pendiente de aprobacion" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cancellationPolicyState = await resolvePatientCancellationPolicyForSession(supabase, {
      centerId: session.center_id,
      patientId: session.patient_id,
    });

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        status: "scheduled",
        ...cancellationPolicyState,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session_id)
      .eq("status", "pending_approval");

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "No se pudo aprobar la cita" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bonoResult = await autoApplyAvailableBonoToSession(supabase, {
      centerId: session.center_id,
      patientId: session.patient_id,
      sessionId: session.id,
      shouldApply: true,
    });
    const bonoMessage = bonoResult.applied
      ? `Se ha descontado esta cita de tu bono. Sesiones pendientes: ${bonoResult.remainingSessions ?? 0}.`
      : undefined;

    const location = Array.isArray(session.location) ? session.location[0] : session.location;
    await queueAndSendPatientBookingNotification({
      supabase,
      centerId: session.center_id,
      patientId: session.patient_id,
      sessionId: session.id,
      eventType: "created",
      sessionDate: session.session_date,
      startTime: formatTime(session.start_time),
      sessionType: session.session_type || "",
      sessionModality: session.session_modality || "",
      locationName: location?.name || "",
      includeAdvancePaymentBlock: !bonoResult.applied,
      extraMessage: bonoMessage,
    });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[approve-session-request] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
