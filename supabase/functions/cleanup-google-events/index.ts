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
        console.error('[CLEANUP] Error decrypting center OAuth credentials:', error);
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
    console.error('[CLEANUP] Google OAuth credentials not configured');
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

    console.error('[CLEANUP] Token refresh failed:', data.error);
  } catch (error) {
    console.error('[CLEANUP] Error refreshing token:', error);
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

// Check if event is a Psycma-created event
function isPsycmaEvent(event: any): boolean {
  // Primary check: extendedProperties
  if (event.extendedProperties?.private?.psycma_session_id) {
    return true;
  }
  // Fallback check: description token
  if (event.description) {
    const match = event.description.match(/\[PSYCMA_SESSION_ID:([^\]]+)\]/);
    if (match) return true;
  }
  return false;
}

// Sleep utility for backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Delete event with retry/backoff for 429/5xx
async function deleteEventWithRetry(
  accessToken: string,
  calendarId: string,
  eventId: string,
  maxRetries = 3
): Promise<{ success: boolean; status: number }> {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    // Success or event already deleted
    if (response.ok || response.status === 404 || response.status === 410) {
      return { success: true, status: response.status };
    }

    // Rate limit or server error - retry with backoff
    if (response.status === 429 || response.status >= 500) {
      attempt++;
      const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      console.log(`[CLEANUP] Rate limited/server error (${response.status}), retrying in ${backoffMs}ms (attempt ${attempt}/${maxRetries})`);
      await sleep(backoffMs);
      continue;
    }

    // Other error - don't retry
    return { success: false, status: response.status };
  }

  return { success: false, status: 429 };
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

    console.log(`[CLEANUP:START] Cleaning up Psycma events from Google Calendar for professional ${professionalId}`);

    // Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: 'No hay conexión con Google configurada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.refresh_token) {
      return new Response(
        JSON.stringify({ error: 'No hay refresh_token - reconecta Google' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const calendarId = connection.google_calendar_id;
    if (!calendarId) {
      return new Response(
        JSON.stringify({ error: 'No hay calendario seleccionado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get sync days configuration
    const { data: integrations } = await supabase
      .from('professional_integrations')
      .select('google_sync_days_past, google_sync_days_future')
      .eq('professional_id', professionalId)
      .single();

    const daysPast = integrations?.google_sync_days_past ?? 30;
    const daysFuture = integrations?.google_sync_days_future ?? 90;

    const now = new Date();
    const timeMin = new Date(now.getTime() - daysPast * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + daysFuture * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[CLEANUP] Range: ${daysPast} days past to ${daysFuture} days future`);
    console.log(`[CLEANUP] TimeMin: ${timeMin}, TimeMax: ${timeMax}`);

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, connection);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'No se pudo obtener token de acceso válido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all events in range with pagination
    let allEvents: any[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: '2500',
        singleEvents: 'true',
        fields: 'items(id,description,extendedProperties),nextPageToken',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[CLEANUP] Error fetching events:', errorText);
        return new Response(
          JSON.stringify({ error: 'Error al obtener eventos de Google', details: errorText }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      allEvents = allEvents.concat(data.items || []);
      pageToken = data.nextPageToken;

      console.log(`[CLEANUP] Fetched page with ${data.items?.length || 0} events`);
    } while (pageToken);

    console.log(`[CLEANUP] Total events fetched: ${allEvents.length}`);

    // Filter only Psycma events
    const psycmaEvents = allEvents.filter(isPsycmaEvent);
    console.log(`[CLEANUP] Psycma events found: ${psycmaEvents.length}`);

    // Delete each Psycma event
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const event of psycmaEvents) {
      const result = await deleteEventWithRetry(accessToken, calendarId, event.id);
      
      if (result.success) {
        deleted++;
        console.log(`[CLEANUP] Deleted event ${event.id} (status: ${result.status})`);
      } else {
        failed++;
        errors.push(`Event ${event.id}: status ${result.status}`);
        console.error(`[CLEANUP] Failed to delete event ${event.id}: status ${result.status}`);
      }

      // Small delay between deletes to avoid rate limiting
      if (psycmaEvents.indexOf(event) < psycmaEvents.length - 1) {
        await sleep(100);
      }
    }

    console.log(`[CLEANUP:SUCCESS] Deleted ${deleted}/${psycmaEvents.length} events, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        total_found: allEvents.length,
        psycma_found: psycmaEvents.length,
        deleted,
        failed,
        errors: errors.length > 0 ? errors : undefined,
        range: {
          days_past: daysPast,
          days_future: daysFuture,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CLEANUP:ERROR]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
