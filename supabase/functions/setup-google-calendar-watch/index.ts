import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleOAuthCredentials(
  supabase: any,
  professionalId: string
): Promise<{
  clientId: string;
  clientSecret: string;
  source: 'center' | 'env';
  centerId: string | null;
  decryptFailed: boolean;
  oauth_client_id_last4: string | null;
  env_client_id_last4: string | null;
} | null> {
  const last4 = (value: string | null | undefined): string | null => {
    if (!value) return null;
    return value.length <= 4 ? value : value.slice(-4);
  };

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
          `[WATCH:CREDS] Using center credentials ${JSON.stringify({ using_center_credentials: true, center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4 })}`
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
        const msg = error instanceof Error ? error.message : 'unknown';
        console.error(
          `[WATCH:CREDS] Decrypt failed ${JSON.stringify({ decrypt_failed: true, center_id: centerId, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4, error: msg })}`
        );
      }
    }
  }

  if (envClientId && envClientSecret) {
    console.log(
      `[WATCH:CREDS] Using env credentials ${JSON.stringify({ using_center_credentials: false, center_id: centerId, decrypt_failed: decryptFailed, oauth_client_id_last4: centerClientIdLast4, env_client_id_last4: envClientIdLast4 })}`
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
    console.log(
      `[WATCH:TOKEN] Calling oauth2/token ${JSON.stringify({
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
    // Generate a secure channel token for webhook verification
    const channelToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;

    console.log(`[WATCH] Creating watch channel ${channelId} for calendar ${calendarId}`);

    // Call Google Calendar API to set up watch with token for verification
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
          token: channelToken, // Custom token for webhook verification
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
    // Include the channel token for webhook verification
    await supabase
      .from('oauth_connections')
      .update({
        watch_channel_id: watchData.id,
        watch_resource_id: watchData.resourceId,
        watch_channel_token: channelToken, // Store token for webhook verification
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
    console.error("[setup-google-calendar-watch] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
