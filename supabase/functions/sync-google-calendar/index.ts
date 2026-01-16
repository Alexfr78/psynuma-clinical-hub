import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  calendarEventsImported?: number;
}

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
          console.log('[SYNC] Using OAuth credentials from center configuration');
          return { clientId: center.oauth_google_client_id, clientSecret };
        }
      } catch (error) {
        console.error('[SYNC] Error decrypting center OAuth credentials:', error);
      }
    }
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (clientId && clientSecret) {
    console.log('[SYNC] Using OAuth credentials from environment variables');
    return { clientId, clientSecret };
  }

  return null;
}

// Helper function to log integration errors to the database
async function logIntegrationError(
  supabase: any,
  professionalId: string,
  source: string,
  step: string | null,
  httpStatus: number | null,
  errorCode: string | null,
  message: string | null,
  raw: any | null,
  correlationId?: string
): Promise<void> {
  try {
    // Sanitize raw to remove sensitive data
    let sanitizedRaw = raw;
    if (raw && typeof raw === 'object') {
      const sensitiveKeys = ['access_token', 'refresh_token', 'client_secret', 'authorization_code', 'id_token', 'code', 'token', 'secret', 'password', 'key', 'apikey', 'api_key', 'bearer', 'credential', 'credentials'];
      sanitizedRaw = { ...raw };
      for (const key of sensitiveKeys) {
        if (key in sanitizedRaw) {
          sanitizedRaw[key] = '[REDACTED]';
        }
      }
    }

    await supabase.rpc('log_integration_error', {
      p_professional_id: professionalId,
      p_provider: 'google',
      p_source: source,
      p_step: step,
      p_http_status: httpStatus,
      p_error_code: errorCode,
      p_message: message,
      p_raw: sanitizedRaw ? JSON.stringify(sanitizedRaw) : null,
      p_correlation_id: correlationId || null,
    });
  } catch (err) {
    console.error('[SYNC:LOG_ERROR] Failed to log integration error:', err);
  }
}

async function refreshGoogleToken(
  supabase: any,
  professionalId: string,
  refreshToken: string,
  correlationId?: string
): Promise<string | null> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    console.error('[SYNC:TOKEN] Google OAuth credentials not configured');
    await supabase
      .from('oauth_connections')
      .update({ 
        needs_reconnect: true, 
        last_sync_status: 'credentials_missing',
        last_sync_error_code: 'credentials_missing',
        last_sync_error_message: 'Google OAuth credentials not configured',
        last_token_refresh_at: new Date().toISOString(),
        last_token_refresh_result: 'fail',
      })
      .eq('professional_id', professionalId)
      .eq('provider', 'google');
    
    await logIntegrationError(supabase, professionalId, 'sync-google-calendar', 'refresh_token', null, 'credentials_missing', 'Google OAuth credentials not configured', null, correlationId);
    return null;
  }

  try {
    console.log('[SYNC:TOKEN] Attempting to refresh Google token...');
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
          last_sync_status: 'token_refreshed',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'success',
          last_sync_error_code: null,
          last_sync_error_message: null,
          consecutive_sync_errors: 0,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      console.log('[SYNC:TOKEN] Token refreshed successfully');
      return data.access_token;
    }

    console.error('[SYNC:TOKEN] Google token refresh failed:', data.error, data.error_description);

    // Log error to integration_errors table
    await logIntegrationError(
      supabase,
      professionalId,
      'sync-google-calendar',
      'refresh_token',
      response.status,
      data.error || 'token_refresh_failed',
      data.error_description || 'Token refresh failed',
      { http_status: response.status, error: data.error, error_description: data.error_description },
      correlationId
    );

    // Handle specific error cases - mark needs_reconnect with appropriate status
    if (data.error === 'invalid_client') {
      // invalid_client = OAuth credentials (client_id/secret) from center are wrong
      console.error('[SYNC:TOKEN] invalid_client - OAuth center credentials are wrong');
      await supabase
        .from('oauth_connections')
        .update({
          needs_reconnect: true,
          last_sync_status: 'oauth_credentials_invalid',
          last_sync_error_code: 'invalid_client',
          last_sync_error_message: 'Client ID o Secret del centro inválidos. Actualiza las credenciales OAuth.',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else if (data.error === 'invalid_grant') {
      // invalid_grant = user's refresh token was revoked or expired
      console.error('[SYNC:TOKEN] invalid_grant - user token revoked/expired');
      await supabase
        .from('oauth_connections')
        .update({
          needs_reconnect: true,
          last_sync_status: 'token_revoked',
          last_sync_error_code: 'invalid_grant',
          last_sync_error_message: 'El acceso a Google fue revocado o expiró. Reautoriza la conexión.',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else {
      // Other errors - don't set needs_reconnect, may be transient
      await supabase
        .from('oauth_connections')
        .update({
          last_sync_error_code: data.error,
          last_sync_error_message: data.error_description || 'Token refresh failed',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SYNC:TOKEN] Error refreshing Google token:', message);
    await logIntegrationError(supabase, professionalId, 'sync-google-calendar', 'refresh_token', null, 'exception', message, null, correlationId);
  }
  return null;
}

// Refresh token with exponential backoff retries
async function refreshGoogleTokenWithRetry(
  supabase: any,
  professionalId: string,
  refreshToken: string,
  maxRetries: number = 3,
  correlationId?: string
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[SYNC:TOKEN] Refresh attempt ${attempt}/${maxRetries}`);
    const token = await refreshGoogleToken(supabase, professionalId, refreshToken, correlationId);
    if (token) return token;
    
    if (attempt < maxRetries) {
      const waitMs = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
      console.log(`[SYNC:TOKEN] Retry ${attempt}/${maxRetries} failed, waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  
  console.error('[SYNC:TOKEN] All refresh attempts failed');
  await supabase
    .from('oauth_connections')
    .update({
      needs_reconnect: true,
      last_sync_status: 'token_refresh_failed',
    })
    .eq('professional_id', professionalId)
    .eq('provider', 'google');
  
  await logIntegrationError(supabase, professionalId, 'sync-google-calendar', 'refresh_token', null, 'all_retries_failed', `All ${maxRetries} token refresh attempts failed`, null, correlationId);
  
  return null;
}

async function getValidAccessToken(
  supabase: any,
  connection: any
): Promise<string | null> {
  const now = new Date();
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null;

  // Add 5 minute buffer to handle edge cases
  const bufferMs = 5 * 60 * 1000;
  if (expiresAt && (expiresAt.getTime() - bufferMs) > now.getTime() && connection.access_token) {
    return connection.access_token;
  }

  if (connection.refresh_token) {
    // Use retry version for better reliability
    return await refreshGoogleTokenWithRetry(supabase, connection.professional_id, connection.refresh_token);
  }

  return null;
}

// Parse Google event times - handles both all-day and timed events
function parseGoogleEventTimes(ev: any): { start_at: string | null; end_at: string | null; all_day: boolean } {
  const isAllDay = !!ev.start?.date && !ev.start?.dateTime;

  if (isAllDay) {
    // All-day events: start.date and end.date are YYYY-MM-DD
    // Note: end.date is exclusive (the day after the last day)
    return {
      all_day: true,
      start_at: ev.start.date ? new Date(ev.start.date + 'T00:00:00').toISOString() : null,
      end_at: ev.end.date ? new Date(ev.end.date + 'T00:00:00').toISOString() : null,
    };
  }

  return {
    all_day: false,
    start_at: ev.start?.dateTime ?? null,
    end_at: ev.end?.dateTime ?? null,
  };
}

// Fetch Google Calendar events with syncToken support and pagination
async function fetchGoogleCalendarEventsIncremental(
  accessToken: string,
  calendarId: string,
  syncToken?: string | null,
  timeMin?: string,
  timeMax?: string
): Promise<{ events: any[]; nextSyncToken: string | null; fullSync: boolean }> {
  let allEvents: any[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  let fullSync = false;

  const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

  do {
    const params = new URLSearchParams();
    
    if (syncToken && !fullSync) {
      // Incremental sync
      params.set('syncToken', syncToken);
    } else {
      // Full sync
      fullSync = true;
      if (timeMin) params.set('timeMin', timeMin);
      if (timeMax) params.set('timeMax', timeMax);
      params.set('singleEvents', 'true');
      params.set('orderBy', 'startTime');
    }

    params.set('maxResults', '2500');
    // CRITICAL: Include deleted/cancelled events so we can mark them as deleted in our DB
    params.set('showDeleted', 'true');
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`${baseUrl}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 410) {
      // 410 Gone - syncToken expired, need full resync
      console.log('[SYNC:FETCH] SyncToken expired (410 Gone), performing full resync');
      return fetchGoogleCalendarEventsIncremental(accessToken, calendarId, null, timeMin, timeMax);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error('[SYNC:FETCH] Error fetching Google Calendar events:', error);
      return { events: [], nextSyncToken: null, fullSync };
    }

    const data = await response.json();
    allEvents = allEvents.concat(data.items || []);
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || null;

    console.log(`[SYNC:FETCH] Fetched page with ${data.items?.length || 0} events, hasMore: ${!!pageToken}`);

  } while (pageToken);

  console.log(`[SYNC:FETCH] Total events fetched: ${allEvents.length}, nextSyncToken: ${nextSyncToken ? 'yes' : 'no'}`);

  return { events: allEvents, nextSyncToken, fullSync };
}

// Legacy function for sessions sync compatibility
async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<any[]> {
  const { events } = await fetchGoogleCalendarEventsIncremental(accessToken, calendarId, null, timeMin, timeMax);
  return events;
}

function formatEventText(
  template: string,
  session: any,
  patient: any,
  professional: any,
  location?: any,
  bono?: any
): string {
  const patientName = patient 
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() 
    : 'Paciente';
  const professionalName = professional 
    ? `${professional.first_name || ''} ${professional.last_name || ''}`.trim() 
    : 'Profesional';
  
  const modality = session.session_modality === 'video' || session.video_provider 
    ? 'Online' 
    : 'Presencial';
  
  const locationName = location?.name || '';
  const fullAddress = location 
    ? [location.street, location.number_details, location.city, location.postal_code]
        .filter(Boolean).join(', ')
    : '';
  
  const bonoName = bono?.name || 'Sin bono';
  
  const cancellationPolicies: Record<string, string> = {
    '24_hours': 'Hasta 24 horas antes',
    '48_hours': 'Hasta 48 horas antes',
    'flexible': 'Flexible',
    'strict': 'No reembolsable',
  };
  const cancellationPolicy = cancellationPolicies[session.cancellation_policy] || session.cancellation_policy || '';
  
  return template
    .replace(/{paciente}/g, patientName)
    .replace(/{profesional}/g, professionalName)
    .replace(/{tipo}/g, session.session_type || 'Sesión')
    .replace(/{hora}/g, session.start_time || '')
    .replace(/{fecha}/g, session.session_date || '')
    .replace(/{notas}/g, session.notes || '')
    .replace(/{telefono}/g, patient?.phone || '')
    .replace(/{modalidad}/g, modality)
    .replace(/{ubicacion}/g, locationName)
    .replace(/{direccion}/g, fullAddress)
    .replace(/{bono}/g, bonoName)
    .replace(/{politica_cancelacion}/g, cancellationPolicy)
    .replace(/{link_videollamada}/g, session.video_call_link || '')
    .replace(/{email_paciente}/g, patient?.email || '')
    .replace(/{precio}/g, session.price ? `${session.price}€` : '');
}

async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  session: any,
  patient: any,
  professional: any,
  titleFormat?: string,
  descriptionFormat?: string,
  location?: any,
  bono?: any
): Promise<string | null> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const defaultTitle = '{tipo} - {paciente}';
  const defaultDescription = 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';
  
  const title = formatEventText(titleFormat || defaultTitle, session, patient, professional, location, bono);
  const description = formatEventText(descriptionFormat || defaultDescription, session, patient, professional, location, bono);

  // Add Psycma marker to description for identification during sync
  const psycmaMarker = `\n\n[PSYCMA:${session.id}]`;
  const descriptionWithMarker = description + psycmaMarker;

  const event = {
    summary: title,
    description: descriptionWithMarker,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Madrid',
    },
    extendedProperties: {
      private: {
        psycma_session_id: session.id,
        psycma_created: 'true',
      },
    },
  };

  console.log(`[SYNC:CREATE] Creating event for session ${session.id} in calendar ${calendarId}`);
  console.log(`[SYNC:CREATE] Event: ${title} on ${session.session_date} ${session.start_time}-${session.end_time}`);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('[SYNC:CREATE] Error creating Google Calendar event:', error);
    return null;
  }

  const data = await response.json();
  console.log(`[SYNC:CREATE] Successfully created event ${data.id}`);
  return data.id;
}

async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  session: any,
  patient: any,
  professional: any,
  titleFormat?: string,
  descriptionFormat?: string,
  location?: any,
  bono?: any
): Promise<boolean> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const defaultTitle = '{tipo} - {paciente}';
  const defaultDescription = 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';
  
  const title = formatEventText(titleFormat || defaultTitle, session, patient, professional, location, bono);
  const description = formatEventText(descriptionFormat || defaultDescription, session, patient, professional, location, bono);

  // Add Psycma marker to description for identification during sync
  const psycmaMarker = `\n\n[PSYCMA:${session.id}]`;
  const descriptionWithMarker = description + psycmaMarker;

  const event = {
    summary: title,
    description: descriptionWithMarker,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Madrid',
    },
    extendedProperties: {
      private: {
        psycma_session_id: session.id,
        psycma_created: 'true',
      },
    },
  };

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[SYNC:UPDATE] Error updating event ${eventId}:`, error);
    return false;
  }

  return true;
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  return response.ok || response.status === 404;
}

// Check if a specific event exists in Google Calendar
async function checkGoogleEventExists(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      return false;
    }

    const event = await response.json();
    // Event exists and is not cancelled
    return event.status !== 'cancelled';
  } catch (error) {
    console.error(`[SYNC:CHECK] Error checking event ${eventId}:`, error);
    return false;
  }
}

// Parse Google Calendar datetime to Europe/Madrid timezone
function parseGoogleDateTimeToMadrid(dateTimeStr: string): { date: string; time: string } {
  const date = new Date(dateTimeStr);
  
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value || '2024';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const hour = parts.find(p => p.type === 'hour')?.value || '00';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

async function renewChannelIfExpiring(
  supabase: any,
  professionalId: string,
  calendarId: string,
  accessToken: string
): Promise<void> {
  try {
    const { data: channel } = await supabase
      .from('google_calendar_channels')
      .select('*')
      .eq('professional_id', professionalId)
      .eq('calendar_id', calendarId)
      .single();

    if (!channel) return;

    const expiration = new Date(channel.expiration);
    const hoursUntilExpiry = (expiration.getTime() - Date.now()) / (1000 * 60 * 60);

    if (hoursUntilExpiry > 24) {
      console.log(`[SYNC] Channel still valid for ${hoursUntilExpiry.toFixed(1)} hours`);
      return;
    }

    console.log(`[SYNC] Channel expiring in ${hoursUntilExpiry.toFixed(1)} hours, renewing...`);

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;
    const newChannelId = crypto.randomUUID();

    const watchResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newChannelId,
          type: 'web_hook',
          address: webhookUrl,
        }),
      }
    );

    if (watchResponse.ok) {
      const watchData = await watchResponse.json();
      const newExpiration = new Date(parseInt(watchData.expiration)).toISOString();

      await supabase
        .from('google_calendar_channels')
        .update({
          channel_id: watchData.id,
          resource_id: watchData.resourceId,
          expiration: newExpiration,
        })
        .eq('id', channel.id);

      // Also update oauth_connections
      await supabase
        .from('oauth_connections')
        .update({
          watch_channel_id: watchData.id,
          watch_resource_id: watchData.resourceId,
          watch_expires_at: newExpiration,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      console.log(`[SYNC] Channel renewed, new expiration: ${newExpiration}`);
    } else {
      console.error('[SYNC] Failed to renew channel:', await watchResponse.text());
    }
  } catch (error) {
    console.error('[SYNC] Error renewing channel:', error);
  }
}

// Helper to detect Psycma marker in event description (fallback check)
function hasPsycmaMarkerInDescription(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(/\[PSYCMA_SESSION_ID:([^\]]+)\]/);
  return match ? match[1] : null;
}

// Check if event is a Psycma-created event (should NOT be imported as external block)
function isPsycmaEvent(event: any): boolean {
  // Primary check: extendedProperties
  if (event.extendedProperties?.private?.psycma_session_id) {
    return true;
  }
  // Fallback check: description token
  if (hasPsycmaMarkerInDescription(event.description)) {
    return true;
  }
  return false;
}

// Upsert events to calendar_events table
async function upsertCalendarEvents(
  supabase: any,
  professionalId: string,
  calendarId: string,
  events: any[]
): Promise<{ imported: number; deleted: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, deleted: 0, skipped: 0, errors: [] as string[] };

  if (events.length === 0) return result;

  // CRITICAL: Filter out Psycma-created events using both extendedProperties AND description token
  const eventsWithPsycmaId: any[] = [];
  const eventsToImport: any[] = [];
  
  for (const ev of events) {
    if (isPsycmaEvent(ev)) {
      eventsWithPsycmaId.push(ev);
      const marker = ev.extendedProperties?.private?.psycma_session_id || 
                     hasPsycmaMarkerInDescription(ev.description);
      console.log(`[SYNC:SKIP] Skipping Psycma event ${ev.id} (marker: ${marker})`);
    } else {
      eventsToImport.push(ev);
    }
  }

  result.skipped = eventsWithPsycmaId.length;
  
  if (eventsWithPsycmaId.length > 0) {
    console.log(`[SYNC:UPSERT] Skipped ${eventsWithPsycmaId.length} Psycma events (extendedProperties or description token)`);
  }

  if (eventsToImport.length === 0) return result;

  // Check which events are already linked to sessions in the sessions table
  const googleEventIds = eventsToImport.map((ev: any) => ev.id);
  
  const { data: linkedSessions } = await supabase
    .from('sessions')
    .select('google_calendar_event_id')
    .eq('professional_id', professionalId)
    .not('google_calendar_event_id', 'is', null)
    .in('google_calendar_event_id', googleEventIds);

  const linkedEventIds = new Set(
    (linkedSessions || []).map((s: any) => s.google_calendar_event_id)
  );

  const mappedEvents = eventsToImport.map((ev: any) => {
    const times = parseGoogleEventTimes(ev);
    const isLinkedToSession = linkedEventIds.has(ev.id);
    
    return {
      provider: 'google' as const,
      professional_id: professionalId,
      calendar_id: calendarId,
      google_event_id: ev.id,
      status: ev.status,
      summary: ev.summary ?? null,
      description: ev.description ?? null,
      location: ev.location ?? null,
      start_at: times.start_at,
      end_at: times.end_at,
      all_day: times.all_day,
      updated_at_google: ev.updated ? new Date(ev.updated).toISOString() : null,
      etag: ev.etag ?? null,
      deleted: ev.status === 'cancelled',
      raw: ev,
      // Mark as converted if already linked to a session
      is_converted: isLinkedToSession,
    };
  });

  // Upsert in batches
  const batchSize = 100;
  for (let i = 0; i < mappedEvents.length; i += batchSize) {
    const batch = mappedEvents.slice(i, i + batchSize);
    const { error } = await supabase
      .from('calendar_events')
      .upsert(batch, { onConflict: 'professional_id,provider,google_event_id' });

    if (error) {
      console.error('[SYNC:UPSERT] Error upserting calendar events:', error);
      result.errors.push(`Error upserting batch: ${error.message}`);
    } else {
      result.imported += batch.length;
    }
  }

  // Count deleted and linked
  result.deleted = mappedEvents.filter(e => e.deleted).length;
  const linkedCount = mappedEvents.filter(e => e.is_converted).length;

  console.log(`[SYNC:UPSERT] Upserted ${result.imported} external events, ${result.deleted} marked deleted, ${linkedCount} marked as converted (linked to sessions)`);

  return result;
}

async function syncProfessional(
  supabase: any,
  professionalId: string,
  dateFrom: string,
  dateTo: string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [], calendarEventsImported: 0 };

  console.log(`[SYNC:START] ====================================`);
  console.log(`[SYNC:START] Professional ${professionalId}`);
  console.log(`[SYNC:START] Date range: ${dateFrom} to ${dateTo}`);
  console.log(`[SYNC:START] ====================================`);

  // Get OAuth connection
  const { data: connection, error: connError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('provider', 'google')
    .single();

  if (connError || !connection) {
    console.error('[SYNC:ERROR] No OAuth connection found');
    result.errors.push('No hay conexión con Google configurada');
    return result;
  }

  console.log(`[SYNC:CONFIG] sync_token: ${connection.sync_token ? 'present (incremental sync)' : 'null (full sync)'}`);
  console.log(`[SYNC:CONFIG] needs_reconnect: ${connection.needs_reconnect}`);
  console.log(`[SYNC:CONFIG] calendar_id: ${connection.google_calendar_id || 'NOT SET'}`);

  // Check if needs reconnect - but try auto-recovery first
  if (connection.needs_reconnect) {
    console.log('[SYNC:RECOVERY] Connection marked needs_reconnect, attempting auto-recovery...');
    console.log(`[SYNC:RECOVERY] Last error code: ${connection.last_sync_error_code}`);
    
    // CRITICAL: Never auto-recover from credential errors
    // invalid_client = OAuth credentials (client_id/secret) are wrong
    // invalid_grant = token revoked or expired in a way that requires re-auth
    const isCredentialError = ['invalid_client', 'invalid_grant'].includes(connection.last_sync_error_code);
    
    if (isCredentialError) {
      console.error(`[SYNC:ERROR] ${connection.last_sync_error_code} error - manual intervention required`);
      
      // Ensure state is consistent
      await supabase
        .from('oauth_connections')
        .update({ 
          needs_reconnect: true,
          last_sync_status: connection.last_sync_error_code === 'invalid_client' 
            ? 'oauth_credentials_invalid' 
            : 'needs_reconnect',
          consecutive_sync_errors: (connection.consecutive_sync_errors || 0) + 1
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
      
      const errorMsg = connection.last_sync_error_code === 'invalid_client'
        ? 'Las credenciales OAuth del centro son inválidas. Actualiza el Client ID y Secret en Ajustes > Integraciones > Credenciales OAuth, luego reconecta.'
        : 'La conexión con Google necesita reconectarse manualmente. Ve a Ajustes > Integraciones.';
      
      result.errors.push(errorMsg);
      return result;
    }
    
    // For other errors, only try token refresh (NOT just "token looks valid by date")
    // Because needs_reconnect was set for a reason - don't clear it just because expires_at is in the future
    if (connection.refresh_token) {
      console.log('[SYNC:RECOVERY] Attempting token refresh with retries...');
      const recoveredToken = await refreshGoogleTokenWithRetry(supabase, professionalId, connection.refresh_token);
      
      if (recoveredToken) {
        console.log('[SYNC:RECOVERY] Auto-recovery successful! Token refreshed.');
        // Token refresh already clears needs_reconnect and updates last_sync_status
        // Continue with sync
      } else {
        console.error('[SYNC:ERROR] Auto-recovery failed, needs manual reconnect');
        result.errors.push('La conexión con Google necesita reconectarse manualmente. Ve a Ajustes > Integraciones.');
        return result;
      }
    } else {
      console.error('[SYNC:ERROR] No refresh token available, manual reconnect required');
      result.errors.push('La conexión con Google necesita reconectarse manualmente. Ve a Ajustes > Integraciones.');
      return result;
    }
  }

  // Get integrations settings
  const { data: integrations } = await supabase
    .from('professional_integrations')
    .select('*')
    .eq('professional_id', professionalId)
    .single();

  if (!integrations?.google_calendar_enabled) {
    console.error('[SYNC:ERROR] Google Calendar not enabled');
    result.errors.push('Google Calendar no está habilitado');
    return result;
  }

  console.log(`[SYNC:CONFIG] sync_mode: ${integrations.google_calendar_sync_mode}`);
  console.log(`[SYNC:CONFIG] days_past: ${integrations.google_sync_days_past ?? 30}, days_future: ${integrations.google_sync_days_future ?? 90}`);

  const accessToken = await getValidAccessToken(supabase, connection);
  if (!accessToken) {
    console.error('[SYNC:ERROR] Could not get valid access token');
    result.errors.push('Error de autenticación con Google. Reconecta tu cuenta.');
    return result;
  }

  // CRÍTICO: No usar 'primary' como fallback
  const calendarId = connection.google_calendar_id;
  if (!calendarId) {
    console.error('[SYNC:ERROR] No google_calendar_id configured');
    result.errors.push('No hay calendario seleccionado. Configura un calendario específico en Ajustes > Integraciones.');
    return result;
  }
  
  console.log(`[SYNC:CALENDAR] Using calendar: ${calendarId}`);

  // Renew webhook channel if expiring soon
  if (integrations?.google_calendar_sync_mode === 'two_way') {
    await renewChannelIfExpiring(supabase, professionalId, calendarId, accessToken);
  }

  // Get professional info
  const { data: professional } = await supabase
    .from('profiles')
    .select('first_name, last_name, center_id')
    .eq('id', professionalId)
    .single();

  const timeMin = `${dateFrom}T00:00:00Z`;
  const timeMax = `${dateTo}T23:59:59Z`;

  // Fetch Google events with incremental sync support
  const { events: googleEvents, nextSyncToken, fullSync } = await fetchGoogleCalendarEventsIncremental(
    accessToken,
    calendarId,
    connection.sync_token,
    timeMin,
    timeMax
  );

  console.log(`[SYNC:FETCHED] ${googleEvents.length} events, fullSync: ${fullSync}`);

  // NUEVO: Upsert events to calendar_events table
  const upsertResult = await upsertCalendarEvents(supabase, professionalId, calendarId, googleEvents);
  result.calendarEventsImported = upsertResult.imported;
  result.errors.push(...upsertResult.errors);

  // Build a map of Google event IDs
  const googleEventMap = new Map<string, any>();
  for (const event of googleEvents) {
    if (event.id) {
      googleEventMap.set(event.id, event);
    }
  }

  // Get sessions to sync
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select(`
      *,
      patient:patients!sessions_patient_id_fkey(first_name, last_name, phone, email),
      location:center_locations(name, street, number_details, city, postal_code),
      bono:bonos(name)
    `)
    .eq('professional_id', professionalId)
    .gte('session_date', dateFrom)
    .lte('session_date', dateTo)
    .neq('status', 'cancelled');

  if (sessionsError) {
    result.errors.push(`Error fetching sessions: ${sessionsError.message}`);
    return result;
  }

  const titleFormat = integrations?.google_event_title_format || '{tipo} - {paciente}';
  const descriptionFormat = integrations?.google_event_description_format || 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';

  const googleFetchSuccessful = googleEvents.length > 0 || integrations?.google_calendar_sync_mode !== 'two_way';

  // Sync Psycma sessions to Google Calendar
  for (const session of sessions || []) {
    if (!session.google_calendar_event_id) {
      // Create new event in Google Calendar
      const eventId = await createGoogleCalendarEvent(
        accessToken,
        calendarId,
        session,
        session.patient,
        professional,
        titleFormat,
        descriptionFormat,
        session.location,
        session.bono
      );

      if (eventId) {
        await supabase
          .from('sessions')
          .update({ google_calendar_event_id: eventId })
          .eq('id', session.id);
        result.created++;
      } else {
        result.errors.push(`Failed to create event for session ${session.id}`);
      }
    } else {
      // Check if the event still exists in Google Calendar
      let googleEvent = googleEventMap.get(session.google_calendar_event_id);
      let eventExists = !!googleEvent;
      
      // If event is not in the fetched list and this is a full sync, verify it exists via API
      // This handles cases where the calendar was changed or the event was deleted outside the sync range
      if (!googleEvent && fullSync) {
        console.log(`[SYNC:CHECK] Event ${session.google_calendar_event_id} not in fetched events, checking via API...`);
        eventExists = await checkGoogleEventExists(accessToken, calendarId, session.google_calendar_event_id);
        console.log(`[SYNC:CHECK] Event ${session.google_calendar_event_id} exists: ${eventExists}`);
      }
      
      if (!eventExists) {
        // Event was deleted from Google Calendar or doesn't exist in this calendar - recreate it
        console.log(`[SYNC:RECREATE] Event ${session.google_calendar_event_id} not found in Google Calendar, recreating...`);
        const newEventId = await createGoogleCalendarEvent(
          accessToken,
          calendarId,
          session,
          session.patient,
          professional,
          titleFormat,
          descriptionFormat,
          session.location,
          session.bono
        );

        if (newEventId) {
          await supabase
            .from('sessions')
            .update({ google_calendar_event_id: newEventId })
            .eq('id', session.id);
          result.created++;
          console.log(`[SYNC:RECREATE] Created new event ${newEventId} for session ${session.id}`);
        } else {
          result.errors.push(`Failed to recreate event for session ${session.id}`);
        }
      } else if (googleEvent) {
        // Event exists - check if Google has newer changes (two-way sync)
        if (integrations?.google_calendar_sync_mode === 'two_way' && googleEvent.start?.dateTime) {
          const parsedStart = parseGoogleDateTimeToMadrid(googleEvent.start.dateTime);
          const parsedEnd = parseGoogleDateTimeToMadrid(googleEvent.end.dateTime);

          if (session.session_date !== parsedStart.date ||
              session.start_time !== parsedStart.time ||
              session.end_time !== parsedEnd.time) {
            console.log(`[SYNC] Session ${session.id} differs from Google event - updating Psycma`);
            await supabase
              .from('sessions')
              .update({
                session_date: parsedStart.date,
                start_time: parsedStart.time,
                end_time: parsedEnd.time,
              })
              .eq('id', session.id);
            result.updated++;
            continue;
          }
        }
        
        // Update existing event in Google Calendar
        const updated = await updateGoogleCalendarEvent(
          accessToken,
          calendarId,
          session.google_calendar_event_id,
          session,
          session.patient,
          professional,
          titleFormat,
          descriptionFormat,
          session.location,
          session.bono
        );

        if (updated) {
          result.updated++;
        }
      }
    }
  }

  // Handle cancelled sessions
  if (googleFetchSuccessful) {
    const { data: cancelledSessions } = await supabase
      .from('sessions')
      .select('id, google_calendar_event_id')
      .eq('professional_id', professionalId)
      .eq('status', 'cancelled')
      .not('google_calendar_event_id', 'is', null)
      .gte('session_date', dateFrom)
      .lte('session_date', dateTo);

    for (const session of cancelledSessions || []) {
      if (session.google_calendar_event_id) {
        const deleted = await deleteGoogleCalendarEvent(
          accessToken,
          calendarId,
          session.google_calendar_event_id
        );

        if (deleted) {
          result.deleted++;
        }
      }
    }
  }

  // Update sync state based on results
  const hasErrors = result.errors.length > 0;
  
  if (hasErrors) {
    // Increment consecutive errors counter
    const currentErrors = connection.consecutive_sync_errors || 0;
    const newErrorCount = currentErrors + 1;
    
    console.log(`[SYNC:ERRORS] Sync had ${result.errors.length} errors. Consecutive errors: ${newErrorCount}`);
    
    if (newErrorCount >= 3) {
      // Too many consecutive errors - clear sync_token to force full resync next time
      console.log('[SYNC:RESET] Multiple consecutive errors, clearing sync_token for next full sync');
      await supabase
        .from('oauth_connections')
        .update({
          sync_token: null, // Force full sync next time
          consecutive_sync_errors: 0, // Reset counter
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'sync_errors_reset',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else {
      await supabase
        .from('oauth_connections')
        .update({
          consecutive_sync_errors: newErrorCount,
          last_sync_at: new Date().toISOString(),
          last_sync_status: 'sync_with_errors',
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
  } else {
    // Success - update sync state and reset error counter
    await supabase
      .from('oauth_connections')
      .update({
        sync_token: nextSyncToken ?? connection.sync_token,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'ok',
        consecutive_sync_errors: 0, // Reset on success
      })
      .eq('professional_id', professionalId)
      .eq('provider', 'google');
  }

  await supabase
    .from('professional_integrations')
    .update({ last_google_sync_at: new Date().toISOString() })
    .eq('professional_id', professionalId);

  console.log(`[SYNC:COMPLETE] Professional ${professionalId}`, result);

  return result;
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
    const { professional_id, date_from, date_to, sync_all_professionals } = body;

    // Calculate date range
    let dateFrom = date_from;
    let dateTo = date_to;

    if (!dateFrom || !dateTo) {
      if (professional_id) {
        const { data: profIntegrations } = await supabase
          .from('professional_integrations')
          .select('google_sync_days_past, google_sync_days_future')
          .eq('professional_id', professional_id)
          .single();

        const daysPast = profIntegrations?.google_sync_days_past ?? 30;
        const daysFuture = profIntegrations?.google_sync_days_future ?? 90;

        const now = new Date();
        const fromDate = new Date(now);
        fromDate.setDate(fromDate.getDate() - daysPast);
        dateFrom = fromDate.toISOString().split('T')[0];

        const toDate = new Date(now);
        toDate.setDate(toDate.getDate() + daysFuture);
        dateTo = toDate.toISOString().split('T')[0];
      } else {
        const now = new Date();
        const defaultDateFrom = new Date(now);
        defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
        const defaultDateTo = new Date(now);
        defaultDateTo.setDate(defaultDateTo.getDate() + 90);

        dateFrom = defaultDateFrom.toISOString().split('T')[0];
        dateTo = defaultDateTo.toISOString().split('T')[0];
      }
    }

    let totalResult: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [], calendarEventsImported: 0 };

    if (sync_all_professionals) {
      console.log('[SYNC:CRON] Starting sync for all professionals');
      
      // Sync all professionals with Google Calendar enabled and not needing reconnect
      const { data: allConnections } = await supabase
        .from('oauth_connections')
        .select('professional_id')
        .eq('provider', 'google')
        .eq('needs_reconnect', false)
        .not('refresh_token', 'is', null);

      const { data: enabledIntegrations } = await supabase
        .from('professional_integrations')
        .select('professional_id')
        .eq('google_calendar_enabled', true);

      const enabledSet = new Set((enabledIntegrations || []).map(i => i.professional_id));
      const toSync = (allConnections || []).filter(c => enabledSet.has(c.professional_id));

      console.log(`[SYNC:CRON] Found ${toSync.length} professionals to sync`);

      for (const connection of toSync) {
        try {
          const result = await syncProfessional(supabase, connection.professional_id, dateFrom, dateTo);
          totalResult.created += result.created;
          totalResult.updated += result.updated;
          totalResult.deleted += result.deleted;
          totalResult.calendarEventsImported = (totalResult.calendarEventsImported || 0) + (result.calendarEventsImported || 0);
          totalResult.errors.push(...result.errors.map(e => `[${connection.professional_id}] ${e}`));
        } catch (err) {
          console.error(`[SYNC:CRON] Error syncing ${connection.professional_id}:`, err);
          totalResult.errors.push(`[${connection.professional_id}] ${err}`);
        }
      }
    } else if (professional_id) {
      totalResult = await syncProfessional(supabase, professional_id, dateFrom, dateTo);
    } else {
      return new Response(
        JSON.stringify({ error: 'professional_id or sync_all_professionals required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(totalResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[SYNC:ERROR]', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
