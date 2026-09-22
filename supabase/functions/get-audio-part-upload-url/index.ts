import { authorizeWebRecording, WEB_AUDIO_BUCKET, webRecordingCors, WebRecordingError, webRecordingResponse } from "../_shared/webRecording.ts";
import { webRecordingPartName } from "../_shared/webRecordingParts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: webRecordingCors });
  try {
    const body = await req.json();
    const { supabase, ingestion, partsPath } = await authorizeWebRecording(req, body.audioIngestionId);
    if (!Number.isInteger(body.sizeBytes) || body.sizeBytes <= 0 || body.sizeBytes >= 24 * 1024 * 1024) throw new WebRecordingError("Tamaño de parte no válido");
    if (ingestion.status !== "uploading") throw new WebRecordingError("La grabación ya no admite partes", 409);
    const path = `${partsPath}/${webRecordingPartName(body.partIndex)}`;
    const { data: existing, error: listError } = await supabase.storage.from(WEB_AUDIO_BUCKET).list(partsPath, { search: webRecordingPartName(body.partIndex), limit: 1 });
    if (listError) throw new WebRecordingError("No se pudo comprobar la parte", 503);
    const existingPart = existing?.find((file) => file.name === webRecordingPartName(body.partIndex));
    if (existingPart) {
      if (Number(existingPart.metadata?.size) !== body.sizeBytes) throw new WebRecordingError("La parte almacenada tiene un tamaño diferente", 409);
      return webRecordingResponse({ success: true, alreadyUploaded: true });
    }
    // Immutable objects: a lost response may be retried, but cannot replace audio.
    const { data, error } = await supabase.storage.from(WEB_AUDIO_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new WebRecordingError("No se pudo preparar la subida de la parte", 503);
    return webRecordingResponse({ success: true, upload: { bucket: WEB_AUDIO_BUCKET, path, token: data.token, signedUrl: data.signedUrl } });
  } catch (error) {
    return webRecordingResponse({ error: error instanceof WebRecordingError ? error.message : "No se pudo preparar la parte de audio" }, error instanceof WebRecordingError ? error.status : 400);
  }
});
