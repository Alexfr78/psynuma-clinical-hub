import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// ===================== CONFIGURATION =====================
const RENEWAL_MARGIN_HOURS = 48; // Renew channels expiring within this many hours
const BATCH_SIZE = 50; // Max connections to process per execution
const DELAY_BETWEEN_RENEWALS_MS = 200; // Delay between each renewal to avoid rate limits

// ===================== OAUTH HELPERS =====================
function last4(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? value : value.slice(-4);
}

type GoogleOAuthCreds = {
  clientId: string;
  clientSecret: string;
  source: 'center' | 'env';
  centerId: string | null;
  decryptFailed: boolean;
  oauth_client_id_last4: string | null;
  env_client_id_last4: string | null;
};

async function getGoogleOAuthCredentials(
  supabase: SupabaseClient,
  professionalId: string
): Promise<GoogleOAuthCreds | null> {
  const envClientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const envClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const envClientIdLast4 = last4(envClientId);

  let centerId: string | null = null;
  let centerClientIdLast4: string | null = null;
  let decryptFailed = false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('center_id')
    .eq('id', professionalId)
    .single();

  centerId = profile?.center_id ?? null;

  if (centerId) {
    const { data: center } = await supabase
      .from('centers')
      .select('oauth_google_client_id, oauth_google_credentials')
      .eq('id', centerId)
      .single();

    centerClientIdLast4 = last4(center?.oauth_google_client_id);

    if (center?.oauth_google_client_id && center?.oauth_google_credentials) {
      try {
        // Use shared decryptSecret - it handles the encryption key internally
        const clientSecret = await decryptSecret(center.oauth_google_credentials);
        console.log(
          `[CRON:RENEW:CREDS] Using center credentials ${JSON.stringify({ using_center_credentials: true, center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4 })}`
        );
        return {
          clientId: center.oauth_google_client_id,
          clientSecret,
          source: 'center',
          centerId,
          decryptFailed: false,
          oauth_client_id_last4: centerClientIdLast4,
          env_client_id_last4: envClientIdLast4,
        };
      } catch (error) {
        decryptFailed = true;
        const errorMsg = error instanceof Error ? error.message : 'unknown';
        console.error(
          `[CRON:RENEW:CREDS] Decrypt failed ${JSON.stringify({ decrypt_failed: true, center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4, error: errorMsg })}`
        );
      }
    } else {
      console.log(
        `[CRON:RENEW:CREDS] Center has no OAuth creds ${JSON.stringify({ center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4 })}`
      );
    }
  } else {
    console.log(`[CRON:RENEW:CREDS] No center for professional ${professionalId}, using env vars`);
  }

  if (envClientId && envClientSecret) {
    console.log(
      `[CRON:RENEW:CREDS] Using env credentials ${JSON.stringify({ using_center_credentials: false, center_id: centerId, decrypt_failed: decryptFailed, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4 })}`
    );
    return {
      clientId: envClientId,
      clientSecret: envClientSecret,
      source: 'env',
      centerId,
      decryptFailed,
      oauth_client_id_last4: centerClientIdLast4,
      env_client_id_last4: envClientIdLast4,
    };
  }

  console.error(
    `[CRON:RENEW:CREDS] No OAuth credentials available ${JSON.stringify({ professional_id: professionalId, center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4, decrypt_failed: decryptFailed })}`
  );
  return null;
}

async function refreshGoogleToken(
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string
): Promise<{ accessToken: string | null; error?: string; errorDescription?: string }> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    return { accessToken: null, error: 'no_oauth_credentials' };
  }

  try {
    console.log(
      `[CRON:RENEW:TOKEN] Calling oauth2/token ${JSON.stringify({
        using_center_credentials: credentials.source === 'center',
        center_id: credentials.centerId,
        oauth_client_id_last4: credentials.oauth_client_id_last4,
        env_client_id_last4: credentials.env_client_id_last4,
        decrypt_failed: credentials.decryptFailed,
      })}`
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
      await supabase
        .from('oauth_connections')
        .update({
          access_token: data.access_token,
          expires_at: expiresAt,
          updated_at: new Date().toISOString(),
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'success',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      return { accessToken: data.access_token };
    }

    // Log OAuth error details (without secrets)
    console.error(`[CRON:RENEW:TOKEN] OAuth error for ${professionalId}: ${data.error} - ${data.error_description || 'no description'} (creds source: ${credentials.source})`);

    // Handle specific OAuth errors
    if (data.error === 'invalid_grant') {
      return { accessToken: null, error: 'token_revoked', errorDescription: data.error_description };
    }
    if (data.error === 'invalid_client') {
      return { accessToken: null, error: 'oauth_credentials_invalid', errorDescription: data.error_description };
    }

    return { accessToken: null, error: data.error || 'token_refresh_failed', errorDescription: data.error_description };
  } catch (error) {
    console.error(`[CRON:RENEW:TOKEN] Exception for ${professionalId}:`, error);
    return { accessToken: null, error: 'token_refresh_exception' };
  }
}

// ===================== CHANNEL HELPERS =====================
async function stopExistingChannel(
  accessToken: string,
  channelId: string,
  resourceId: string
): Promise<boolean> {
  try {
    const response = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        resourceId: resourceId,
      }),
    });
    // 404/410 means already expired/stopped - treat as success
    return response.ok || response.status === 404 || response.status === 410;
  } catch (error) {
    console.warn(`[CRON:RENEW] Error stopping channel ${channelId}:`, error);
    return false;
  }
}

async function createWatchChannel(
  accessToken: string,
  calendarId: string,
  channelToken: string
): Promise<{ success: boolean; data?: any; error?: string; errorMessage?: string }> {
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;
  const newChannelId = crypto.randomUUID();

  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newChannelId,
          type: 'web_hook',
          address: webhookUrl,
          token: channelToken, // CRITICAL: Include token for webhook verification
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }

    const errorText = await response.text();
    let errorCode = 'watch_create_failed';
    let errorMessage = errorText;
    
    // Parse Google API error
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error?.message || errorText;
      
      if (errorMessage.includes('invalid_grant') || errorJson.error?.status === 'UNAUTHENTICATED') {
        errorCode = 'token_revoked';
      } else if (errorMessage.includes('invalid_client')) {
        errorCode = 'oauth_credentials_invalid';
      } else if (errorJson.error?.code === 401 || response.status === 401) {
        errorCode = 'unauthorized';
      } else if (errorJson.error?.code === 403 || response.status === 403) {
        errorCode = 'forbidden';
      }
    } catch {
      // Keep generic error code
    }

    return { success: false, error: errorCode, errorMessage };
  } catch (error) {
    console.error('[CRON:RENEW] Watch create exception:', error);
    return { success: false, error: 'watch_create_exception', errorMessage: error instanceof Error ? error.message : 'unknown' };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================== MAIN HANDLER =====================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[renew-google-calendar-watches] CRON_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Function not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startTime = Date.now();
  console.log(`[CRON:RENEW:START] Google Calendar watch renewal job started at ${new Date().toISOString()}`);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Calculate the threshold for renewal
    const renewalThreshold = new Date(Date.now() + RENEWAL_MARGIN_HOURS * 60 * 60 * 1000).toISOString();
    
    console.log(`[CRON:RENEW] Renewal margin: ${RENEWAL_MARGIN_HOURS}h, threshold: ${renewalThreshold}`);

    // Query all connections that need renewal
    const { data: connections, error: queryError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('provider', 'google')
      .eq('needs_reconnect', false)
      .not('refresh_token', 'is', null)
      .not('google_calendar_id', 'is', null)
      .not('watch_channel_id', 'is', null)
      .or(`watch_expires_at.is.null,watch_expires_at.lt.${renewalThreshold}`)
      .limit(BATCH_SIZE);

    if (queryError) {
      console.error('[CRON:RENEW:ERROR] Query failed:', queryError);
      return new Response(
        JSON.stringify({ error: 'Failed to query connections', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connections || connections.length === 0) {
      console.log('[CRON:RENEW:COMPLETE] No channels need renewal');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No channels need renewal',
          processed: 0,
          renewed: 0,
          failed: 0,
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CRON:RENEW] Found ${connections.length} channels to renew`);

    // Track results
    const results = {
      processed: 0,
      renewed: 0,
      failed: 0,
      skipped: 0,
      errors: [] as { professional_id: string; error: string }[],
    };

    // Process each connection
    const processedIds = new Set<string>(); // Idempotency check

    for (const conn of connections) {
      const professionalId = conn.professional_id;

      // Idempotency: skip if already processed in this run
      if (processedIds.has(professionalId)) {
        console.log(`[CRON:RENEW] Skipping duplicate ${professionalId}`);
        results.skipped++;
        continue;
      }
      processedIds.add(professionalId);

      results.processed++;
      console.log(`[CRON:RENEW] Processing ${professionalId} (${results.processed}/${connections.length})`);

      try {
        // Step 1: Refresh access token
        const tokenResult = await refreshGoogleToken(supabase, professionalId, conn.refresh_token);
        
        if (!tokenResult.accessToken) {
          console.error(`[CRON:RENEW] Token refresh failed for ${professionalId}: ${tokenResult.error}`);
          
          // Determine if this is a fatal error requiring reconnection
          const needsReconnect = tokenResult.error === 'token_revoked' || 
                                  tokenResult.error === 'oauth_credentials_invalid';
          
          await supabase
            .from('oauth_connections')
            .update({
              consecutive_sync_errors: (conn.consecutive_sync_errors || 0) + 1,
              last_sync_status: 'watch_renewal_failed',
              last_sync_error_code: tokenResult.error,
              last_sync_error_message: (tokenResult.errorDescription || tokenResult.error || 'unknown').substring(0, 500),
              needs_reconnect: needsReconnect,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id);

          results.failed++;
          results.errors.push({ professional_id: professionalId, error: tokenResult.error || 'token_refresh_failed' });
          continue;
        }

        const accessToken = tokenResult.accessToken;

        // Step 2: Stop existing channel (optional but recommended)
        if (conn.watch_channel_id && conn.watch_resource_id) {
          const stopped = await stopExistingChannel(
            accessToken,
            conn.watch_channel_id,
            conn.watch_resource_id
          );
          console.log(`[CRON:RENEW] Stopped existing channel for ${professionalId}: ${stopped}`);
        }

        // Step 3: Determine channel token - PERSIST BEFORE watch if generating new
        let channelToken = conn.watch_channel_token;
        const tokenGenerated = !channelToken;
        
        if (!channelToken) {
          channelToken = crypto.randomUUID() + '-' + crypto.randomUUID();
          console.log(`[CRON:RENEW] Generated new token for ${professionalId}, persisting before watch...`);
          
          // IMPROVEMENT #2: Persist token BEFORE calling events.watch
          await supabase
            .from('oauth_connections')
            .update({
              watch_channel_token: channelToken,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id);
        } else {
          console.log(`[CRON:RENEW] Reusing existing token for ${professionalId}`);
        }

        // Step 4: Create new watch channel
        const watchResult = await createWatchChannel(
          accessToken,
          conn.google_calendar_id,
          channelToken
        );

        if (!watchResult.success) {
          console.error(`[CRON:RENEW] Watch creation failed for ${professionalId}: ${watchResult.error} - ${watchResult.errorMessage}`);
          
          const needsReconnect = watchResult.error === 'token_revoked' || 
                                  watchResult.error === 'oauth_credentials_invalid' ||
                                  watchResult.error === 'unauthorized';

          await supabase
            .from('oauth_connections')
            .update({
              consecutive_sync_errors: (conn.consecutive_sync_errors || 0) + 1,
              last_sync_status: 'watch_renewal_failed',
              last_sync_error_code: watchResult.error,
              last_sync_error_message: (watchResult.errorMessage || watchResult.error || 'unknown').substring(0, 500),
              needs_reconnect: needsReconnect,
              updated_at: new Date().toISOString(),
            })
            .eq('id', conn.id);

          results.failed++;
          results.errors.push({ professional_id: professionalId, error: watchResult.error || 'watch_create_failed' });
          continue;
        }

        // Step 5: Update database with new channel info
        const watchData = watchResult.data;
        const newExpiration = new Date(parseInt(watchData.expiration)).toISOString();

        // Update oauth_connections with success state
        await supabase
          .from('oauth_connections')
          .update({
            watch_channel_id: watchData.id,
            watch_resource_id: watchData.resourceId,
            watch_expires_at: newExpiration,
            watch_channel_token: channelToken, // Confirm token is stored
            consecutive_sync_errors: 0,
            last_sync_status: 'watch_renewed_by_cron',
            last_sync_error_code: null,
            last_sync_error_message: null,
            needs_reconnect: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);

        // Update google_calendar_channels table
        await supabase
          .from('google_calendar_channels')
          .upsert({
            professional_id: professionalId,
            calendar_id: conn.google_calendar_id,
            channel_id: watchData.id,
            resource_id: watchData.resourceId,
            expiration: newExpiration,
          }, {
            onConflict: 'professional_id,calendar_id',
          });

        console.log(`[CRON:RENEW:SUCCESS] Renewed watch for ${professionalId}, expires: ${newExpiration}, token: ${tokenGenerated ? 'generated' : 'reused'}`);
        results.renewed++;

      } catch (error) {
        console.error(`[CRON:RENEW:ERROR] Exception processing ${professionalId}:`, error);
        
        // Update error state even on exception
        await supabase
          .from('oauth_connections')
          .update({
            consecutive_sync_errors: (conn.consecutive_sync_errors || 0) + 1,
            last_sync_status: 'watch_renewal_failed',
            last_sync_error_code: 'exception',
            last_sync_error_message: (error instanceof Error ? error.message : 'unknown').substring(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conn.id);
        
        results.failed++;
        results.errors.push({ 
          professional_id: professionalId, 
          error: error instanceof Error ? error.message : 'unknown_exception' 
        });
      }

      // Delay between renewals to avoid rate limiting
      await sleep(DELAY_BETWEEN_RENEWALS_MS);
    }

    const duration = Date.now() - startTime;
    console.log(`[CRON:RENEW:COMPLETE] Processed: ${results.processed}, Renewed: ${results.renewed}, Failed: ${results.failed}, Skipped: ${results.skipped}, Duration: ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.processed,
        renewed: results.renewed,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors.length > 0 ? results.errors : undefined,
        duration_ms: duration,
        renewal_margin_hours: RENEWAL_MARGIN_HOURS,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CRON:RENEW:FATAL]', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
