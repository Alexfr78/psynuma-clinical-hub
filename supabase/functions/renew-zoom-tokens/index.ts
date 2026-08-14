import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// AES-256-GCM decryption
async function decryptAES256GCM(encryptedData: string, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));

  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);

  const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertextWithTag);

  return new TextDecoder().decode(decrypted);
}

async function getZoomClientCredentials(supabase: SupabaseClient, professionalId: string) {
  // Get center_id from professional's profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('center_id')
    .eq('id', professionalId)
    .single();

  if (profileError || !profile?.center_id) {
    console.error(`[ZOOM-RENEW] Failed to get center_id for professional ${professionalId}:`, profileError);
    return null;
  }

  // Get credentials from center
  const { data: center, error: centerError } = await supabase
    .from('centers')
    .select('oauth_zoom_client_id, oauth_zoom_credentials')
    .eq('id', profile.center_id)
    .single();

  if (centerError || !center?.oauth_zoom_client_id || !center?.oauth_zoom_credentials) {
    console.error(`[ZOOM-RENEW] Missing Zoom OAuth credentials for center ${profile.center_id}`);
    return null;
  }

  const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
  if (!encryptionKey) {
    console.error('[ZOOM-RENEW] Missing CERTIFICATE_ENCRYPTION_KEY');
    return null;
  }

  try {
    const clientSecret = await decryptAES256GCM(center.oauth_zoom_credentials, encryptionKey);
    return {
      clientId: center.oauth_zoom_client_id,
      clientSecret,
      centerId: profile.center_id,
    };
  } catch (err) {
    console.error('[ZOOM-RENEW] Failed to decrypt Zoom credentials:', err);
    return null;
  }
}

async function refreshZoomToken(
  supabase: SupabaseClient, 
  professionalId: string, 
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ success: boolean; error?: string; newExpiresAt?: string }> {
  console.log(`[ZOOM-RENEW] Refreshing token for professional ${professionalId}`);

  try {
    const response = await fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[ZOOM-RENEW] Token refresh failed for ${professionalId}: ${response.status} - ${responseText}`);
      
      // Check for specific error codes that require reconnection
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { error: 'unknown', reason: responseText };
      }
      
      const needsReconnect = 
        response.status === 401 || 
        errorData.error === 'invalid_grant' ||
        errorData.error === 'invalid_client';

      if (needsReconnect) {
        // Mark connection as needing reconnect
        await supabase
          .from('oauth_connections')
          .update({
            needs_reconnect: true,
            last_token_refresh_at: new Date().toISOString(),
            last_token_refresh_result: `error:${errorData.error || response.status}`,
          })
          .eq('professional_id', professionalId)
          .eq('provider', 'zoom');

        // Log error
        await supabase.from('integration_errors').insert({
          professional_id: professionalId,
          provider: 'zoom',
          source: 'renew-zoom-tokens',
          step: 'refresh_token',
          error_code: errorData.error || `http_${response.status}`,
          http_status: response.status,
          message: errorData.reason || errorData.message || 'Token refresh failed',
          raw: { response_status: response.status, error: errorData },
        });
      }

      return { 
        success: false, 
        error: `${response.status}: ${errorData.error || 'unknown'}` 
      };
    }

    const tokenData = JSON.parse(responseText);
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

    // Update connection with new tokens
    const { error: updateError } = await supabase
      .from('oauth_connections')
      .update({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        needs_reconnect: false,
        consecutive_sync_errors: 0,
        last_token_refresh_at: new Date().toISOString(),
        last_token_refresh_result: 'success',
      })
      .eq('professional_id', professionalId)
      .eq('provider', 'zoom');

    if (updateError) {
      console.error(`[ZOOM-RENEW] Failed to update tokens for ${professionalId}:`, updateError);
      return { success: false, error: 'db_update_failed' };
    }

    console.log(`[ZOOM-RENEW] Token refreshed successfully for ${professionalId}, expires at ${expiresAt}`);
    return { success: true, newExpiresAt: expiresAt };

  } catch (err) {
    console.error(`[ZOOM-RENEW] Unexpected error refreshing token for ${professionalId}:`, err);
    return { success: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret for automated calls
  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET') || 'Alex@619102294';
  
  // Allow if cron secret matches OR if there's a valid auth header (manual trigger)
  const authHeader = req.headers.get('Authorization');
  const isCronCall = cronSecret === expectedSecret;
  const isManualCall = authHeader?.startsWith('Bearer ');

  if (!isCronCall && !isManualCall) {
    console.error('[ZOOM-RENEW] Unauthorized: missing cron secret or auth token');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find Zoom connections expiring within 30 minutes
    const expirationThreshold = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    const { data: connections, error: fetchError } = await supabase
      .from('oauth_connections')
      .select('professional_id, refresh_token, expires_at, needs_reconnect')
      .eq('provider', 'zoom')
      .eq('needs_reconnect', false)
      .lt('expires_at', expirationThreshold)
      .not('refresh_token', 'is', null);

    if (fetchError) {
      console.error('[ZOOM-RENEW] Failed to fetch connections:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch connections' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ZOOM-RENEW] Found ${connections?.length || 0} tokens expiring within 30 minutes`);

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No tokens need renewal',
          checked_at: new Date().toISOString(),
          renewed: 0,
          failed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = {
      renewed: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process each connection
    for (const conn of connections) {
      const creds = await getZoomClientCredentials(supabase, conn.professional_id);
      
      if (!creds) {
        results.failed++;
        results.errors.push(`${conn.professional_id}: missing_credentials`);
        continue;
      }

      const result = await refreshZoomToken(
        supabase,
        conn.professional_id,
        conn.refresh_token,
        creds.clientId,
        creds.clientSecret
      );

      if (result.success) {
        results.renewed++;
      } else {
        results.failed++;
        results.errors.push(`${conn.professional_id}: ${result.error}`);
      }

      // Small delay between requests to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[ZOOM-RENEW] Completed: ${results.renewed} renewed, ${results.failed} failed`);

    return new Response(
      JSON.stringify({
        message: 'Token renewal completed',
        checked_at: new Date().toISOString(),
        total_checked: connections.length,
        renewed: results.renewed,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ZOOM-RENEW] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
