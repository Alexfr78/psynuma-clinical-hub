import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt AES-256-GCM encrypted data (must match save-oauth-credentials encryption)
async function decryptAES256GCM(encryptedData: string, encryptionKey: string): Promise<string> {
  // Use key as UTF-8 string with padding (same as save-oauth-credentials)
  const encoder = new TextEncoder();
  const keyData = encoder.encode(encryptionKey.padEnd(32, '0').slice(0, 32));
  
  // Decode Base64
  const encryptedBytes = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  // Extract IV (first 12 bytes) and ciphertext+authTag (rest)
  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'AES-GCM' }, false, ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, ciphertextWithTag
  );
  
  return new TextDecoder().decode(decrypted);
}

// Get Google OAuth credentials from center config or fallback to env vars
async function getGoogleOAuthCredentials(supabase: any, centerId: string): Promise<{ clientId: string; clientSecret: string }> {
  const { data: center } = await supabase
    .from('centers')
    .select('oauth_google_client_id, oauth_google_credentials')
    .eq('id', centerId)
    .single();

  if (center?.oauth_google_client_id && center?.oauth_google_credentials) {
    try {
      const encryptionKey = Deno.env.get('CERTIFICATE_ENCRYPTION_KEY');
      if (encryptionKey) {
        const clientSecret = await decryptAES256GCM(center.oauth_google_credentials, encryptionKey);
        console.log('Using center-specific Google OAuth credentials');
        return { clientId: center.oauth_google_client_id, clientSecret };
      }
    } catch (e) {
      console.warn('Failed to decrypt center OAuth credentials, falling back to env vars:', e);
    }
  }

  // Fallback to environment variables
  console.log('Using environment variable Google OAuth credentials');
  return {
    clientId: Deno.env.get('GOOGLE_CLIENT_ID') || '',
    clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
  };
}

async function refreshGoogleToken(
  supabase: any, 
  professionalId: string, 
  refreshToken: string,
  centerId: string
): Promise<string | null> {
  console.log('Refreshing Google token using center credentials...');
  
  // Get credentials from center config
  const { clientId, clientSecret } = await getGoogleOAuthCredentials(supabase, centerId);
  
  if (!clientId || !clientSecret) {
    console.error('Missing Google OAuth credentials');
    return null;
  }
  
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to refresh Google token:', errorText);
    
    // If token is revoked, clear the connection
    if (errorText.includes('invalid_grant')) {
      console.log('Token revoked, clearing connection...');
      await supabase
        .from('oauth_connections')
        .update({ access_token: null, refresh_token: null })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
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

  console.log('Google token refreshed successfully');
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      professional_id, 
      session_id,
      session_date, 
      start_time, 
      end_time, 
      title,
      description,
      patient_name,
      patient_email,
      include_meet,
      location,
    } = await req.json();

    console.log('Creating Google Calendar event for professional:', professional_id);

    // Validate that event has duration (start_time != end_time)
    if (start_time === end_time) {
      console.warn('Event has zero duration (start_time === end_time), rejecting');
      return new Response(
        JSON.stringify({ error: 'La sesión tiene duración 0, no se puede crear evento de calendario' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get professional's center_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('center_id')
      .eq('id', professional_id)
      .single();

    if (profileError || !profile?.center_id) {
      console.error('Could not find center for professional:', profileError);
      return new Response(
        JSON.stringify({ error: 'No se encontró el centro del profesional' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const centerId = profile.center_id;

    // Get OAuth connection for this professional
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
      accessToken = await refreshGoogleToken(supabase, professional_id, connection.refresh_token, centerId);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: 'No se pudo refrescar el token de Google. Por favor reconecta la integración.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Build event
    const calendarId = connection.google_calendar_id || 'primary';
    
    // Parse date and time for RFC3339 format
    const startDateTime = `${session_date}T${start_time}:00`;
    const endDateTime = `${session_date}T${end_time}:00`;

    // Build description with Psycma marker token for fallback detection
    let eventDescription = description || `Sesión de psicología`;
    if (session_id) {
      eventDescription = `${eventDescription}\n\n[PSYCMA_SESSION_ID:${session_id}]`;
    }

    const event: any = {
      summary: title || `Sesión con ${patient_name || 'paciente'}`,
      description: eventDescription,
      start: {
        dateTime: startDateTime,
        timeZone: 'Europe/Madrid',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'Europe/Madrid',
      },
    };

    // CRITICAL: Add extended properties to mark this as a Psycma-created event
    // This prevents the sync from re-importing this event as an external block
    if (session_id) {
      event.extendedProperties = {
        private: {
          psycma_session_id: session_id,
        },
      };
      console.log(`[CREATE] Marking event with psycma_session_id: ${session_id}`);
    }

    // Add location if provided and not a video call
    if (location && !include_meet) {
      event.location = location;
    }

    // Add patient as attendee if email provided
    if (patient_email) {
      event.attendees = [{ email: patient_email }];
    }

    // Add Google Meet if requested
    if (include_meet) {
      event.conferenceData = {
        createRequest: {
          requestId: `psycma-${session_id || Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    // Create event
    const calendarUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    if (include_meet) {
      calendarUrl.searchParams.set('conferenceDataVersion', '1');
    }

    const eventResponse = await fetch(calendarUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!eventResponse.ok) {
      const errorData = await eventResponse.json();
      console.error('Google Calendar API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Error al crear evento en Google Calendar', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventData = await eventResponse.json();
    console.log('Google Calendar event created:', eventData.id);

    // Extract Meet link if created
    let meetLink = null;
    if (eventData.conferenceData?.entryPoints) {
      const videoEntry = eventData.conferenceData.entryPoints.find(
        (ep: any) => ep.entryPointType === 'video'
      );
      meetLink = videoEntry?.uri;
    }

    return new Response(
      JSON.stringify({
        event_id: eventData.id,
        html_link: eventData.htmlLink,
        meet_link: meetLink,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error creating Google Calendar event:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
