import { authorizeWebRecording, listWebRecordingParts, removeWebRecordingParts, WEB_AUDIO_BUCKET, webRecordingCors, WebRecordingError, webRecordingResponse } from "../_shared/webRecording.ts";
import { validateWebRecordingParts, WEB_RECORDING_MAX_BYTES } from "../_shared/webRecordingParts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: webRecordingCors });
  try {
    const body = await req.json();
    const { supabase, ingestion, path, partsPath } = await authorizeWebRecording(req, body.audioIngestionId);
    const bucket = supabase.storage.from(WEB_AUDIO_BUCKET);
    if (body.discard === true) {
      if (!["uploading", "audio_deleted"].includes(ingestion.status)) throw new WebRecordingError("La grabación ya está en proceso de transcripción", 409);
      if (ingestion.status === "uploading") {
        const { data, error } = await supabase.from("audio_ingestions").update({ status: "audio_deleted", deleted_at: new Date().toISOString() }).eq("id", ingestion.id).eq("status", "uploading").select("id").maybeSingle();
        if (error || !data) throw new WebRecordingError("La grabación cambió de estado; vuelve a intentarlo", 409);
      }
      await removeWebRecordingParts(supabase, partsPath);
      const { error } = await bucket.remove([path]);
      if (error) throw new WebRecordingError("No se pudo eliminar el audio; vuelve a intentarlo", 503);
      // Retain the id-only path for cron to remove uploads from outstanding signed URLs.
      return webRecordingResponse({ success: true, status: "audio_deleted" });
    }
    if (["audio_deleted", "expired_unprocessed"].includes(ingestion.status)) {
      const { data: completed } = await supabase.from("transcription_jobs").select("id").eq("audio_ingestion_id", ingestion.id).eq("status", "completed").maybeSingle();
      if (completed) return webRecordingResponse({ success: true, audioIngestionId: ingestion.id, transcriptionJobId: completed.id, status: "transcription_verified" });
      throw new WebRecordingError("La grabación ha sido eliminada o ha caducado", 410);
    }
    if (ingestion.status === "uploading") {
      if (!Number.isFinite(body.durationMs) || body.durationMs < 0 || body.durationMs > 120 * 60 * 1000) throw new WebRecordingError("La duración debe estar entre cero y 120 minutos");
      const files = await listWebRecordingParts(supabase, partsPath);
      let names: string[];
      try { names = validateWebRecordingParts(files.map((file) => file.name), body.partCount); }
      catch (error) { throw new WebRecordingError((error as Error).message, 409); }
      const declaredSize = files.reduce((sum, file) => sum + Number(file.metadata?.size ?? 0), 0);
      if (declaredSize >= WEB_RECORDING_MAX_BYTES) throw new WebRecordingError("La grabación debe ocupar menos de 24 MB para transcribirse como un único archivo", 413);
      const blobs: Blob[] = [];
      let size = 0;
      // Bounded concurrency keeps 720 normal timeslices within edge wall-clock limits.
      for (let offset = 0; offset < names.length; offset += 8) {
        const batch = await Promise.all(names.slice(offset, offset + 8).map(async (name) => {
          const { data, error } = await bucket.download(`${partsPath}/${name}`);
          if (error || !data) throw new WebRecordingError("No se pudo leer una parte; vuelve a intentar finalizar", 503);
          return data;
        }));
        for (const blob of batch) {
          size += blob.size;
          if (size >= WEB_RECORDING_MAX_BYTES) throw new WebRecordingError("La grabación debe ocupar menos de 24 MB para transcribirse como un único archivo", 413);
          blobs.push(blob);
        }
      }
      if (!size) throw new WebRecordingError("La grabación está vacía", 409);
      const audio = new Blob(blobs, { type: ingestion.mime_type || "audio/webm" });
      const { error: uploadError } = await bucket.upload(path, audio, { contentType: audio.type, upsert: false });
      if (uploadError) {
        // A previous finalize may have stored the file before losing its response.
        const { data: existing, error } = await bucket.download(path);
        if (error || !existing || existing.size !== size) throw new WebRecordingError("No se pudo guardar el audio final; vuelve a intentarlo", 503);
        const [expectedHash, existingHash] = await Promise.all([audio.arrayBuffer(), existing.arrayBuffer()].map(async (buffer) => {
          const hash = await crypto.subtle.digest("SHA-256", await buffer);
          return Array.from(new Uint8Array(hash)).join(",");
        }));
        if (expectedHash !== existingHash) throw new WebRecordingError("El archivo final no coincide con las partes", 409);
      }
      const { data: updated, error } = await supabase.from("audio_ingestions").update({
        status: "uploaded", uploaded_at: new Date().toISOString(), size_bytes: size,
        duration_ms: body.durationMs, storage_path: path,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      }).eq("id", ingestion.id).eq("status", "uploading").select("id").maybeSingle();
      if (error) throw new WebRecordingError("No se pudo confirmar el audio; vuelve a intentarlo", 503);
      if (!updated) {
        const { data: current } = await supabase.from("audio_ingestions").select("status").eq("id", ingestion.id).single();
        if (!current || ["audio_deleted", "expired_unprocessed"].includes(current.status)) {
          await bucket.remove([path]);
          throw new WebRecordingError("La grabación se ha descartado", 409);
        }
      }
    }
    // A deterministic primary key gives concurrent requests one job without schema changes.
    const { data: existingJob, error: lookupError } = await supabase.from("transcription_jobs").select("id, status").eq("audio_ingestion_id", ingestion.id).maybeSingle();
    if (lookupError) throw new WebRecordingError("No se pudo consultar la transcripción", 503);
    let jobId = existingJob?.id as string | undefined;
    if (!jobId) {
      const { error } = await supabase.from("transcription_jobs").upsert({ id: ingestion.id, audio_ingestion_id: ingestion.id, mode: "async", status: "queued" }, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw new WebRecordingError("No se pudo encolar la transcripción; vuelve a intentar finalizar", 503);
      jobId = ingestion.id;
    }
    const { error: statusError } = await supabase.from("audio_ingestions").update({ status: "queued_for_transcription" }).eq("id", ingestion.id).eq("status", "uploaded");
    if (statusError) throw new WebRecordingError("No se pudo actualizar el estado; vuelve a intentarlo", 503);
    // Cleanup is retryable by cron and must never undo a successfully queued job.
    try { await removeWebRecordingParts(supabase, partsPath); }
    catch { console.warn("[finalize-web-recording] Part cleanup deferred", ingestion.id); }
    return webRecordingResponse({ success: true, audioIngestionId: ingestion.id, transcriptionJobId: jobId, status: existingJob?.status === "completed" ? "transcription_verified" : "queued_for_transcription" });
  } catch (error) {
    return webRecordingResponse({ error: error instanceof WebRecordingError ? error.message : "No se pudo finalizar la grabación; vuelve a intentarlo" }, error instanceof WebRecordingError ? error.status : 500);
  }
});
