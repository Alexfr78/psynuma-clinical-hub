import { supabase } from '@/integrations/supabase/client';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';
import type { RecordingRecord } from './storage';

export async function recorderRequest<T>(name: string, body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(name, { body });
  if (error) throw new Error(await describeEdgeFunctionError(error, 'No se pudo completar la operación de audio.'));
  if (!data || data.error) throw new Error(data?.error || 'El servidor no respondió.');
  return data;
}
export async function uploadPart(record: RecordingRecord, partIndex: number, blob: Blob): Promise<void> {
  const { upload, alreadyUploaded } = await recorderRequest<{ alreadyUploaded?: boolean; upload?: { bucket: string; path: string; token: string } }>(
    'get-audio-part-upload-url', { audioIngestionId: record.id, partIndex, sizeBytes: blob.size },
  );
  if (alreadyUploaded) return;
  if (!upload) throw new Error('No se recibió la autorización para subir el audio.');
  const { error } = await supabase.storage.from(upload.bucket).uploadToSignedUrl(upload.path, upload.token, blob, {
    contentType: record.mimeType,
  });
  if (error) throw new Error('No se pudo subir una parte del audio. Se conserva para reintentar.');
}
