/** Generic contract for speech-to-text providers. */

export type TranscriptionProviderStatus =
  | "in_progress"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TranscriptionProviderError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface AudioReference {
  data: Blob;
  fileName: string;
  mimeType?: string;
}

export interface TranscriptionProviderJob {
  providerJobId: string;
  provider: string;
  providerModel?: string;
  status: TranscriptionProviderStatus;
}

export interface TranscriptionProviderResult {
  providerJobId: string;
  status: TranscriptionProviderStatus;
  normalizedText?: string;
  segments?: TranscriptionSegment[];
  language?: string;
  error?: TranscriptionProviderError;
}

export interface TranscriptionProvider {
  startTranscription(audio: AudioReference): Promise<TranscriptionProviderJob>;
  getTranscription(providerJobId: string): Promise<TranscriptionProviderResult>;
}
