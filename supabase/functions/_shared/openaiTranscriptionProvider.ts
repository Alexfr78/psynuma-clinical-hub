import { decryptSecret } from "./crypto.ts";
import {
  AudioReference,
  TranscriptionProvider,
  TranscriptionProviderError,
  TranscriptionProviderJob,
  TranscriptionProviderResult,
} from "./transcriptionProvider.ts";

export const MAX_CHUNK_SIZE = 24 * 1024 * 1024;
const MODEL = "whisper-1";

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

  constructor(encryptedApiKey: string) {
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
      const chunks = await this.transcribeAudio(audio.data, extension, mimeType, apiKey);
      const normalizedText = chunks.join(" ").trim();
      this.results.set(providerJobId, {
        result: {
          providerJobId,
          status: "completed",
          normalizedText,
          language: "es",
        },
      });
      return { providerJobId, provider: "openai", providerModel: MODEL, status: "completed" };
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
      return { providerJobId, provider: "openai", providerModel: MODEL, status: "failed" };
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

  private async transcribeAudio(audio: Blob, extension: string, mimeType: string, apiKey: string): Promise<string[]> {
    const chunk = await getAudioChunk(audio, 0, mimeType);
    const formData = new FormData();
    formData.append("file", new File([chunk], `audio_1${extension}`, { type: mimeType }));
    formData.append("model", MODEL);
    formData.append("language", "es");
    formData.append("response_format", "text");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!response.ok) {
      throw providerError(
        response.status === 401 ? "authentication_failed" : "openai_transcription_failed",
        "OpenAI transcription request failed.",
        response.status >= 500 || response.status === 429,
      );
    }
    return [(await response.text()).trim()];
  }
}

export function createOpenAITranscriptionProvider(encryptedApiKey: string): TranscriptionProvider {
  return new OpenAITranscriptionProvider(encryptedApiKey);
}
