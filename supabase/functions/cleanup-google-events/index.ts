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

// Check if event is a Psycma-created event and extract session ID if present
function getPsycmaSessionId(event: any): string | null {
  // Primary check: extendedProperties
  if (event.extendedProperties?.private?.psycma_session_id) {
    return event.extendedProperties.private.psycma_session_id;
  }
  // Fallback check: description token [PSYCMA_SESSION_ID:xxx]
  if (event.description) {
    const match = event.description.match(/\[PSYCMA_SESSION_ID:([^\]]+)\]/);
    if (match) return match[1];
    // Also check [PSYCMA:xxx] format
    const match2 = event.description.match(/\[PSYCMA:([^\]]+)\]/);
    if (match2) return match2[1];
  }
  return null;
}

function isPsycmaEvent(event: any): boolean {
  return getPsycmaSessionId(event) !== null || 
         event.extendedProperties?.private?.psycma_created === 'true';
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

interface GoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: {
    private?: {
      psycma_session_id?: string;
      psycma_created?: string;
    };
  };
  description?: string;
  status?: string;
  created?: string;
}

interface DuplicateGroup {
  key: string;
  sessionId: string | null;
  events: GoogleEvent[];
  keep: GoogleEvent | null;
  toDelete: GoogleEvent[];
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

    const body = await req.json();
    const { 
      professional_id, 
      dry_run = true,  // Default to dry run for safety
      mode = 'duplicates' // 'duplicates' = only remove duplicates, 'all' = remove all psycma events
    } = body;

    if (!professional_id) {
      return new Response(
        JSON.stringify({ error: 'professional_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[CLEANUP:START] Professional ${professional_id}, mode=${mode}, dry_run=${dry_run}`);

    // Get OAuth connection
    const { data: connection, error: connError } = await supabase
      .from('oauth_connections')
      .select('*')
      .eq('professional_id', professional_id)
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
      .eq('professional_id', professional_id)
      .single();

    const daysPast = integrations?.google_sync_days_past ?? 30;
    const daysFuture = integrations?.google_sync_days_future ?? 90;

    const now = new Date();
    const timeMin = new Date(now.getTime() - daysPast * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + daysFuture * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[CLEANUP] Range: ${daysPast} days past to ${daysFuture} days future`);

    // Get valid access token
    const accessToken = await getValidAccessToken(supabase, connection);
    if (!accessToken) {
      return new Response(
        JSON.stringify({ error: 'No se pudo obtener token de acceso válido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all sessions with google_calendar_event_id to know which events to keep
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, google_calendar_event_id')
      .eq('professional_id', professional_id)
      .not('google_calendar_event_id', 'is', null);

    const linkedEventIds = new Set((sessions || []).map((s: any) => s.google_calendar_event_id));
    console.log(`[CLEANUP] Found ${linkedEventIds.size} events currently linked to sessions in DB`);

    // Fetch all events in range with pagination
    let allEvents: GoogleEvent[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: '2500',
        singleEvents: 'true',
        orderBy: 'startTime',
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

    // Filter only Psycma events (skip cancelled)
    const psycmaEvents = allEvents.filter(e => e.status !== 'cancelled' && isPsycmaEvent(e));
    console.log(`[CLEANUP] Psycma events found: ${psycmaEvents.length}`);

    let eventsToDelete: GoogleEvent[] = [];
    let duplicateGroups: DuplicateGroup[] = [];

    if (mode === 'all') {
      // Delete ALL psycma events (original behavior)
      eventsToDelete = psycmaEvents;
    } else {
      // Mode 'duplicates': Only delete duplicate events, keeping the one linked to session

      // Group events by start time + summary (normalized)
      const eventGroups = new Map<string, GoogleEvent[]>();

      for (const event of psycmaEvents) {
        const startDateTime = event.start?.dateTime || event.start?.date || '';
        const summary = (event.summary || '').toLowerCase().trim();
        const key = `${startDateTime}|${summary}`;
        
        if (!eventGroups.has(key)) {
          eventGroups.set(key, []);
        }
        eventGroups.get(key)!.push(event);
      }

      // Find groups with duplicates
      for (const [key, events] of eventGroups) {
        if (events.length > 1) {
          // Determine which event to keep (priority: linked to session > oldest created)
          const sorted = events.sort((a, b) => {
            // First priority: event linked to a session in DB
            const aLinked = linkedEventIds.has(a.id);
            const bLinked = linkedEventIds.has(b.id);
            if (aLinked && !bLinked) return -1;
            if (!aLinked && bLinked) return 1;
            
            // Second priority: oldest created (first one created is likely the "correct" one)
            const aCreated = a.created ? new Date(a.created).getTime() : 0;
            const bCreated = b.created ? new Date(b.created).getTime() : 0;
            return aCreated - bCreated;
          });

          const keep = sorted[0];
          const toDelete = sorted.slice(1);

          // Get session ID from the event we're keeping
          const sessionId = getPsycmaSessionId(keep);

          duplicateGroups.push({
            key,
            sessionId,
            events,
            keep,
            toDelete,
          });

          eventsToDelete.push(...toDelete);
        }
      }

      console.log(`[CLEANUP] Found ${duplicateGroups.length} duplicate groups`);
    }

    console.log(`[CLEANUP] Events to delete: ${eventsToDelete.length}`);

    // If dry_run, just return analysis
    if (dry_run) {
      const result: any = {
        success: true,
        dry_run: true,
        mode,
        analysis: {
          total_events_in_calendar: allEvents.length,
          psycma_events: psycmaEvents.length,
          linked_to_sessions: linkedEventIds.size,
          events_to_delete: eventsToDelete.length,
          events_to_keep: psycmaEvents.length - eventsToDelete.length,
        },
        range: { days_past: daysPast, days_future: daysFuture },
      };

      if (mode === 'duplicates') {
        result.duplicate_groups = duplicateGroups.length;
        result.duplicates = duplicateGroups.map(g => ({
          key: g.key,
          session_id: g.sessionId,
          total_count: g.events.length,
          keep: g.keep ? { id: g.keep.id, summary: g.keep.summary, linked: linkedEventIds.has(g.keep.id) } : null,
          delete: g.toDelete.map(e => ({ id: e.id, summary: e.summary })),
        }));
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Actually delete events
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const event of eventsToDelete) {
      const result = await deleteEventWithRetry(accessToken, calendarId, event.id);
      
      if (result.success) {
        deleted++;
        console.log(`[CLEANUP] Deleted event ${event.id} (${event.summary})`);
      } else {
        failed++;
        errors.push(`Event ${event.id}: status ${result.status}`);
        console.error(`[CLEANUP] Failed to delete event ${event.id}: status ${result.status}`);
      }

      // Small delay between deletes to avoid rate limiting
      await sleep(100);
    }

    console.log(`[CLEANUP:COMPLETE] Deleted ${deleted}/${eventsToDelete.length} events`);

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: false,
        mode,
        deleted,
        failed,
        total_duplicates: eventsToDelete.length,
        errors: errors.length > 0 ? errors : undefined,
        range: { days_past: daysPast, days_future: daysFuture },
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
