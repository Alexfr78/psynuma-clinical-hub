/**
 * Authentication: manual calls use the Supabase JWT. Cron calls use the
 * x-cron-secret header (and the generic cron_secret stored in Vault).
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unauthorizedResponse } from "../_shared/authGuard.ts";
import { createOpenAITranscriptionProvider } from "../_shared/openaiTranscriptionProvider.ts";
import { TranscriptionProvider, TranscriptionProviderError } from "../_shared/transcriptionProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const BUCKET = "session-audio";
const MAX_ATTEMPTS = 3;

interface Body { transcriptionJobId?: string; jobId?: string; }
interface JobRow { id: string; audio_ingestion_id: string; attempts: number; status: string; }
interface IngestionRow { id: string; center_id: string; professional_id: string; patient_id: string | null; session_id: string | null; source: string; storage_path: string | null; mime_type: string | null; }
type ServiceClient = SupabaseClient<any>;

type AutomaticReportAudience = "clinical" | "patient";

async function generateAutomaticReports(
  supabase: ServiceClient,
  ingestion: IngestionRow,
  transcription: string,
): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[process-transcription-job] No se pudo generar informes automáticos: faltan secretos de Supabase.");
    return;
  }

  const audiences: AutomaticReportAudience[] = ["clinical", "patient"];
  for (const audience of audiences) {
    try {
      const audienceValues = audience === "clinical" ? ["clinical", "professional"] : [audience];
      let defaultRow: { document_type_id: string; audience: string } | null = null;

      for (const audienceValue of audienceValues) {
        const { data: professionalDefault, error: professionalDefaultError } = await supabase
          .from("ai_document_defaults")
          .select("document_type_id, audience")
          .eq("center_id", ingestion.center_id)
          .eq("professional_id", ingestion.professional_id)
          .eq("audience", audienceValue)
          .maybeSingle();
        if (professionalDefaultError) throw professionalDefaultError;
        if (professionalDefault) {
          defaultRow = professionalDefault as { document_type_id: string; audience: string };
          break;
        }

        const { data: centerDefault, error: centerDefaultError } = await supabase
          .from("ai_document_defaults")
          .select("document_type_id, audience")
          .eq("center_id", ingestion.center_id)
          .is("professional_id", null)
          .eq("audience", audienceValue)
          .maybeSingle();
        if (centerDefaultError) throw centerDefaultError;
        if (centerDefault) {
          defaultRow = centerDefault as { document_type_id: string; audience: string };
          break;
        }
      }

      if (!defaultRow) {
        console.log(`[process-transcription-job] Se omite informe automático para audience ${audience}: no hay default configurado.`);
        continue;
      }

      const { data: documentType, error: documentTypeError } = await supabase
        .from("ai_document_types")
        .select("key")
        .eq("id", defaultRow.document_type_id)
        .maybeSingle();
      if (documentTypeError) throw documentTypeError;
      const documentTypeKey = (documentType as { key?: string } | null)?.key;
      if (!documentTypeKey) {
        console.log(`[process-transcription-job] Se omite informe automático para audience ${audience}: el default no tiene document type válido.`);
        continue;
      }

      const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/analyze-session-transcription`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: ingestion.session_id,
          centerId: ingestion.center_id,
          documentTypeKey,
          transcription,
          transcriptSource: "manual",
        }),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`[process-transcription-job] Error generando informe automático para audience ${audience} (${documentTypeKey}): HTTP ${response.status} ${responseText}`);
        continue;
      }

      console.log(`[process-transcription-job] Informe automático generado para audience ${audience}: ${documentTypeKey}.`);
    } catch (error) {
      console.error(`[process-transcription-job] Error no bloqueante generando informe automático para audience ${audience}:`, error);
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isCronRequest(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET");
  return Boolean(expected && req.headers.get("x-cron-secret") === expected);
}

function safeError(error: unknown): { code: string; message: string } {
  const providerError = (error as { providerError?: TranscriptionProviderError; code?: string })?.providerError;
  const returnedProviderError = error as TranscriptionProviderError;
  if (providerError) return { code: `stt_${providerError.code}`, message: "El proveedor de transcripción no pudo completar el audio." };
  if (returnedProviderError?.code && returnedProviderError?.message) {
    return { code: `stt_${returnedProviderError.code}`, message: "El proveedor de transcripción no pudo completar el audio." };
  }
  return { code: "transcription_job_failed", message: "No se pudo completar la transcripción." };
}

async function authenticate(req: Request): Promise<boolean> {
  if (isCronRequest(req)) return true;
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!jwt) return false;
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data, error } = await authClient.auth.getClaims(jwt);
  const role = (data?.claims as { role?: string } | undefined)?.role;
  return !error && (role === "authenticated" || role === "service_role");
}

async function failJob(supabase: ServiceClient, job: JobRow, error: unknown): Promise<void> {
  const attempts = (job.attempts ?? 0) + 1;
  const failure = safeError(error);
  const terminal = attempts > MAX_ATTEMPTS;
  await supabase.from("transcription_jobs").update({
    status: terminal ? "failed" : "queued",
    attempts,
    error_code: failure.code,
    error_message_sanitized: failure.message,
    next_retry_at: terminal ? null : new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  }).eq("id", job.id);
  await supabase.from("audio_ingestions").update({
    status: terminal ? "failed" : "queued_for_transcription",
  }).eq("id", job.audio_ingestion_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!(await authenticate(req))) return unauthorizedResponse(corsHeaders);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: Body = {};
  try { body = await req.json() as Body; } catch { /* Empty body is valid for cron polling. */ }
  const requestedId = body.transcriptionJobId || body.jobId;
  const now = new Date().toISOString();

  let query = supabase.from("transcription_jobs").select("id, audio_ingestion_id, attempts, status").eq("status", "queued");
  if (requestedId) query = query.eq("id", requestedId);
  else query = query.or(`next_retry_at.is.null,next_retry_at.lte.${now}`).order("created_at", { ascending: true }).limit(1);
  const { data: candidates, error: queryError } = await query;
  if (queryError) return jsonResponse({ error: "No se pudo buscar el job de transcripción." }, 500);
  const candidate = (candidates as JobRow[] | null)?.[0];
  if (!candidate) return jsonResponse({ processed: false, reason: requestedId ? "job_not_queued" : "no_queued_jobs" });

  const { data: claimed, error: claimError } = await supabase.from("transcription_jobs")
    .update({ status: "processing", started_at: now, progress: 0, error_code: null, error_message_sanitized: null })
    .eq("id", candidate.id).eq("status", "queued").select("id, audio_ingestion_id, attempts, status").maybeSingle();
  if (claimError || !claimed) return jsonResponse({ processed: false, reason: "job_already_claimed" }, 409);
  const job = claimed as JobRow;

  try {
    const { data: ingestion, error: ingestionError } = await supabase.from("audio_ingestions")
      .select("id, center_id, professional_id, patient_id, session_id, source, storage_path, mime_type").eq("id", job.audio_ingestion_id).maybeSingle();
    if (ingestionError || !ingestion) throw new Error("audio_ingestion_not_found");
    const row = ingestion as IngestionRow;
    if (!row.storage_path) throw new Error("audio_storage_path_missing");
    const { data: center, error: centerError } = await supabase.from("centers")
      .select("openai_api_key_encrypted").eq("id", row.center_id).maybeSingle();
    if (centerError || !center || !(center as { openai_api_key_encrypted?: string }).openai_api_key_encrypted) throw new Error("openai_key_not_configured");

    await supabase.from("audio_ingestions").update({ status: "transcription_processing" }).eq("id", row.id);
    const { data: audio, error: downloadError } = await supabase.storage.from(BUCKET).download(row.storage_path);
    if (downloadError || !audio) throw new Error("audio_download_failed");

    const provider: TranscriptionProvider = createOpenAITranscriptionProvider((center as { openai_api_key_encrypted: string }).openai_api_key_encrypted);
    const providerJob = await provider.startTranscription({ data: audio, fileName: row.storage_path, mimeType: row.mime_type ?? audio.type });
    await supabase.from("transcription_jobs").update({ provider: providerJob.provider, provider_model: providerJob.providerModel ?? null, provider_job_id: providerJob.providerJobId, progress: providerJob.status === "completed" ? 100 : 10 }).eq("id", job.id);
    const result = await provider.getTranscription(providerJob.providerJobId);
    if (result.status !== "completed" || !result.normalizedText?.trim()) throw result.error ?? new Error("empty_transcription");

    const { error: transcriptError } = await supabase.from("transcripts").insert({
      session_id: row.session_id, patient_id: row.patient_id, center_id: row.center_id, audio_ingestion_id: row.id,
      source: row.source, normalized_text: result.normalizedText, segments: result.segments ?? null,
      language: result.language ?? null, diarization_available: Boolean(result.segments?.some((segment) => segment.speaker)),
    });
    if (transcriptError) throw new Error("transcript_persist_failed");
    await supabase.from("transcription_jobs").update({ status: "completed", progress: 100, completed_at: new Date().toISOString(), next_retry_at: null }).eq("id", job.id);
    await supabase.from("audio_ingestions").update({ status: "transcription_verified" }).eq("id", row.id);
    if (row.session_id && row.patient_id) {
      await generateAutomaticReports(supabase, row, result.normalizedText);
    } else {
      console.log("[process-transcription-job] Se omiten informes automáticos: la ingestión no tiene session_id y patient_id confirmados.");
    }
    return jsonResponse({
      processed: true,
      transcriptionJobId: job.id,
      status: "completed",
      normalizedText: result.normalizedText,
    });
  } catch (error) {
    console.error("[process-transcription-job] Job failed:", safeError(error));
    await failJob(supabase, job, error);
    return jsonResponse({ processed: true, transcriptionJobId: job.id, status: (job.attempts + 1) > MAX_ATTEMPTS ? "failed" : "queued" }, 502);
  }
});
