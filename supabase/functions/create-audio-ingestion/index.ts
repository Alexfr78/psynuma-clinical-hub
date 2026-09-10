/**
 * Fase 1 de la nueva arquitectura de ingestión de audio (sustituye a PLAUD).
 *
 * Crea un registro `audio_ingestions` y devuelve una URL firmada de subida al
 * bucket privado `session-audio`. No transcribe nada todavía (eso lo hace un
 * proveedor STT real en la Fase 2, cuando `complete-audio-upload` deje de
 * dejar el job en `queued`).
 *
 * Mismo patrón de autenticación que `transcribe-session-audio`: JWT
 * obligatorio, y si el rol es `authenticated` se verifica que el profesional
 * pertenece al centro indicado.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorizedResponse } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BUCKET = "session-audio";
const ALLOWED_SOURCES = ["android_recorder", "samsung_media_store", "share_target", "manual_upload"];
const SIGNED_URL_EXPIRY_SECONDS = 15 * 60; // 15 minutos

interface CreateAudioIngestionBody {
  centerId?: string;
  professionalId?: string;
  patientId?: string | null;
  sessionId?: string | null;
  source?: string;
  deviceInstallationId?: string | null;
  recordedAt?: string | null;
  durationMs?: number | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  checksum?: string | null;
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
    const body = (await req.json()) as CreateAudioIngestionBody;
    const {
      centerId,
      professionalId,
      patientId = null,
      sessionId = null,
      source,
      deviceInstallationId = null,
      recordedAt = null,
      durationMs = null,
      mimeType = null,
      sizeBytes = null,
      checksum = null,
    } = body;

    if (!centerId || !professionalId || !source) {
      return new Response(
        JSON.stringify({ error: "centerId, professionalId y source son requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!ALLOWED_SOURCES.includes(source)) {
      return new Response(
        JSON.stringify({ error: `source debe ser uno de: ${ALLOWED_SOURCES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (role === "authenticated" && userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("center_id")
        .eq("id", userId)
        .maybeSingle();
      if (!prof || (prof as { center_id: string | null }).center_id !== centerId) {
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (professionalId !== userId) {
        // Un profesional solo puede crear ingestiones a su propio nombre;
        // un admin gestionando en nombre de otro profesional queda fuera del
        // alcance de esta fase.
        return new Response(
          JSON.stringify({ error: "Forbidden" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("audio_ingestions")
      .insert({
        center_id: centerId,
        professional_id: professionalId,
        patient_id: patientId,
        session_id: sessionId,
        source,
        device_installation_id: deviceInstallationId,
        recorded_at: recordedAt,
        duration_ms: durationMs,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        checksum,
        status: "uploading",
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[create-audio-ingestion] Insert failed:", insertError?.message);
      return new Response(
        JSON.stringify({ error: "No se pudo crear la ingestión de audio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ingestionId = inserted.id as string;
    // Ruta sin nombres de paciente ni datos clínicos, solo IDs técnicos.
    const storagePath = `${centerId}/${ingestionId}/audio`;

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signed) {
      console.error("[create-audio-ingestion] createSignedUploadUrl failed:", signedError?.message);
      // Deja la fila creada pero sin storage_path; el cron de huérfanos la
      // limpiará a los 7 días si nunca se completa la subida.
      return new Response(
        JSON.stringify({ error: "No se pudo generar la URL de subida" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabase
      .from("audio_ingestions")
      .update({ storage_path: storagePath })
      .eq("id", ingestionId);

    if (updateError) {
      console.error("[create-audio-ingestion] Failed to persist storage_path:", updateError.message);
    }

    console.log(`[create-audio-ingestion] Created ${ingestionId} for center ${centerId}, source ${source}`);

    return new Response(
      JSON.stringify({
        success: true,
        audioIngestionId: ingestionId,
        upload: {
          bucket: BUCKET,
          path: storagePath,
          signedUrl: signed.signedUrl,
          token: signed.token,
          expiresInSeconds: SIGNED_URL_EXPIRY_SECONDS,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[create-audio-ingestion] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
