/**
 * Vacía `plaud_recordings.transcript_text` cuando pasa `transcript_expires_at`
 * (retención corta de 30 días, fijada por `sync-plaud-recordings`). Cron-only,
 * mismo patrón de autenticación que `refresh-plaud-tokens` (header
 * `x-cron-secret` comparado con el secreto `CRON_SECRET`).
 *
 * El trabajo real lo hace `public.cleanup_expired_plaud_transcripts()` (ver
 * migración `20260906090000_plaud_recordings.sql`) — esta función solo
 * autentica la llamada de cron y la invoca. No hay contenido clínico que
 * loguear aquí: solo se informa cuántas filas se vaciaron.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[cleanup-plaud-transcripts] CRON_SECRET not configured");
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

  const { data, error } = await supabase.rpc("cleanup_expired_plaud_transcripts");

  if (error) {
    console.error("[cleanup-plaud-transcripts] Cleanup failed:", error.message);
    return new Response(JSON.stringify({ error: "Cleanup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[cleanup-plaud-transcripts] Done.", data);

  return new Response(JSON.stringify(data ?? { cleared: 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
