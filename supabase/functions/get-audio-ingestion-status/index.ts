/**
 * Fase 1 de la nueva arquitectura de ingestión de audio (sustituye a PLAUD).
 *
 * Devuelve el estado de una ingestión y su transcription_job asociado, para
 * que el frontend pueda hacer polling mientras se implementa el adaptador
 * STT real (Fase 2). No expone normalized_text ni segments aquí: ese detalle
 * se sirve, cuando exista, desde el propio recurso de transcripción.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorizedResponse } from "../_shared/authGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

  const url = new URL(req.url);
  const audioIngestionId = url.searchParams.get("audioIngestionId");

  if (!audioIngestionId) {
    return new Response(
      JSON.stringify({ error: "audioIngestionId es requerido" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: ingestion, error: fetchError } = await supabase
      .from("audio_ingestions")
      .select("id, center_id, status, matching_status, duration_ms, created_at, uploaded_at")
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

    const { data: job } = await supabase
      .from("transcription_jobs")
      .select("id, status, progress, attempts, error_code, started_at, completed_at")
      .eq("audio_ingestion_id", audioIngestionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        audioIngestionId: ingestion.id,
        status: ingestion.status,
        matchingStatus: ingestion.matching_status,
        durationMs: ingestion.duration_ms,
        createdAt: ingestion.created_at,
        uploadedAt: ingestion.uploaded_at,
        transcriptionJob: job
          ? {
              id: job.id,
              status: job.status,
              progress: job.progress,
              attempts: job.attempts,
              errorCode: job.error_code,
              startedAt: job.started_at,
              completedAt: job.completed_at,
            }
          : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[get-audio-ingestion-status] Error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
