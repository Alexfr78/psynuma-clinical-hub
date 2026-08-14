import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getGoogleOAuthCredentials(supabase: SupabaseClient, professionalId: string): Promise<{ clientId: string; clientSecret: string } | null> {
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
        // Use shared decryptSecret - it handles the encryption key internally
        const clientSecret = await decryptSecret(center.oauth_google_credentials);
        console.log('Using OAuth credentials from center configuration');
        return { clientId: center.oauth_google_client_id, clientSecret };
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
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string
): Promise<string | null> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    console.error('[UPDATE:TOKEN] Google OAuth credentials not configured');
    await supabase
      .from('oauth_connections')
      .update({ needs_reconnect: true, last_sync_status: 'credentials_missing' })
      .eq('professional_id', professionalId)
      .eq('provider', 'google');
    return null;
  }

  try {
    console.log('[UPDATE:TOKEN] Attempting to refresh Google token...');
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

    console.log('[UPDATE:TOKEN] Refresh response:', {
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
          needs_reconnect: false,
          last_sync_status: 'token_refreshed',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      console.log('[UPDATE:TOKEN] Token refreshed successfully');
      return data.access_token;
    }

    console.error('[UPDATE:TOKEN] Google token refresh failed:', data.error, data.error_description);

    if (data.error === 'invalid_grant' || data.error === 'invalid_client') {
      console.error('[UPDATE:TOKEN] Auth error - marking needs_reconnect');
      await supabase
        .from('oauth_connections')
        .update({
          needs_reconnect: true,
          last_sync_status: 'needs_reconnect',
          // If token is revoked, clear access_token to force reconnect UX
          access_token: null,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
  } catch (error) {
    console.error('[UPDATE:TOKEN] Error refreshing Google token:', error);
  }

  return null;
}

// Refresh token with exponential backoff retries
async function refreshGoogleTokenWithRetry(
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string,
  maxRetries: number = 3
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[UPDATE:TOKEN] Refresh attempt ${attempt}/${maxRetries}`);
    const token = await refreshGoogleToken(supabase, professionalId, refreshToken);
    if (token) return token;

    if (attempt < maxRetries) {
      const waitMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.log(`[UPDATE:TOKEN] Retry ${attempt}/${maxRetries} failed, waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  console.error('[UPDATE:TOKEN] All refresh attempts failed');
  await supabase
    .from('oauth_connections')
    .update({ needs_reconnect: true, last_sync_status: 'token_refresh_failed', access_token: null })
    .eq('professional_id', professionalId)
    .eq('provider', 'google');

  return null;
}

// Helper function to create a new Google Calendar event
async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventData: {
    title: string;
    description?: string;
    session_date: string;
    start_time: string;
    end_time: string;
    psycma_session_id: string;
  }
): Promise<{ success: boolean; event_id?: string; error?: string }> {
  console.log(`[CREATE] Creating new Google Calendar event for session ${eventData.psycma_session_id}`);
  
  let eventDescription = eventData.description || '';
  eventDescription = `${eventDescription}\n\n[PSYCMA_SESSION_ID:${eventData.psycma_session_id}]`;
  
  // Ensure time has seconds (HH:MM -> HH:MM:00, HH:MM:SS stays as-is)
  const formatTime = (t: string) => t.split(':').length === 3 ? t : `${t}:00`;

  const event = {
    summary: eventData.title || 'Sesión',
    description: eventDescription,
    start: {
      dateTime: `${eventData.session_date}T${formatTime(eventData.start_time)}`,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: `${eventData.session_date}T${formatTime(eventData.end_time)}`,
      timeZone: 'Europe/Madrid',
    },
    extendedProperties: {
      private: {
        psycma_session_id: eventData.psycma_session_id,
      },
    },
  };

  const createResponse = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!createResponse.ok) {
    const errorData = await createResponse.json();
    console.error('Error creating event:', errorData);
    return { success: false, error: `Error al crear evento: ${errorData?.error?.message || 'Unknown error'}` };
  }

  const newEvent = await createResponse.json();
  console.log(`[CREATE] Event created successfully: ${newEvent.id}`);
  return { success: true, event_id: newEvent.id };
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
      location, // optional: human-readable location string
      status, // 'cancelled' to cancel the event
      psycma_session_id, // For linking converted events
      create_if_not_exists, // If true and event_id is null, create new event
      color_id, // Google Calendar colorId: "2" = sage (green), null = calendar default
    } = await req.json();

    console.log('Update Google Calendar event request:', {
      event_id,
      psycma_session_id,
      create_if_not_exists,
      hasDateTime: !!(session_date && start_time && end_time),
    });

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
        JSON.stringify({ success: false, error: 'Google no está conectado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Helper function to get valid access token (with refresh + retry)
    const getValidAccessToken = async (): Promise<string | null> => {
      // Always fetch the latest connection row (it can be updated by other processes)
      const { data: freshConn } = await supabase
        .from('oauth_connections')
        .select('access_token, expires_at, refresh_token, needs_reconnect')
        .eq('professional_id', professional_id)
        .eq('provider', 'google')
        .single();

      const conn = freshConn || connection;

      if (!conn?.refresh_token && !conn?.access_token) {
        return null;
      }

      const now = Date.now();
      const expiresAtMs = conn?.expires_at ? new Date(conn.expires_at).getTime() : 0;
      const bufferMs = 5 * 60 * 1000;

      // If token is valid (with buffer), use it.
      if (conn?.access_token && expiresAtMs && (expiresAtMs - bufferMs) > now) {
        return conn.access_token;
      }

      // Try refresh (even if needs_reconnect was set due to transient errors)
      if (conn?.refresh_token) {
        return await refreshGoogleTokenWithRetry(supabase, professional_id, conn.refresh_token);
      }

      return null;
    };

    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      console.warn('[UPDATE:TOKEN] No valid token - needs reconnect');
      return new Response(
        JSON.stringify({ success: false, error: 'needs_reconnect', message: 'Token expirado, reconecta Google' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calendarId = connection.google_calendar_id || 'primary';

    // CASE 1: No event_id provided - create new event if create_if_not_exists is true
    if (!event_id && create_if_not_exists) {
      console.log('[UPDATE] No event_id provided, creating new event (auto-migration)');
      
      if (!session_date || !start_time || !end_time || !psycma_session_id) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Faltan datos para crear evento (session_date, start_time, end_time, psycma_session_id)' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const createResult = await createGoogleEvent(accessToken, calendarId, {
        title: title || 'Sesión',
        description,
        session_date,
        start_time,
        end_time,
        psycma_session_id,
      });

      if (!createResult.success) {
        return new Response(
          JSON.stringify({ success: false, error: createResult.error }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          event_id: createResult.event_id, 
          created: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no event_id and create_if_not_exists is false, nothing to do
    if (!event_id) {
      console.log('[UPDATE] No event_id and create_if_not_exists is false, skipping');
      return new Response(
        JSON.stringify({ success: true, skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASE 2: Cancelling event
    if (status === 'cancelled') {
      console.log(`[DELETE] Deleting Google Calendar event: ${event_id}`);
      const deleteResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      // Handle 401 - try refresh and retry once
      if (deleteResponse.status === 401) {
        console.log('[DELETE] Got 401, refreshing token and retrying...');
        accessToken = await refreshGoogleToken(supabase, professional_id, connection.refresh_token);
        if (accessToken) {
          const retryResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
            {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${accessToken}` },
            }
          );
          if (!retryResponse.ok && retryResponse.status !== 404 && retryResponse.status !== 410) {
            console.error('Delete retry failed:', retryResponse.status);
          }
        }
      } else if (!deleteResponse.ok && deleteResponse.status !== 404 && deleteResponse.status !== 410) {
        const errorData = await deleteResponse.json();
        console.error('Error deleting event:', errorData);
      }

      return new Response(
        JSON.stringify({ success: true, deleted: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CASE 3: Updating existing event
    const event: any = {};

    if (title) event.summary = title;
    if (location !== undefined) event.location = location || '';
    // Apply explicit colors with the main update. Removing a color is done in a
    // separate request below so a rejected color reset can never block a move.
    const shouldClearColor = color_id === null;
    if (color_id !== undefined && color_id !== null) event.colorId = color_id;
    
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
      // Ensure time has seconds (HH:MM -> HH:MM:00, HH:MM:SS stays as-is)
      const fmtTime = (t: string) => t.split(':').length === 3 ? t : `${t}:00`;
      event.start = {
        dateTime: `${session_date}T${fmtTime(start_time)}`,
        timeZone: 'Europe/Madrid',
      };
      event.end = {
        dateTime: `${session_date}T${fmtTime(end_time)}`,
        timeZone: 'Europe/Madrid',
      };
    }

    // CRITICAL: Always add extended properties to mark this as a Psycma event
    if (psycma_session_id) {
      event.extendedProperties = {
        private: {
          psycma_session_id: psycma_session_id,
        },
      };
      console.log(`[UPDATE] Marking event ${event_id} with psycma_session_id: ${psycma_session_id}`);
    }

    // Attempt PATCH
    console.log(`[UPDATE] Attempting PATCH on event: ${event_id}`);
    let updateResponse = await fetch(
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

    // Handle 401 - refresh token and retry once
    if (updateResponse.status === 401) {
      console.log('[UPDATE] Got 401, refreshing token and retrying...');
      if (connection.refresh_token) {
        accessToken = await refreshGoogleTokenWithRetry(supabase, professional_id, connection.refresh_token);
      } else {
        accessToken = null;
      }

      if (!accessToken) {
        return new Response(
          JSON.stringify({ success: false, error: 'needs_reconnect', message: 'Token expirado, reconecta Google' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Retry the PATCH
      updateResponse = await fetch(
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
    }

    // Handle 404 or 410 (event was deleted in Google) - recreate the event
    if (updateResponse.status === 404 || updateResponse.status === 410) {
      console.log(`[UPDATE] Event ${event_id} not found/deleted (status ${updateResponse.status}), recreating...`);
      
      if (!session_date || !start_time || !end_time || !psycma_session_id) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            status: updateResponse.status,
            error: 'Evento no encontrado en Google y faltan datos para recrearlo' 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const createResult = await createGoogleEvent(accessToken, calendarId, {
        title: title || 'Sesión',
        description,
        session_date,
        start_time,
        end_time,
        psycma_session_id,
      });

      if (!createResult.success) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            status: updateResponse.status,
            error: createResult.error 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          event_id: createResult.event_id, 
          recreated: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle other errors
    if (!updateResponse.ok) {
      const errorData = await updateResponse.json();
      console.error('Error updating event:', errorData);
      return new Response(
        JSON.stringify({ 
          success: false, 
          status: updateResponse.status,
          error: 'Error al actualizar evento', 
          details: errorData 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventData = await updateResponse.json();
    console.log(`[UPDATE] Event updated successfully: ${eventData.id}`);

    let colorReset = true;
    if (shouldClearColor) {
      const colorResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${event_id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ colorId: null }),
        }
      );

      colorReset = colorResponse.ok;
      if (!colorReset) {
        const colorError = await colorResponse.text();
        console.error(`[UPDATE] Event moved, but color reset failed (${colorResponse.status}):`, colorError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        event_id: eventData.id,
        ...(shouldClearColor && !colorReset
          ? { warning: 'event_updated_but_color_reset_failed' }
          : {}),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
