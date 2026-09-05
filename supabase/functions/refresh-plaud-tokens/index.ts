import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getValidPlaudAccessToken } from "../_shared/plaud.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Proactively refresh Plaud access tokens before they expire, so the first
// ingestion call after a quiet period isn't the one paying for the refresh
// round-trip. Plaud access tokens are assumed to last ~3600s like every
// other OAuth provider integrated in this codebase — NOT confirmed with a
// real token (see delivery notes) — so a 20 minute buffer with this
// function running every 15 minutes comfortably covers the gap.
const EXPIRY_BUFFER_MS = 20 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[refresh-plaud-tokens] CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Function not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only enabled, healthy connections whose token is close to expiring.
  // getValidPlaudAccessToken() is itself the source of truth for "should we
  // even try" (it treats enabled=false and needs_reconnect=true as no-ops),
  // but filtering here too avoids querying/decrypting rows we'd skip anyway.
  const { data: connections, error: fetchError } = await supabase
    .from("center_plaud_connections")
    .select("center_id")
    .eq("enabled", true)
    .eq("needs_reconnect", false)
    .lt("token_expires_at", new Date(Date.now() + EXPIRY_BUFFER_MS).toISOString());

  if (fetchError) {
    console.error("[refresh-plaud-tokens] Error fetching connections:", fetchError);
    return new Response(JSON.stringify({ error: "Failed to fetch connections" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let refreshed = 0;
  let reconnectNeeded = 0;
  let failed = 0;

  for (const connection of connections || []) {
    const result = await getValidPlaudAccessToken(supabase, connection.center_id);
    if (result.accessToken) {
      refreshed++;
    } else if (result.reason === "needs_reconnect") {
      reconnectNeeded++;
    } else {
      failed++;
    }
  }

  console.log(`[refresh-plaud-tokens] Done. refreshed=${refreshed} reconnectNeeded=${reconnectNeeded} failed=${failed} total=${connections?.length || 0}`);

  return new Response(
    JSON.stringify({ refreshed, reconnectNeeded, failed, total: connections?.length || 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
