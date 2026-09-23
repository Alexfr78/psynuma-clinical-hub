import { decryptSecret } from "./crypto.ts";
import {
  AudioReference,
  TranscriptionProvider,
  TranscriptionProviderError,
  TranscriptionProviderJob,
  TranscriptionProviderResult,
  TranscriptionSegment,
} from "./transcriptionProvider.ts";

export const MAX_CHUNK_SIZE = 24 * 1024 * 1024;

/**
 * Modelo de transcripción por defecto. `gpt-4o-transcribe-diarize` separa quién habla
 * (paciente/terapeuta), lo que mejora mucho los informes; exige `response_format=diarized_json`
 * y, para audios de más de 30 s, un `chunking_strategy`.
 *
 * DELIBERADO: nunca se envían `known_speaker_names`/`known_speaker_references`. Identificar a
 * una persona concreta por su voz exige subir muestras de voz, que son datos biométricos
 * (art. 9 RGPD) y no están cubiertos por el consentimiento vigente. Las etiquetas quedan en
 * "Hablante N" y es el modelo de informes quien deduce el rol por el contenido — ver
 * `transcriptDiarization.ts`.
 */
export const DEFAULT_STT_MODEL = "gpt-4o-transcribe-diarize";
/** Modelo al que se recurre si el de diarización falla: sin hablantes, pero con transcripción. */
export const FALLBACK_STT_MODEL = "gpt-transcribe";
/** Solo letras, números, puntos y guiones: el nombre acaba en el cuerpo de la petición. */
const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;

export function sanitizeSttModel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return MODEL_NAME_PATTERN.test(trimmed) ? trimmed : DEFAULT_STT_MODEL;
}

function supportsDiarization(model: string): boolean {
  return model.includes("diarize");
}

export function getAudioChunkCount(audioSize: number): number {
  return Math.max(1, Math.ceil(audioSize / MAX_CHUNK_SIZE));
}

export async function getAudioChunk(audio: Blob, chunkIndex: number, mimeType: string): Promise<Blob> {
  if (chunkIndex < 0 || chunkIndex >= getAudioChunkCount(audio.size)) {
    throw new Error("audio_chunk_index_out_of_range");
  }
  if (audio.size <= MAX_CHUNK_SIZE) return audio;

  const bytes = await audio.arrayBuffer();
  const start = chunkIndex * MAX_CHUNK_SIZE;
  return new Blob([bytes.slice(start, Math.min(start + MAX_CHUNK_SIZE, bytes.byteLength))], { type: mimeType });
}

interface StoredResult {
  result: TranscriptionProviderResult;
}

function providerError(code: string, message: string, retryable = true): Error & { providerError: TranscriptionProviderError } {
  const error = new Error(message) as Error & { providerError: TranscriptionProviderError };
  error.providerError = { code, message, retryable };
  return error;
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  private readonly results = new Map<string, StoredResult>();
  private readonly apiKey: Promise<string>;
  private readonly model: string;
  /** Modelo realmente usado en la última transcripción (puede ser el de reserva). */
  private lastModelUsed: string;

  constructor(encryptedApiKey: string, model?: string) {
    this.model = sanitizeSttModel(model);
    this.lastModelUsed = this.model;
    this.apiKey = decryptSecret(encryptedApiKey).then((rawKey) => {
      const key = rawKey.replace(/[^\x20-\x7E]/g, "").trim();
      if (!key || !key.startsWith("sk-")) {
        throw providerError("invalid_api_key", "The stored OpenAI API key is invalid.", false);
      }
      return key;
    });
  }

  async startTranscription(audio: AudioReference): Promise<TranscriptionProviderJob> {
    const providerJobId = crypto.randomUUID();
    const fileName = audio.fileName.toLowerCase();
    const extension = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")) : ".mp3";
    const mimeType = audio.mimeType || "audio/mpeg";

    try {
      const apiKey = await this.apiKey;
      const transcription = await this.transcribeAudio(audio.data, extension, mimeType, apiKey);
      this.results.set(providerJobId, {
        result: {
          providerJobId,
          status: "completed",
          normalizedText: transcription.text,
          segments: transcription.segments,
          language: "es",
        },
      });
      return { providerJobId, provider: "openai", providerModel: this.lastModelUsed, status: "completed" };
    } catch (error) {
      const typed = error as Error & { providerError?: TranscriptionProviderError };
      const providerFailure = typed.providerError ?? {
        code: "openai_transcription_failed",
        message: "OpenAI transcription failed.",
        retryable: true,
      };
      this.results.set(providerJobId, {
        result: { providerJobId, status: "failed", error: providerFailure },
      });
      return { providerJobId, provider: "openai", providerModel: this.lastModelUsed, status: "failed" };
    }
  }

  async getTranscription(providerJobId: string): Promise<TranscriptionProviderResult> {
    const stored = this.results.get(providerJobId);
    if (!stored) {
      return {
        providerJobId,
        status: "failed",
        error: { code: "provider_job_not_found", message: "Provider job not found.", retryable: false },
      };
    }
    return stored.result;
  }

  /**
   * Transcribe el fragmento con el modelo configurado. Si el de diarización falla por un
   * motivo que no es de cuenta (modelo no disponible para la organización, formato
   * rechazado...), se reintenta una vez con el modelo de reserva sin hablantes: es
   * preferible una transcripción plana a quedarse sin ella.
   */
  private async transcribeAudio(
    audio: Blob,
    extension: string,
    mimeType: string,
    apiKey: string,
  ): Promise<{ text: string; segments?: TranscriptionSegment[] }> {
    const chunk = await getAudioChunk(audio, 0, mimeType);
    try {
      this.lastModelUsed = this.model;
      return await requestTranscription(chunk, extension, mimeType, apiKey, this.model);
    } catch (error) {
      const failure = (error as { providerError?: TranscriptionProviderError }).providerError;
      const accountProblem = failure?.code === "insufficient_quota" || failure?.code === "authentication_failed";
      if (accountProblem || this.model === FALLBACK_STT_MODEL) throw error;
      console.warn(`[openai-stt] ${this.model} falló (${failure?.code ?? "desconocido"}); se reintenta con ${FALLBACK_STT_MODEL}.`);
      this.lastModelUsed = FALLBACK_STT_MODEL;
      return await requestTranscription(chunk, extension, mimeType, apiKey, FALLBACK_STT_MODEL);
    }
  }

}

interface DiarizedResponse {
  text?: string;
  segments?: { text?: string; speaker?: string; start?: number; end?: number }[];
}

/** Una llamada a /v1/audio/transcriptions con un modelo concreto. */
async function requestTranscription(
  chunk: Blob,
  extension: string,
  mimeType: string,
  apiKey: string,
  model: string,
): Promise<{ text: string; segments?: TranscriptionSegment[] }> {
  const diarize = supportsDiarization(model);
  const formData = new FormData();
  formData.append("file", new File([chunk], `audio_1${extension}`, { type: mimeType }));
  formData.append("model", model);
  if (diarize) {
    // Ambos son obligatorios en el modelo de diarización: el formato trae los turnos y
    // `chunking_strategy` es exigido para audios de más de 30 segundos.
    formData.append("response_format", "diarized_json");
    formData.append("chunking_strategy", "auto");
  } else {
    formData.append("language", "es");
    formData.append("response_format", model === "whisper-1" ? "text" : "json");
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!response.ok) {
    // Se lee el código de error de OpenAI para distinguir "sin saldo" (429
    // insufficient_quota) de un límite de velocidad normal: el worker trata los
    // problemas de cuenta como una espera, no como un intento fallido.
    let openaiCode = "";
    try {
      const body = await response.json() as { error?: { code?: string; type?: string } };
      openaiCode = body.error?.code || body.error?.type || "";
    } catch { /* Cuerpo no JSON: se clasifica solo por el estado HTTP. */ }
    const outOfCredit = openaiCode === "insufficient_quota" || openaiCode === "billing_hard_limit_reached";
    throw providerError(
      outOfCredit ? "insufficient_quota" : response.status === 401 ? "authentication_failed" : "openai_transcription_failed",
      outOfCredit ? "OpenAI account has no credit." : "OpenAI transcription request failed.",
      outOfCredit || response.status >= 500 || response.status === 429,
    );
  }

  if (!diarize && model === "whisper-1") return { text: (await response.text()).trim() };

  const body = await response.json() as DiarizedResponse;
  const segments: TranscriptionSegment[] = (body.segments ?? [])
    .map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? 0),
      text: (segment.text ?? "").trim(),
      speaker: typeof segment.speaker === "string" && segment.speaker.trim() ? segment.speaker.trim() : undefined,
    }))
    .filter((segment) => segment.text.length > 0);
  // `text` no siempre viene con diarized_json; se reconstruye desde los turnos.
  const text = (body.text ?? segments.map((segment) => segment.text).join(" ")).trim();
  if (!text) throw providerError("empty_transcription", "OpenAI returned an empty transcription.", true);
  return { text, segments: segments.some((segment) => segment.speaker) ? segments : undefined };
}

export function createOpenAITranscriptionProvider(encryptedApiKey: string, model?: string): TranscriptionProvider {
  return new OpenAITranscriptionProvider(encryptedApiKey, model);
}
