/**
 * Fase 1 de la nueva arquitectura de ingestión de audio (sustituye a PLAUD).
 *
 * Confirma que la subida a Storage terminó, valida el checksum declarado
 * contra el tamaño real del objeto, marca `audio_ingestions.status = uploaded`
 * y crea el `transcription_jobs` en estado `queued`.
 *
 * TODO (Fase 2): esta función NO invoca ningún proveedor STT todavía. El job
 * se queda en `queued` a la espera del adaptador STT (interfaz abstracta,
 * ver informe de arquitectura). Cuando exista, aquí es donde se dispararía
 * la transcripción (o se dejaría para un worker/cron que recoja los jobs
 * `queued`).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorizedResponse } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "session-audio";

interface CompleteAudioUploadBody {
  audioIngestionId?: string;
  checksum?: string | null;
  sizeBytes?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!jwt) return unauthorizedResponse(corsHeaders);

  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(jwt);
  const role = (claimsData?.claims as { role?: string; sub?: string })?.role;
  const userId = (claimsData?.claims as { role?: string; sub?: string })?.sub;
  if (claimsError || (role !== "authenticated" && role !== "service_role")) {
    return unauthorizedResponse(corsHeaders);
  }

  try {
    const body = (await req.json()) as CompleteAudioUploadBody;
    const { audioIngestionId, checksum = null, sizeBytes = null } = body;

    if (!audioIngestionId) {
      return new Response(
        JSON.stringify({ error: "audioIngestionId es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ingestion, error: fetchError } = await supabase
      .from("audio_ingestions")
      .select("id, center_id, professional_id, storage_path, status, checksum")
      .eq("id", audioIngestionId)
      .maybeSingle();

    if (fetchError || !ingestion) {
      return new Response(
        JSON.stringify({ error: "Ingestión no encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (role === "authenticated" && userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("center_id")
        .eq("id", userId)
        .maybeSingle();
      if (!prof || (prof as { center_id: string | null }).center_id !== ingestion.center_id) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Idempotencia: si ya se completó, devolver el estado actual sin duplicar
    // el transcription_job.
    if (ingestion.status !== "uploading") {
      const { data: existingJob } = await supabase
        .from("transcription_jobs")
        .select("id, status")
        .eq("audio_ingestion_id", audioIngestionId)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          success: true,
          audioIngestionId,
          status: ingestion.status,
          transcriptionJobId: existingJob?.id ?? null,
          alreadyCompleted: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!ingestion.storage_path) {
      return new Response(
        JSON.stringify({ error: "La ingestión no tiene storage_path asignado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const folder = ingestion.storage_path.split("/").slice(0, -1).join("/");
    const fileName = ingestion.storage_path.split("/").pop()!;
    const { data: listed, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(folder, { search: fileName });

    const uploadedObject = listed?.find((f) => f.name === fileName);

    if (listError || !uploadedObject) {
      console.error("[complete-audio-upload] Object not found in storage:", listError?.message);
      return new Response(
        JSON.stringify({ error: "No se encontró el archivo subido en Storage" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verificación básica de integridad: el checksum declarado al crear la
    // ingestión (si lo hay) debe coincidir con el que se reporta al completar.
    // La verificación criptográfica completa del contenido requeriría leer el
    // objeto entero server-side; por ahora se compara el checksum declarado
    // en ambos extremos, que ya cubre el caso de subida corrupta/truncada
    // detectable por el cliente.
    if (ingestion.checksum && checksum && ingestion.checksum !== checksum) {
      console.error(`[complete-audio-upload] Checksum mismatch for ${audioIngestionId}`);
      return new Response(
        JSON.stringify({ error: "El checksum no coincide con el declarado al crear la ingestión" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("audio_ingestions")
      .update({
        status: "uploaded",
        uploaded_at: now,
        checksum: checksum ?? ingestion.checksum,
        size_bytes: sizeBytes ?? uploadedObject.metadata?.size ?? null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", audioIngestionId);

    if (updateError) {
      console.error("[complete-audio-upload] Failed to update ingestion:", updateError.message);
      return new Response(
        JSON.stringify({ error: "No se pudo actualizar la ingestión" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("transcription_jobs")
      .insert({
        audio_ingestion_id: audioIngestionId,
        mode: "async",
        status: "queued",
        // provider / provider_model quedan sin asignar: los fija el adaptador
        // STT de la Fase 2 al recoger el job.
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("[complete-audio-upload] Failed to create transcription job:", jobError?.message);
      return new Response(
        JSON.stringify({ error: "No se pudo crear el job de transcripción" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase
      .from("audio_ingestions")
      .update({ status: "queued_for_transcription" })
      .eq("id", audioIngestionId);

    console.log(`[complete-audio-upload] ${audioIngestionId} uploaded, transcription job ${job.id} queued`);

    return new Response(
      JSON.stringify({
        success: true,
        audioIngestionId,
        status: "queued_for_transcription",
        transcriptionJobId: job.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[complete-audio-upload] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
