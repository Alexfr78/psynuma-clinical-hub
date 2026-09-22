/**
 * Borrado manual de una grabación de sesión (audio_ingestions) desde /grabaciones.
 *
 * Borra el audio (si aún existe) y la transcripción asociada, y cancela la
 * transcripción pendiente. NO borra los informes ya generados: forman parte de la
 * historia clínica (Ley 41/2002) y se gestionan desde la propia sesión.
 *
 * Solo el profesional que grabó o un admin del mismo centro. Se hace con
 * service_role porque ni las políticas RLS ni las de Storage dejan al cliente
 * borrar el audio, y así el archivo desaparece al momento en vez de esperar al
 * cron nocturno. Queda registrado en la auditoría clínica.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAuditEvent } from "../_shared/auditLogger.ts";
import { removeWebRecordingParts, WEB_AUDIO_BUCKET } from "../_shared/webRecording.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Mientras se sube o se transcribe, borrar dejaría al worker escribiendo sobre una
// fila ya borrada; se pide esperar unos minutos.
const BUSY_STATUSES = ["uploading", "transcription_processing"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!jwt) return json({ error: "No autorizado" }, 401);
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt);
  const claims = claimsData?.claims as { role?: string; sub?: string } | undefined;
  if (claimsError || claims?.role !== "authenticated" || !claims.sub) return json({ error: "No autorizado" }, 401);
  const userId = claims.sub;

  let audioIngestionId: unknown;
  try { ({ audioIngestionId } = await req.json()); } catch { /* validado abajo */ }
  if (typeof audioIngestionId !== "string" || !/^[0-9a-f-]{36}$/i.test(audioIngestionId)) {
    return json({ error: "audioIngestionId no válido" }, 400);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [{ data: profile }, { data: roles }, { data: ingestion }] = await Promise.all([
    supabase.from("profiles").select("center_id").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId).in("role", ["admin", "professional"]),
    supabase.from("audio_ingestions")
      .select("id, center_id, professional_id, patient_id, session_id, source, status, storage_path")
      .eq("id", audioIngestionId).maybeSingle(),
  ]);
  if (!ingestion) return json({ error: "Grabación no encontrada" }, 404);
  const isAdmin = roles?.some((r) => r.role === "admin") ?? false;
  const isOwner = ingestion.professional_id === userId && (roles?.length ?? 0) > 0;
  if (profile?.center_id !== ingestion.center_id || !(isAdmin || isOwner)) {
    await logAuditEvent({
      supabase, req, userId, organizationId: ingestion.center_id, patientId: ingestion.patient_id,
      resourceType: "audio_recordings", resourceId: ingestion.id, action: "DELETE", status: "denied",
      routeOrEndpoint: "delete-audio-recording",
    });
    return json({ error: "No tienes permiso para borrar esta grabación" }, 403);
  }
  if (BUSY_STATUSES.includes(ingestion.status)) {
    return json({ error: "La grabación se está subiendo o transcribiendo. Espera unos minutos y vuelve a intentarlo." }, 409);
  }

  // 1. Audio: archivo final y, en la grabadora web, las partes que pudieran quedar.
  const bucket = supabase.storage.from(WEB_AUDIO_BUCKET);
  const audioPath = ingestion.storage_path ?? `${ingestion.center_id}/${ingestion.id}/audio`;
  const { error: removeError } = await bucket.remove([audioPath]);
  if (removeError) return json({ error: "No se pudo borrar el audio; vuelve a intentarlo" }, 503);
  if (ingestion.source === "web_recorder") {
    try { await removeWebRecordingParts(supabase, `${ingestion.center_id}/${ingestion.id}/parts`); }
    catch { return json({ error: "No se pudieron borrar todas las partes del audio; vuelve a intentarlo" }, 503); }
  }

  // 2. Transcripción (no los informes generados a partir de ella).
  const { data: deletedTranscripts, error: transcriptError } = await supabase.from("transcripts")
    .delete().eq("audio_ingestion_id", ingestion.id).select("id");
  if (transcriptError) return json({ error: "Se borró el audio, pero no la transcripción; vuelve a intentarlo" }, 503);

  // 3. Transcripción pendiente: se cancela para que el worker no la recoja.
  const now = new Date().toISOString();
  await supabase.from("transcription_jobs")
    .update({ status: "cancelled", cancelled_at: now, next_retry_at: null })
    .eq("audio_ingestion_id", ingestion.id).in("status", ["queued", "failed"]);

  const { error: updateError } = await supabase.from("audio_ingestions")
    .update({ status: "audio_deleted", storage_path: null, deleted_at: now })
    .eq("id", ingestion.id);
  if (updateError) return json({ error: "Se borró el audio, pero no se pudo actualizar su estado" }, 503);

  await logAuditEvent({
    supabase, req, userId, userRole: isAdmin ? "admin" : "professional",
    organizationId: ingestion.center_id, patientId: ingestion.patient_id,
    resourceType: "audio_recordings", resourceId: ingestion.id, action: "DELETE",
    routeOrEndpoint: "delete-audio-recording",
    metadata: { sessionId: ingestion.session_id, previousStatus: ingestion.status, transcriptsDeleted: deletedTranscripts?.length ?? 0 },
  });

  return json({ success: true, transcriptsDeleted: deletedTranscripts?.length ?? 0 });
});
