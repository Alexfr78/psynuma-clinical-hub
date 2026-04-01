import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function getZoomClientCredentials(supabase: any, professionalId: string) {
  // 1) Get center_id from professional's profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('center_id')
    .eq('id', professionalId)
    .single();

  if (profileError || !profile?.center_id) {
    console.error('Failed to get center_id for professional:', profileError);
    return null;
  }

  // 2) Get credentials from center
  const { data: center, error: centerError } = await supabase
    .from('centers')
    .select('oauth_zoom_client_id, oauth_zoom_credentials')
    .eq('id', profile.center_id)
    .single();

  if (centerError || !center?.oauth_zoom_client_id || !center?.oauth_zoom_credentials) {
    console.error('Missing Zoom OAuth credentials for center:', centerError);
    return null;
  }

  const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
  if (!encryptionKey) {
    console.error('Missing CERTIFICATE_ENCRYPTION_KEY');
    return null;
  }

  try {
    const clientSecret = await decryptAES256GCM(center.oauth_zoom_credentials, encryptionKey);
    return {
      clientId: center.oauth_zoom_client_id,
      clientSecret,
    };
  } catch (err) {
    console.error('Failed to decrypt Zoom credentials:', err);
    return null;
  }
}

async function refreshZoomToken(supabase: any, professionalId: string, refreshToken: string): Promise<string | null> {
  console.log('Refreshing Zoom token...');

  const creds = await getZoomClientCredentials(supabase, professionalId);
  if (!creds?.clientId || !creds?.clientSecret) {
    console.error('Missing Zoom OAuth credentials for center/professional');
    return null;
  }

  const response = await fetch('https://zoom.us/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${creds.clientId}:${creds.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    console.error('Failed to refresh Zoom token:', await response.text());
    return null;
  }

  const tokenData = await response.json();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString();

  await supabase
    .from('oauth_connections')
    .update({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
    })
    .eq('professional_id', professionalId)
    .eq('provider', 'zoom');

  console.log('Zoom token refreshed successfully');
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { professional_id, session_date, start_time, end_time, topic, patient_name } = await req.json();

    console.log('Creating Zoom meeting for professional:', professional_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get OAuth connection for this professional
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professional_id)
      .eq('provider', 'zoom')
      .single();

    if (connError || !connection) {
      console.error('No Zoom connection found:', connError);
      return new Response(
        JSON.stringify({ error: 'Zoom no está conectado para este profesional' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at);
    if (expiresAt <= new Date()) {
      accessToken = await refreshZoomToken(supabase, professional_id, connection.refresh_token);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: 'No se pudo refrescar el token de Zoom. Por favor reconecta la integración.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse date and time
    const [year, month, day] = session_date.split('-').map(Number);
    const [startHour, startMinute] = start_time.split(':').map(Number);
    const [endHour, endMinute] = end_time.split(':').map(Number);
    
    const startDate = new Date(year, month - 1, day, startHour, startMinute);
    const durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

    // Create meeting
    const meetingResponse = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: topic || `Sesión con ${patient_name || 'paciente'}`,
        type: 2, // Scheduled meeting
        start_time: startDate.toISOString(),
        duration: durationMinutes,
        timezone: 'Europe/Madrid',
        settings: {
          host_video: true,
          participant_video: true,
          join_before_host: false,
          mute_upon_entry: false,
          waiting_room: true,
          auto_recording: 'none',
        },
      }),
    });

    if (!meetingResponse.ok) {
      const errorData = await meetingResponse.json();
      console.error('Zoom API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Error al crear reunión en Zoom', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const meetingData = await meetingResponse.json();
    console.log('Zoom meeting created:', meetingData.id);

    return new Response(
      JSON.stringify({
        meeting_id: meetingData.id,
        join_url: meetingData.join_url,
        start_url: meetingData.start_url,
        password: meetingData.password,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating Zoom meeting:', error);
    console.error("[create-zoom-meeting] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
