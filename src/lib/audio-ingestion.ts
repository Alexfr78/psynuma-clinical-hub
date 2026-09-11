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
 * Intenta invocar `process-transcription-job` directamente (no espera al
 * cron) para mantener una latencia similar a la del flujo síncrono anterior.
 * Si esa llamada falla o tarda demasiado — puede pasar en sesiones largas,
 * el edge function puede superar el límite de inactividad de Supabase antes
 * de terminar — NO se trata como error: la transcripción puede seguir
 * completándose en el servidor, así que se cae a sondear el estado hasta
 * que aparezca el resultado o venza un margen razonable.
 */

const BUCKET = "session-audio";
const POLL_INTERVAL_MS = 5000;
// Cubre el peor caso: hasta 5 min hasta el siguiente tick del cron de reintento
// más el propio tiempo de transcripción.
const POLL_TIMEOUT_MS = 8 * 60 * 1000;

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
  reason?: string;
  error?: string;
}

async function pollForTranscript(audioIngestionId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const { data: ingestion } = await supabase
      .from("audio_ingestions")
      .select("status")
      .eq("id", audioIngestionId)
      .maybeSingle();
    const status = (ingestion as { status?: string } | null)?.status;

    if (status === "transcription_verified") {
      const { data: transcript } = await supabase
        .from("transcripts")
        .select("normalized_text")
        .eq("audio_ingestion_id", audioIngestionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const text = (transcript as { normalized_text?: string | null } | null)?.normalized_text;
      if (text) return text;
      // Estado ya verificado pero la fila de transcripción aún no es visible (replicación);
      // se reintenta en la siguiente vuelta en vez de fallar.
    } else if (status === "failed") {
      throw new Error("No se pudo transcribir el audio tras varios intentos. Revisa el archivo o inténtalo de nuevo.");
    }
  }
  throw new Error(
    "La transcripción está tardando más de lo normal, pero sigue en proceso en segundo plano. Vuelve a abrir esta sesión en unos minutos.",
  );
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

  // La función reclama el job y responde mientras la transcripción sigue en segundo plano.
  // El resultado final se obtiene siempre desde audio_ingestions y transcripts.
  let processInvocationError: string | null = null;
  try {
    const { error: processError } = await supabase.functions.invoke<ProcessTranscriptionJobResponse>(
      "process-transcription-job",
      { body: { transcriptionJobId: completed.transcriptionJobId } },
    );
    if (processError) {
      const status = (processError as { context?: { status?: number } }).context?.status;
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        processInvocationError = await describeEdgeFunctionError(processError, "No se pudo iniciar la transcripcion");
      }
    }
  } catch {
    // Error de red/timeout en la propia llamada: se ignora aquí, se resuelve por sondeo.
  }
  if (processInvocationError) throw new Error(processInvocationError);

  const transcription = await pollForTranscript(audioIngestionId);
  return { audioIngestionId, transcription };
}
