import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { DriveReconnectError, refreshDriveAccessToken } from "../_shared/googleDrive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Proactively refresh Drive access tokens before they expire, so the first
// invoice upload after a quiet period isn't the one paying for the refresh
// round-trip (and so a revoked refresh token surfaces here instead of
// failing a real upload). Run every 15-20 minutes; Drive access tokens last
// ~1h, so a 20 minute buffer comfortably covers the gap between runs.
const EXPIRY_BUFFER_MS = 20 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[refresh-google-drive-tokens] CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Function not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (cronSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: connections, error: fetchError } = await supabase
    .from("center_drive_connections")
    .select("center_id, refresh_token_encrypted, token_expires_at")
    .eq("enabled", true)
    .eq("needs_reconnect", false)
    .lt("token_expires_at", new Date(Date.now() + EXPIRY_BUFFER_MS).toISOString());

  if (fetchError) {
    console.error("[refresh-google-drive-tokens] Error fetching connections:", fetchError);
    return new Response(JSON.stringify({ error: "Failed to fetch connections" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let refreshed = 0;
  let reconnectNeeded = 0;
  let failed = 0;

  for (const connection of connections || []) {
    try {
      const { data: center } = await supabase
        .from("centers")
        .select("oauth_google_drive_client_id, oauth_google_drive_credentials")
        .eq("id", connection.center_id)
        .single();

      if (!center?.oauth_google_drive_client_id || !center?.oauth_google_drive_credentials || !connection.refresh_token_encrypted) {
        failed++;
        continue;
      }

      const clientSecret = await decryptSecret(center.oauth_google_drive_credentials);
      const refreshToken = await decryptSecret(connection.refresh_token_encrypted);
      const newTokenData = await refreshDriveAccessToken(refreshToken, center.oauth_google_drive_client_id, clientSecret);

      await supabase
        .from("center_drive_connections")
        .update({
          access_token_encrypted: await encryptSecret(newTokenData.access_token),
          token_expires_at: new Date(Date.now() + newTokenData.expires_in * 1000).toISOString(),
        })
        .eq("center_id", connection.center_id);

      refreshed++;
    } catch (error) {
      if (error instanceof DriveReconnectError) {
        await supabase
          .from("center_drive_connections")
          .update({
            needs_reconnect: true,
            last_upload_error: "El acceso a Google Drive fue revocado. Reconecta desde Configuracion.",
          })
          .eq("center_id", connection.center_id);
        reconnectNeeded++;
      } else {
        console.error(`[refresh-google-drive-tokens] Error refreshing center ${connection.center_id}:`, error);
        failed++;
      }
    }
  }

  console.log(`[refresh-google-drive-tokens] Done. refreshed=${refreshed} reconnectNeeded=${reconnectNeeded} failed=${failed} total=${connections?.length || 0}`);

  return new Response(
    JSON.stringify({ refreshed, reconnectNeeded, failed, total: connections?.length || 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
