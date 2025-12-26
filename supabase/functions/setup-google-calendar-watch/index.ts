import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-256-GCM decryption for OAuth credentials
async function decryptAES256GCM(encryptedData: string, encryptionKey: string): Promise<string> {
  const rawKey = new TextEncoder().encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const iv = encryptedBytes.slice(0, 12);
  const authTag = encryptedBytes.slice(12, 28);
  const ciphertext = encryptedBytes.slice(28);
  
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(authTag, ciphertext.length);
  
  const key = await crypto.subtle.importKey(
    'raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertextWithTag
  );
  
  return new TextDecoder().decode(decrypted);
}

async function getGoogleOAuthCredentials(supabase: any, professionalId: string): Promise<{ clientId: string; clientSecret: string } | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('center_id')
    .eq('id', professionalId)
    .single();

  if (profile?.center_id) {
    const { data: center } = await supabase
      .from('centers')
      .select('oauth_google_client_id, oauth_google_credentials')
      .eq('id', profile.center_id)
      .single();

    if (center?.oauth_google_client_id && center?.oauth_google_credentials) {
      try {
        const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
        if (encryptionKey) {
          const clientSecret = await decryptAES256GCM(center.oauth_google_credentials, encryptionKey);
          return { clientId: center.oauth_google_client_id, clientSecret };
        }
      } catch (error) {
        console.error('[WATCH] Error decrypting center OAuth credentials:', error);
      }
    }
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  return null;
}

async function refreshGoogleToken(
  supabase: any,
  professionalId: string,
  refreshToken: string
): Promise<string | null> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    console.error('[WATCH] Google OAuth credentials not configured');
    // Mark needs_reconnect
    await supabase
      .from('oauth_connections')
      .update({ needs_reconnect: true, last_sync_status: 'needs_reconnect' })
      .eq('professional_id', professionalId)
      .eq('provider', 'google');
    return null;
  }

  try {
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
          needs_reconnect: false,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      return data.access_token;
    }

    console.error('[WATCH] Google token refresh failed:', data.error, data.error_description);
    
    // Mark needs_reconnect on auth errors
    if (data.error === 'invalid_grant' || data.error === 'invalid_client') {
      await supabase
        .from('oauth_connections')
        .update({ needs_reconnect: true, last_sync_status: 'needs_reconnect' })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
  } catch (error) {
    console.error('[WATCH] Error refreshing Google token:', error);
  }
  return null;
}

async function getValidAccessToken(
  supabase: any,
  connection: any
): Promise<string | null> {
  const now = new Date();
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null;

  if (expiresAt && expiresAt > now && connection.access_token) {
    return connection.access_token;
  }

  if (connection.refresh_token) {
    return await refreshGoogleToken(supabase, connection.professional_id, connection.refresh_token);
  }

  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { professional_id } = await req.json();

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[WATCH:START] Setting up Google Calendar watch for professional ${professional_id}`);

    // Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professional_id)
      .eq('provider', 'google')
      .single();

    if (connError || !connection) {
      console.error('[WATCH] No Google connection found');
      return new Response(
        JSON.stringify({ error: 'No Google connection found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRÍTICO: NO usar 'primary' como fallback - requiere calendario específico
    const calendarId = connection.google_calendar_id;
    if (!calendarId) {
      console.error('[WATCH:ERROR] No google_calendar_id configurado - NO se usará primary');
      return new Response(
        JSON.stringify({ 
          error: 'No hay google_calendar_id configurado. Selecciona un calendario primero en Ajustes > Integraciones > Google Calendar.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if needs reconnect
    if (connection.needs_reconnect) {
      console.error('[WATCH] Connection needs reconnect');
      return new Response(
        JSON.stringify({ error: 'La conexión con Google necesita reconectarse. Ve a Ajustes > Integraciones.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = await getValidAccessToken(supabase, connection);
    if (!accessToken) {
      // Update last_sync_status on failure
      await supabase
        .from('oauth_connections')
        .update({ last_sync_status: 'watch_setup_failed' })
        .eq('professional_id', professional_id)
        .eq('provider', 'google');
      return new Response(
        JSON.stringify({ error: 'Failed to get valid access token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUNTO 1: Stop existing channel before creating new one (avoid duplicates)
    if (connection.watch_channel_id && connection.watch_resource_id) {
      console.log(`[WATCH] Stopping existing channel ${connection.watch_channel_id} before creating new one`);
      try {
        const stopResponse = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: connection.watch_channel_id,
            resourceId: connection.watch_resource_id,
          }),
        });
        // Treat 404/410 as success (channel already stopped/expired)
        if (stopResponse.ok || stopResponse.status === 404 || stopResponse.status === 410) {
          console.log(`[WATCH] Previous channel stopped (status: ${stopResponse.status})`);
        } else {
          console.warn(`[WATCH] Could not stop previous channel (status: ${stopResponse.status}), proceeding anyway`);
        }
      } catch (e) {
        console.warn('[WATCH] Error stopping previous channel:', e);
      }
    }

    const channelId = crypto.randomUUID();
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;

    console.log(`[WATCH] Creating watch channel ${channelId} for calendar ${calendarId}`);

    // Call Google Calendar API to set up watch
    const watchResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: webhookUrl,
        }),
      }
    );

    if (!watchResponse.ok) {
      const errorText = await watchResponse.text();
      console.error('[WATCH:ERROR] Google Calendar watch setup failed:', errorText);
      // PUNTO 2: Update last_sync_status on failure (from Edge Function, not client)
      await supabase
        .from('oauth_connections')
        .update({ last_sync_status: 'watch_setup_failed' })
        .eq('professional_id', professional_id)
        .eq('provider', 'google');
      return new Response(
        JSON.stringify({ error: 'Failed to setup watch', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const watchData = await watchResponse.json();
    console.log('[WATCH] Watch setup response:', watchData);

    const expiration = new Date(parseInt(watchData.expiration)).toISOString();

    // Delete existing channel for this professional/calendar combo
    await supabase
      .from('google_calendar_channels')
      .delete()
      .eq('professional_id', professional_id)
      .eq('calendar_id', calendarId);

    // Store the channel info in google_calendar_channels table
    const { error: insertError } = await supabase
      .from('google_calendar_channels')
      .insert({
        professional_id,
        channel_id: watchData.id,
        resource_id: watchData.resourceId,
        calendar_id: calendarId,
        expiration,
      });

    if (insertError) {
      console.error('[WATCH:ERROR] Error storing channel:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store channel info' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NUEVO: También guardar en oauth_connections para lookup rápido desde webhook
    await supabase
      .from('oauth_connections')
      .update({
        watch_channel_id: watchData.id,
        watch_resource_id: watchData.resourceId,
        watch_expires_at: expiration,
        last_sync_status: 'watch_configured',
      })
      .eq('professional_id', professional_id)
      .eq('provider', 'google');

    console.log(`[WATCH:SUCCESS] Watch channel created successfully, expires at ${expiration}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        channel_id: watchData.id,
        calendar_id: calendarId,
        expiration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[WATCH:ERROR] Setup watch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
