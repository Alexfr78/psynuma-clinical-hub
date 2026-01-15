import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-channel-expiration, x-goog-resource-id, x-goog-resource-uri, x-goog-resource-state, x-goog-message-number',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Google sends POST requests for push notifications
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Extract Google push notification headers
    const channelId = req.headers.get('x-goog-channel-id');
    const channelToken = req.headers.get('x-goog-channel-token');
    const resourceState = req.headers.get('x-goog-resource-state');
    const resourceId = req.headers.get('x-goog-resource-id');
    const messageNumber = req.headers.get('x-goog-message-number');

    console.log('[WEBHOOK:RECEIVED]', {
      channelId,
      hasToken: !!channelToken,
      resourceState,
      resourceId,
      messageNumber,
    });

    // Respond immediately to Google (they expect < 10 second response)
    if (!channelId) {
      console.log('[WEBHOOK] No channel ID in request, ignoring');
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
          console.warn('[WEBHOOK] Token verification failed', { 
            channelId, 
            hasReceivedToken: !!channelToken,
            tokenMatch: channelToken === oauthConn.watch_channel_token
          });
          // Return 200 to prevent Google retries but don't process
          return new Response('OK', { status: 200, headers: corsHeaders });
        }
        console.log('[WEBHOOK] Token verified successfully');
      }

      // Validate resource_id matches
      if (oauthConn.watch_resource_id && resourceId && oauthConn.watch_resource_id !== resourceId) {
        console.warn('[WEBHOOK] Resource ID mismatch', { 
          channelId, 
          received: resourceId, 
          expected: oauthConn.watch_resource_id 
        });
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // Check if needs reconnect - sync-google-calendar will attempt auto-recovery
      if (oauthConn.needs_reconnect) {
        console.log('[WEBHOOK:RECOVERY] Connection marked needs_reconnect, invoking sync for auto-recovery...', { 
          professionalId: oauthConn.professional_id 
        });
        
        // Invoke sync - it now has auto-recovery logic built in
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
                professional_id: oauthConn.professional_id,
              }),
            }
          );
          
          if (syncResponse.ok) {
            const syncResult = await syncResponse.json();
            if (!syncResult.errors?.length) {
              console.log('[WEBHOOK:RECOVERY] Sync completed successfully - auto-recovery worked!');
            } else {
              console.warn('[WEBHOOK:RECOVERY] Sync had errors:', syncResult.errors);
            }
          } else {
            const errorText = await syncResponse.text();
            console.error('[WEBHOOK:RECOVERY] Sync invocation failed:', errorText);
          }
        } catch (e) {
          console.error('[WEBHOOK:RECOVERY] Error invoking sync:', e);
        }
        
        // Don't process this webhook further - let the sync handle everything
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      professionalId = oauthConn.professional_id;
      calendarId = oauthConn.google_calendar_id;
    } else {
      // Fallback: buscar en google_calendar_channels
      const { data: channel, error: channelError } = await supabase
        .from('google_calendar_channels')
        .select('professional_id, calendar_id')
        .eq('channel_id', channelId)
        .single();

      if (channelError || !channel) {
        console.log('[WEBHOOK] Channel not found:', channelId);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      professionalId = channel.professional_id;
      calendarId = channel.calendar_id;
    }

    console.log(`[WEBHOOK] Channel belongs to professional ${professionalId}, calendar ${calendarId}`);

    // resourceState can be: 'sync', 'exists', 'not_exists'
    // 'sync' = initial sync message when watch is created (ignore)
    // 'exists' = resource exists and has changed
    // 'not_exists' = resource was deleted
    if (resourceState === 'sync') {
      console.log('[WEBHOOK] Initial sync message, acknowledging');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (resourceState === 'exists' || resourceState === 'not_exists') {
      console.log(`[WEBHOOK:TRIGGER] Calendar changed for professional ${professionalId}, triggering sync`);
      
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
            }),
          }
        );

        if (!syncResponse.ok) {
          const errorText = await syncResponse.text();
          console.error('[WEBHOOK:ERROR] Sync invocation failed:', errorText);
        } else {
          const syncResult = await syncResponse.json();
          console.log('[WEBHOOK:SYNC_COMPLETE]', syncResult);
        }
      } catch (syncError) {
        console.error('[WEBHOOK:ERROR] Error invoking sync:', syncError);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('[WEBHOOK:ERROR]', error);
    // Always return 200 to Google to prevent retries
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
});
