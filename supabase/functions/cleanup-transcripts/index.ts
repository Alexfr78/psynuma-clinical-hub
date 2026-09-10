/**
 * Vacía `transcripts.normalized_text` / `segments` cuando pasa `expires_at`
 * (retención de 30 días). Cron-only, mismo patrón de autenticación que
 * `cleanup-plaud-transcripts` (header `x-cron-secret` comparado con
 * `CRON_SECRET`).
 *
 * El trabajo real lo hace `public.cleanup_expired_transcripts()` — esta
 * función solo autentica la llamada de cron y la invoca. No hay contenido
 * clínico que loguear aquí: solo cuántas filas se vaciaron.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[cleanup-transcripts] CRON_SECRET not configured");
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

  const { data, error } = await supabase.rpc("cleanup_expired_transcripts");

  if (error) {
    console.error("[cleanup-transcripts] Cleanup failed:", error.message);
    return new Response(JSON.stringify({ error: "Cleanup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[cleanup-transcripts] Done.", data);

  return new Response(JSON.stringify(data ?? { cleared: 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
