// Cancelación de sesiones de pareja con confirmación del otro miembro.
// Pública (verify_jwt = false): cada acción valida su propio token o el secreto del cron.
//
//   { action: "get", token }                       → datos para /pareja/cancelacion/:token
//   { action: "respond", token, decision }         → "cancel_both" | "attend_alone"
//   { action: "members", session_access_token }    → miembros de la cita, para que en el
//                                                     enlace común /cita/:token se elija quién cancela
//   { action: "professional_resolve", request_id, decision } + JWT del profesional
//   { action: "expire" } + x-cron-secret           → vence solicitudes sin respuesta
//
// La lógica vive en _shared/coupleCancellation.ts.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkIpRateLimit, getClientIp } from "../_shared/rateLimiter.ts";
import {
  expireCoupleCancellations,
  getCoupleMembers,
  resolveCoupleCancellation,
  type CoupleDecision,
} from "../_shared/coupleCancellation.ts";

serve(async (req) => {
  const corsHeaders = {
    ...getCorsHeaders(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (action === "expire") {
      const expected = Deno.env.get("CRON_SECRET");
      if (!expected || req.headers.get("x-cron-secret") !== expected) return json({ error: "Unauthorized" }, 401);
      return json(await expireCoupleCancellations(supabase));
    }

    // El profesional resuelve la solicitud desde el detalle de la cita (p. ej. tras
    // hablar con la pareja por teléfono). Requiere su sesión y rol en el centro.
    if (action === "professional_resolve") {
      const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
      const userId = userData?.user?.id;
      if (!userId) return json({ error: "Unauthorized" }, 401);
      const decision = body.decision as CoupleDecision;
      if (decision !== "cancel_both" && decision !== "attend_alone") return json({ error: "Respuesta no válida" }, 400);
      const [{ data: pendingRequest }, { data: profile }, { data: roles }] = await Promise.all([
        supabase.from("couple_cancellation_requests").select("id, center_id, status").eq("id", String(body.request_id || "")).maybeSingle(),
        supabase.from("profiles").select("center_id").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "professional"]),
      ]);
      if (!pendingRequest || !profile || profile.center_id !== pendingRequest.center_id || !roles?.length) {
        return json({ error: "Forbidden" }, 403);
      }
      return json(await resolveCoupleCancellation(supabase, { requestId: pendingRequest.id, decision, resolvedBy: "professional" }));
    }

    const rl = await checkIpRateLimit(supabase, getClientIp(req), "couple-cancellation", 30, 10);
    if (!rl.allowed) return json({ error: "Demasiadas peticiones. Inténtalo más tarde." }, 429);

    if (action === "members") {
      const token = String(body.session_access_token || "");
      if (!token) return json({ error: "Falta el enlace de la cita" }, 400);
      const { data: session } = await supabase
        .from("sessions")
        .select("id, patient_id, status")
        .eq("access_token", token)
        .maybeSingle();
      if (!session) return json({ error: "Cita no encontrada" }, 404);
      const ids = await getCoupleMembers(supabase, session);
      if (ids.length < 2) return json({ is_couple: false, members: [] });
      const { data: patients } = await supabase.from("patients").select("id, first_name").in("id", ids);
      const { data: pending } = await supabase
        .from("couple_cancellation_requests")
        .select("requested_by_patient_id, deadline_at")
        .eq("session_id", session.id)
        .eq("status", "pending")
        .maybeSingle();
      return json({
        is_couple: true,
        // Titular primero; solo el nombre de pila (el enlace ya es de la propia cita).
        members: ids.map((id) => ({ id, first_name: patients?.find((p) => p.id === id)?.first_name ?? "" })),
        pending_request: pending
          ? { requested_by_patient_id: pending.requested_by_patient_id, deadline_at: pending.deadline_at }
          : null,
      });
    }

    const token = String(body.token || "");
    if (!/^[0-9a-f]{48}$/.test(token)) return json({ error: "Enlace no válido" }, 400);
    const { data: request } = await supabase
      .from("couple_cancellation_requests")
      .select("id, status, deadline_at, session_id, requested_by_patient_id, other_patient_id")
      .eq("response_token", token)
      .maybeSingle();
    if (!request) return json({ error: "Enlace no válido o caducado" }, 404);

    if (action === "get") {
      const [{ data: session }, { data: requester }, { data: other }] = await Promise.all([
        supabase.from("sessions").select("session_date, start_time, end_time, session_modality, center_id").eq("id", request.session_id).maybeSingle(),
        supabase.from("patients").select("first_name").eq("id", request.requested_by_patient_id).maybeSingle(),
        supabase.from("patients").select("first_name").eq("id", request.other_patient_id).maybeSingle(),
      ]);
      const { data: center } = session
        ? await supabase.from("centers").select("name, logo_url").eq("id", session.center_id).maybeSingle()
        : { data: null };
      return json({
        status: request.status,
        deadline_at: request.deadline_at,
        requester_first_name: requester?.first_name ?? "",
        other_first_name: other?.first_name ?? "",
        session: session
          ? { date: session.session_date, start_time: session.start_time, end_time: session.end_time, modality: session.session_modality }
          : null,
        center: center ? { name: center.name, logo_url: center.logo_url } : null,
      });
    }

    if (action === "respond") {
      const decision = body.decision as CoupleDecision;
      if (decision !== "cancel_both" && decision !== "attend_alone") return json({ error: "Respuesta no válida" }, 400);
      if (request.status !== "pending") return json({ status: request.status, message: "Esta solicitud ya estaba resuelta." });
      if (new Date(request.deadline_at).getTime() <= Date.now()) {
        const expired = await resolveCoupleCancellation(supabase, { requestId: request.id, decision: "cancel_both", resolvedBy: "timeout" });
        return json({ ...expired, message: "El plazo para responder ha terminado y la sesión se ha cancelado." }, 409);
      }
      return json(await resolveCoupleCancellation(supabase, { requestId: request.id, decision, resolvedBy: "partner" }));
    }

    return json({ error: "Acción no válida" }, 400);
  } catch (error) {
    console.error("[couple-cancellation] Error:", error);
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
