import { supabase } from "@/integrations/supabase/client";
import { describeEdgeFunctionError } from "@/lib/edge-function-error";

/**
 * Sube un audio y lo transcribe a través de la nueva capa de ingestión
 * (`audio_ingestions` / `transcription_jobs` / `transcripts`), en vez del
 * antiguo envío síncrono a `transcribe-session-audio`.
 *
 * Deliberadamente NO recibe `patientId`: crear la ingestión sin él impide
 * que la Fase 3 (generación automática de informes) se dispare en segundo
 * plano para estos flujos guiados por el profesional, que ya controlan qué
 * documento generar desde el propio diálogo — evita duplicar informes.
 *
 * Invoca `process-transcription-job` directamente (no espera al cron) para
 * mantener la misma latencia percibida que el flujo síncrono anterior.
 */

const BUCKET = "session-audio";

export interface UploadAndTranscribeParams {
  file: File;
  centerId: string;
  professionalId: string;
  sessionId?: string | null;
  source: "manual_upload" | "share_target";
}

export interface UploadAndTranscribeResult {
  audioIngestionId: string;
  transcription: string;
}

interface CreateAudioIngestionResponse {
  success: boolean;
  audioIngestionId: string;
  upload: { bucket: string; path: string; signedUrl: string; token: string };
  error?: string;
}

interface CompleteAudioUploadResponse {
  success: boolean;
  audioIngestionId: string;
  status: string;
  transcriptionJobId: string;
  error?: string;
}

interface ProcessTranscriptionJobResponse {
  processed: boolean;
  transcriptionJobId?: string;
  status?: string;
  normalizedText?: string;
  reason?: string;
  error?: string;
}

export async function uploadAndTranscribeAudio({
  file,
  centerId,
  professionalId,
  sessionId,
  source,
}: UploadAndTranscribeParams): Promise<UploadAndTranscribeResult> {
  const { data: created, error: createError } = await supabase.functions.invoke<CreateAudioIngestionResponse>(
    "create-audio-ingestion",
    {
      body: {
        centerId,
        professionalId,
        sessionId: sessionId ?? null,
        source,
        mimeType: file.type || null,
        sizeBytes: file.size,
        recordedAt: new Date().toISOString(),
      },
    },
  );
  if (createError) throw new Error(await describeEdgeFunctionError(createError, "No se pudo iniciar la subida del audio"));
  if (!created?.success) throw new Error(created?.error || "No se pudo iniciar la subida del audio");

  const { audioIngestionId, upload } = created;

  const { error: uploadError } = await supabase.storage
    .from(upload.bucket || BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file);
  if (uploadError) throw new Error(`No se pudo subir el audio: ${uploadError.message}`);

  const { data: completed, error: completeError } = await supabase.functions.invoke<CompleteAudioUploadResponse>(
    "complete-audio-upload",
    { body: { audioIngestionId, sizeBytes: file.size } },
  );
  if (completeError) throw new Error(await describeEdgeFunctionError(completeError, "No se pudo confirmar la subida del audio"));
  if (!completed?.success) throw new Error(completed?.error || "No se pudo confirmar la subida del audio");

  const { data: processed, error: processError } = await supabase.functions.invoke<ProcessTranscriptionJobResponse>(
    "process-transcription-job",
    { body: { transcriptionJobId: completed.transcriptionJobId } },
  );
  if (processError) {
    // `process-transcription-job` devuelve 502 (no 2xx) cuando la transcripción falla, así que
    // supabase-js lo trata como error de red aunque el cuerpo sea JSON válido con el motivo real.
    const context = (processError as { context?: unknown } | null)?.context;
    let failureBody: ProcessTranscriptionJobResponse | null = null;
    if (context instanceof Response) {
      try {
        failureBody = (await context.clone().json()) as ProcessTranscriptionJobResponse;
      } catch {
        // Cuerpo no leíble como JSON: cae al mensaje genérico de abajo.
      }
    }
    if (failureBody?.processed) {
      throw new Error(
        failureBody.status === "queued"
          ? "La transcripción falló pero se reintentará automáticamente en unos minutos. Vuelve a abrir esta sesión más tarde."
          : "No se pudo transcribir el audio tras varios intentos. Revisa el archivo o inténtalo de nuevo.",
      );
    }
    throw new Error(await describeEdgeFunctionError(processError, "Error al transcribir el audio"));
  }
  if (!processed?.processed || processed.status !== "completed" || !processed.normalizedText) {
    throw new Error(processed?.error || "No se pudo completar la transcripción. Vuelve a intentarlo en unos minutos.");
  }

  return { audioIngestionId, transcription: processed.normalizedText };
}
