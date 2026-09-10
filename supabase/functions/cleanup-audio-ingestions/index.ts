/**
 * Limpieza de audios huérfanos: marca `audio_ingestions.status =
 * expired_unprocessed` (vía `public.cleanup_orphan_audio_ingestions()`) para
 * ingestiones cuya transcripción no se completó en 7 días o cuya subida nunca
 * terminó, y a continuación borra el objeto físico en el bucket
 * `session-audio` para cada fila marcada. Cron-only, mismo patrón de
 * autenticación que `cleanup-plaud-transcripts` (header `x-cron-secret`
 * comparado con `CRON_SECRET`).
 *
 * No hay contenido clínico que loguear aquí: solo cuántas filas se expiraron
 * y cuántos objetos de Storage se borraron.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const BUCKET = "session-audio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[cleanup-audio-ingestions] CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Function not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: expireResult, error: expireError } = await supabase.rpc("cleanup_orphan_audio_ingestions");

  if (expireError) {
    console.error("[cleanup-audio-ingestions] Expiry step failed:", expireError.message);
    return new Response(JSON.stringify({ error: "Cleanup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Borra el objeto físico en Storage para las filas ya marcadas como
  // expired_unprocessed / audio_deleted que todavía tienen storage_path
  // (evita reintentar borrados sobre filas ya limpiadas en una ejecución
  // anterior).
  const { data: pendingDeletion, error: fetchError } = await supabase
    .from("audio_ingestions")
    .select("id, storage_path")
    .in("status", ["expired_unprocessed", "transcription_verified"])
    .not("storage_path", "is", null);

  let deletedObjects = 0;
  if (fetchError) {
    console.error("[cleanup-audio-ingestions] Failed to list pending deletions:", fetchError.message);
  } else if (pendingDeletion && pendingDeletion.length > 0) {
    const paths = pendingDeletion.map((row) => row.storage_path as string);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);

    if (removeError) {
      console.error("[cleanup-audio-ingestions] Storage removal failed:", removeError.message);
    } else {
      deletedObjects = paths.length;
      const ids = pendingDeletion.map((row) => row.id as string);
      await supabase
        .from("audio_ingestions")
        .update({ status: "audio_deleted", storage_path: null, deleted_at: new Date().toISOString() })
        .in("id", ids);
    }
  }

  const result = {
    ...(expireResult as Record<string, unknown>),
    deletedObjects,
  };

  console.log("[cleanup-audio-ingestions] Done.", result);

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
