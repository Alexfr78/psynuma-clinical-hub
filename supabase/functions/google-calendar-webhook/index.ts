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
    const resourceState = req.headers.get('x-goog-resource-state');
    const resourceId = req.headers.get('x-goog-resource-id');
    const messageNumber = req.headers.get('x-goog-message-number');

    console.log('Received Google Calendar webhook:', {
      channelId,
      resourceState,
      resourceId,
      messageNumber,
    });

    // Respond immediately to Google (they expect < 10 second response)
    // We'll process asynchronously
    if (!channelId) {
      console.log('No channel ID in request, ignoring');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Look up the channel to find the professional
    const { data: channel, error: channelError } = await supabase
      .from('google_calendar_channels')
      .select('professional_id, calendar_id')
      .eq('channel_id', channelId)
      .single();

    if (channelError || !channel) {
      console.log('Channel not found:', channelId);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    console.log(`Channel belongs to professional ${channel.professional_id}`);

    // resourceState can be: 'sync', 'exists', 'not_exists'
    // 'sync' = initial sync message when watch is created (ignore)
    // 'exists' = resource exists and has changed
    // 'not_exists' = resource was deleted
    if (resourceState === 'sync') {
      console.log('Initial sync message, acknowledging');
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (resourceState === 'exists' || resourceState === 'not_exists') {
      console.log(`Calendar changed for professional ${channel.professional_id}, triggering sync`);
      
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
              professional_id: channel.professional_id,
            }),
          }
        );

        if (!syncResponse.ok) {
          const errorText = await syncResponse.text();
          console.error('Sync invocation failed:', errorText);
        } else {
          const syncResult = await syncResponse.json();
          console.log('Sync completed:', syncResult);
        }
      } catch (syncError) {
        console.error('Error invoking sync:', syncError);
      }
    }

    return new Response('OK', { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to Google to prevent retries
    return new Response('OK', { status: 200, headers: corsHeaders });
  }
});
