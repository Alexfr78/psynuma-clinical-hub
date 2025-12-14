import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshGoogleToken(supabase: any, professionalId: string, refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId || '',
      client_secret: clientSecret || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    console.error('Failed to refresh Google token:', await response.text());
    return null;
  }

  const tokenData = await response.json();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

  await supabase
    .from('oauth_connections')
    .update({
      access_token: tokenData.access_token,
      expires_at: expiresAt,
    })
    .eq('professional_id', professionalId)
    .eq('provider', 'google');

  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { professional_id } = await req.json();

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Google calendars for professional:', professional_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professional_id)
      .eq('provider', 'google')
      .single();

    if (connError || !connection) {
      console.error('No Google connection found:', connError);
      return new Response(
        JSON.stringify({ error: 'Google no está conectado para este profesional' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at);
    if (expiresAt <= new Date()) {
      accessToken = await refreshGoogleToken(supabase, professional_id, connection.refresh_token);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: 'No se pudo refrescar el token de Google. Por favor reconecta la integración.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Fetch calendars list
    const calendarListResponse = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!calendarListResponse.ok) {
      const errorData = await calendarListResponse.json();
      console.error('Google Calendar API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Error al obtener calendarios de Google', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calendarData = await calendarListResponse.json();
    
    // Map to simplified format
    const calendars = (calendarData.items || []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary || false,
      backgroundColor: cal.backgroundColor,
    }));

    console.log(`Found ${calendars.length} writable calendars`);

    return new Response(
      JSON.stringify({ calendars }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error listing Google calendars:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
