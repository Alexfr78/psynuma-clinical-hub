import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleOAuthCredentials(supabase: SupabaseClient, professionalId: string): Promise<{ clientId: string; clientSecret: string } | null> {
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
        // Use shared decryptSecret - it handles the encryption key internally
        const clientSecret = await decryptSecret(center.oauth_google_credentials);
        return { clientId: center.oauth_google_client_id, clientSecret };
      } catch (error) {
        console.error('[STOP-CHANNEL] Error decrypting center OAuth credentials:', error);
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
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string
): Promise<string | null> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    console.error('[STOP-CHANNEL] Google OAuth credentials not configured');
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
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      return data.access_token;
    }

    console.error('[STOP-CHANNEL] Token refresh failed:', data.error);
  } catch (error) {
    console.error('[STOP-CHANNEL] Error refreshing token:', error);
  }
  return null;
}

async function getValidAccessToken(
  supabase: SupabaseClient,
  connection: { expires_at?: string | null; access_token?: string | null; refresh_token?: string | null; professional_id: string }
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

    // Get user from JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // In this project, professional_id === auth.user.id
    const professionalId = user.id;

    console.log(`[STOP-CHANNEL:START] Stopping Google Calendar watch channel for professional ${professionalId}`);

    // Get OAuth connection with watch channel info
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .single();

    if (connError || !connection) {
      console.log('[STOP-CHANNEL] No Google connection found');
      return new Response(
        JSON.stringify({ success: true, message: 'No connection to stop' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const channelId = connection.watch_channel_id;
    const resourceId = connection.watch_resource_id;

    if (!channelId || !resourceId) {
      console.log('[STOP-CHANNEL] No watch channel configured');
      return new Response(
        JSON.stringify({ success: true, message: 'No watch channel to stop' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get valid access token using getValidAccessToken
    const accessToken = await getValidAccessToken(supabase, connection);
    if (!accessToken) {
      console.log('[STOP-CHANNEL] Could not get valid access token - proceeding anyway (best-effort)');
      return new Response(
        JSON.stringify({ success: true, message: 'Could not get token, channel may still be active' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[STOP-CHANNEL] Stopping channel ${channelId} with resource ${resourceId}`);

    // Call Google Calendar API to stop the channel
    const stopResponse = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
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

    // Treat 404 and 410 as success (channel already stopped or expired)
    if (stopResponse.ok || stopResponse.status === 404 || stopResponse.status === 410) {
      console.log(`[STOP-CHANNEL:SUCCESS] Channel stopped (status: ${stopResponse.status})`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: stopResponse.ok ? 'Channel stopped' : 'Channel already inactive',
          status: stopResponse.status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log error but don't fail - this is best-effort
    const errorText = await stopResponse.text();
    console.error(`[STOP-CHANNEL:WARN] Failed to stop channel (status: ${stopResponse.status}):`, errorText);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Failed to stop channel, but proceeding',
        status: stopResponse.status,
        error: errorText 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[STOP-CHANNEL:ERROR]', error);
    // Don't fail - this is best-effort
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
