import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
  // First try to get credentials from center configuration
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
          console.log('Using OAuth credentials from center configuration');
          return { clientId: center.oauth_google_client_id, clientSecret };
        }
      } catch (error) {
        console.error('Error decrypting center OAuth credentials:', error);
      }
    }
  }

  // Fallback to environment variables
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (clientId && clientSecret) {
    console.log('Using OAuth credentials from environment variables');
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
    console.error('Google OAuth credentials not configured');
    return null;
  }

  try {
    console.log('Attempting to refresh Google token...');
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
    
    console.log('Google token refresh response:', {
      ok: response.ok,
      status: response.status,
      hasAccessToken: !!data.access_token,
      error: data.error,
      error_description: data.error_description,
    });

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

      console.log('Token refreshed successfully');
      return data.access_token;
    }

    // Handle revoked token
    if (data.error === 'invalid_grant') {
      console.error('Refresh token has been revoked - user needs to reconnect Google');
      await supabase
        .from('oauth_connections')
        .update({
          access_token: null,
          refresh_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else {
      console.error('Google token refresh failed:', data.error, data.error_description);
    }
  } catch (error) {
    console.error('Error refreshing Google token:', error);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      professional_id, 
      event_id,
      session_date, 
      start_time, 
      end_time, 
      title,
      description,
      status, // 'cancelled' to cancel the event
      psycma_session_id, // For linking converted events
    } = await req.json();

    console.log('Updating Google Calendar event:', event_id, psycma_session_id ? `(linking to session ${psycma_session_id})` : '');

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
      return new Response(
        JSON.stringify({ error: 'Google no está conectado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    let accessToken = connection.access_token;
    const expiresAt = new Date(connection.expires_at);
    if (expiresAt <= new Date()) {
      accessToken = await refreshGoogleToken(supabase, professional_id, connection.refresh_token);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: 'Token expirado, reconecta Google' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const calendarId = connection.google_calendar_id || 'primary';

    // If cancelling
    if (status === 'cancelled') {
      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const errorData = await deleteResponse.json();
        console.error('Error deleting event:', errorData);
      }

      return new Response(
        JSON.stringify({ success: true, deleted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update event
    const event: any = {};
    
    if (title) event.summary = title;
    
    // Handle description - preserve or add Psycma marker token
    if (description !== undefined) {
      let eventDescription = description || '';
      
      // If we have a psycma_session_id, ensure the token is in the description
      if (psycma_session_id) {
        // Remove existing token if present, then add fresh one
        eventDescription = eventDescription.replace(/\n*\[PSYCMA_SESSION_ID:[^\]]+\]/g, '');
        eventDescription = `${eventDescription}\n\n[PSYCMA_SESSION_ID:${psycma_session_id}]`;
      }
      
      event.description = eventDescription;
    }
    
    if (session_date && start_time && end_time) {
      event.start = {
        dateTime: `${session_date}T${start_time}:00`,
        timeZone: 'Europe/Madrid',
      };
      event.end = {
        dateTime: `${session_date}T${end_time}:00`,
        timeZone: 'Europe/Madrid',
      };
    }

    // CRITICAL: Always add extended properties to mark this as a Psycma event
    // This prevents the sync from re-importing this event as an external block
    if (psycma_session_id) {
      event.extendedProperties = {
        private: {
          psycma_session_id: psycma_session_id,
        },
      };
      console.log(`[UPDATE] Marking event ${event_id} with psycma_session_id: ${psycma_session_id}`);
    }

    const updateResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('Error updating event:', errorData);
      return new Response(
        JSON.stringify({ error: 'Error al actualizar evento', details: errorData }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventData = await updateResponse.json();

    return new Response(
      JSON.stringify({ success: true, event_id: eventData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
