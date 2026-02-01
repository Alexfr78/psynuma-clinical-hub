import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-channel-expiration, x-goog-resource-id, x-goog-resource-uri, x-goog-resource-state, x-goog-message-number',
};

// ============================================================
// DEBOUNCE CONFIGURATION
// ============================================================
// Webhooks se agrupan: solo se dispara 1 sync cada DEBOUNCE_SECONDS
// Esto evita tormentas de sincronización cuando Google envía muchas
// notificaciones seguidas por cambios en batch.
// ============================================================
const DEBOUNCE_SECONDS = 60;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Google sends POST requests for push notifications
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Generate correlation ID for tracing
  const correlationId = crypto.randomUUID().slice(0, 8);

  try {
    // Extract Google push notification headers
    const channelId = req.headers.get('x-goog-channel-id');
    const channelToken = req.headers.get('x-goog-channel-token');
    const resourceState = req.headers.get('x-goog-resource-state');
    const resourceId = req.headers.get('x-goog-resource-id');
    const messageNumber = req.headers.get('x-goog-message-number');

    console.log(`[WEBHOOK:${correlationId}] Received`, {
      channelId,
      hasToken: !!channelToken,
      resourceState,
      resourceId,
      messageNumber,
    });

    // Respond immediately to Google (they expect < 10 second response)
    if (!channelId) {
      console.log(`[WEBHOOK:${correlationId}] No channel ID in request, ignoring`);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar en oauth_connections por watch_channel_id (más rápido)
    const { data: oauthConn } = await supabase
      .from('oauth_connections')
      .select('professional_id, google_calendar_id, watch_resource_id, watch_channel_token, needs_reconnect')
      .eq('provider', 'google')
      .eq('watch_channel_id', channelId)
      .maybeSingle();

    let professionalId: string | null = null;
    let calendarId: string | null = null;

    if (oauthConn) {
      // SECURITY: Verify channel token to prevent webhook spoofing
      if (oauthConn.watch_channel_token) {
        if (!channelToken || channelToken !== oauthConn.watch_channel_token) {
          console.warn(`[WEBHOOK:${correlationId}] Token verification failed`, { 
            channelId, 
            hasReceivedToken: !!channelToken,
            tokenMatch: channelToken === oauthConn.watch_channel_token
          });
          // Return 200 to prevent Google retries but don't process
          return new Response('OK', { status: 200, headers: corsHeaders });
        }
        console.log(`[WEBHOOK:${correlationId}] Token verified successfully`);
      }

      // Validate resource_id matches
      if (oauthConn.watch_resource_id && resourceId && oauthConn.watch_resource_id !== resourceId) {
        console.warn(`[WEBHOOK:${correlationId}] Resource ID mismatch`, { 
          channelId, 
          received: resourceId, 
          expected: oauthConn.watch_resource_id 
        });
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      professionalId = oauthConn.professional_id;
      calendarId = oauthConn.google_calendar_id;

      // Check if needs reconnect - sync will handle auto-recovery
      if (oauthConn.needs_reconnect) {
        console.log(`[WEBHOOK:${correlationId}] Connection marked needs_reconnect, will attempt recovery during sync`);
        // Don't skip - let debounce handle whether to trigger sync
      }
    } else {
      // Fallback: buscar en google_calendar_channels
      const { data: channel, error: channelError } = await supabase
        .from('google_calendar_channels')
        .select('professional_id, calendar_id')
        .eq('channel_id', channelId)
        .single();

      if (channelError || !channel) {
        console.log(`[WEBHOOK:${correlationId}] Channel not found:`, channelId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      professionalId = channel.professional_id;
      calendarId = channel.calendar_id;
    }

    console.log(`[WEBHOOK:${correlationId}] Channel belongs to professional ${professionalId}, calendar ${calendarId}`);

    // resourceState can be: 'sync', 'exists', 'not_exists'
    // 'sync' = initial sync message when watch is created (ignore)
    // 'exists' = resource exists and has changed
    // 'not_exists' = resource was deleted
    if (resourceState === 'sync') {
      console.log(`[WEBHOOK:${correlationId}] Initial sync message, acknowledging`);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (resourceState === 'exists' || resourceState === 'not_exists') {
      // ============================================================
      // DEBOUNCE: Use database function to coalesce webhooks
      // ============================================================
      // This prevents webhook storms from triggering multiple syncs.
      // The function returns true only if enough time has passed since
      // the last sync trigger (default: 60 seconds).
      // ============================================================
      
      const { data: shouldTrigger, error: debounceError } = await supabase.rpc(
        'handle_google_webhook_debounce',
        {
          p_professional_id: professionalId,
          p_calendar_id: calendarId,
          p_debounce_seconds: DEBOUNCE_SECONDS
        }
      );

      if (debounceError) {
        console.error(`[WEBHOOK:${correlationId}] Debounce error:`, debounceError);
        // On error, still return 200 to Google but don't trigger sync
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      if (!shouldTrigger) {
        console.log(`[WEBHOOK:${correlationId}] Debounced - sync was triggered recently (within ${DEBOUNCE_SECONDS}s)`);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      console.log(`[WEBHOOK:${correlationId}] Triggering sync for professional ${professionalId}`);
      
      // Trigger sync for this professional
      try {
        const syncResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-google-calendar`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              professional_id: professionalId,
              correlation_id: correlationId,
              triggered_by: 'webhook',
            }),
          }
        );

        if (!syncResponse.ok) {
          const errorText = await syncResponse.text();
          console.error(`[WEBHOOK:${correlationId}] Sync invocation failed:`, errorText);
        } else {
          const syncResult = await syncResponse.json();
          console.log(`[WEBHOOK:${correlationId}] Sync completed:`, {
            created: syncResult.created,
            updated: syncResult.updated,
            deleted: syncResult.deleted,
            errors: syncResult.errors?.length || 0,
            skipped: syncResult.skipped || false,
          });
        }
      } catch (syncError) {
        console.error(`[WEBHOOK:${correlationId}] Error invoking sync:`, syncError);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error(`[WEBHOOK:${correlationId}] Error:`, error);
    // Always return 200 to Google to prevent retries
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
});
