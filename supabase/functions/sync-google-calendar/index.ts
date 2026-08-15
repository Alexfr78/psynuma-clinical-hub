import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  buildGoogleEventsListParams,
  canRequestGoogleSync,
  isPsycmaGoogleEvent,
  shouldTreatGoogleEventAsExisting,
} from "../_shared/googleSyncSafety.ts";
import {
  decideThreeWayScheduleSync,
  type CalendarSchedule,
} from "../_shared/googleThreeWaySync.ts";
import { notifyProfessionalBooking } from "../_shared/professionalNotification.ts";

// ============================================================
// SYNC ALERT — notifies the professional when Google→Psycma sync
// applies or blocks a change on an existing session.
// Uses the unified channel resolver (email + WhatsApp) and creates
// an in-app notification so changes never go silent again.
// ============================================================
async function alertProfessionalSyncChange(
  supabase: SupabaseClient,
  params: {
    professionalId: string;
    centerId: string;
    patientId: string;
    sessionId: string;
    outcome: 'applied' | 'blocked_large_move' | 'blocked_overlap' | 'conflict';
    oldDate: string;
    oldTime: string;
    newDate: string;
    newTime: string;
    correlationId: string;
  }
): Promise<void> {
  const { professionalId, centerId, patientId, sessionId, outcome, oldDate, oldTime, newDate, newTime, correlationId } = params;

  // 1. In-app notification (always, regardless of outcome)
  try {
    const title = outcome === 'applied'
      ? '⚠️ Google Calendar movió una sesión'
      : outcome === 'conflict'
        ? 'Conflicto de horario entre Google y Psycma'
      : outcome === 'blocked_large_move'
        ? '🛡️ Cambio grande bloqueado en Google Calendar'
        : '🛡️ Solapamiento bloqueado en Google Calendar';

    const body = outcome === 'applied'
      ? `Una sesión se movió desde Google Calendar de ${oldDate} ${oldTime} a ${newDate} ${newTime}. Revisa la agenda.`
      : outcome === 'conflict'
        ? `La misma sesión cambió en Google Calendar y Psycma. Se conservaron ambas versiones sin sobrescribirlas. Revisa la agenda.`
      : `Se intentó mover una sesión desde Google Calendar de ${oldDate} ${oldTime} a ${newDate} ${newTime}. Bloqueado para proteger los datos. Revisa la agenda.`;

    await supabase.from('notifications').insert({
      center_id: centerId,
      patient_id: patientId,
      session_id: sessionId,
      type: 'google_sync_conflict',
      status: 'sent',
      recipient: professionalId,
      subject: title,
      message: `${body} [sync_source=google_two_way outcome=${outcome} session=${sessionId} corr=${correlationId}]`,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[SYNC:${correlationId}] Failed to insert in-app notification:`, e);
  }

  // 2. Email + WhatsApp via the unified channel (treats it as a 'rescheduled' event).
  try {
    await notifyProfessionalBooking({
      supabase,
      centerId,
      professionalId,
      patientId,
      sessionId,
      eventType: 'rescheduled',
      sessionDate: newDate,
      startTime: newTime,
      oldDate,
      oldTime,
      reason: outcome === 'conflict'
        ? 'Conflicto detectado: la sesión cambió simultáneamente en Google Calendar y Psycma'
        : outcome === 'blocked_large_move'
        ? 'Cambio bloqueado automáticamente (movimiento grande detectado en Google Calendar)'
        : outcome === 'blocked_overlap'
          ? 'Cambio bloqueado automáticamente (solapamiento con otra sesión)'
          : 'Cambio aplicado desde Google Calendar (sincronización bidireccional)',
    });
  } catch (e) {
    console.error(`[SYNC:${correlationId}] Failed to send professional notification:`, e);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
// RATE LIMITING CONFIGURATION
// ============================================================
// Google Calendar API has a quota of 600 requests per minute.
// We limit to ~8 req/s (480/min) to leave headroom.
// ============================================================
const RATE_LIMIT_REQUESTS_PER_SECOND = 8;
const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_RETRIES = 5;
const MAX_EVENT_CHECKS_PER_SYNC = 10; // Limit checkGoogleEventExists calls

// Simple token bucket rate limiter (in-memory, per-invocation)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(requestsPerSecond: number) {
    this.maxTokens = requestsPerSecond;
    this.tokens = requestsPerSecond;
    this.refillRate = requestsPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    // Refill tokens based on elapsed time
    if (elapsed > 0) {
      const tokensToAdd = (elapsed / RATE_LIMIT_WINDOW_MS) * this.refillRate;
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait for next token
    const waitMs = Math.ceil((1 - this.tokens) * (RATE_LIMIT_WINDOW_MS / this.refillRate));
    await new Promise(r => setTimeout(r, waitMs));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

// Global rate limiter for this invocation
const rateLimiter = new RateLimiter(RATE_LIMIT_REQUESTS_PER_SECOND);

// Request counter for observability
let requestCount = 0;

interface SyncResult {
  created: number;
  updated: number;
  deleted: number;
  errors: string[];
  warnings?: string[];
  calendarEventsImported?: number;
  skipped?: boolean;
  requestCount?: number;
}

// ============================================================
// GOOGLE FETCH WRAPPER WITH RATE LIMITING AND RETRY
// ============================================================
async function googleFetch(
  url: string,
  init: RequestInit,
  options: { correlationId: string; step: string; attempt?: number }
): Promise<Response> {
  const { correlationId, step, attempt = 1 } = options;

  // Acquire rate limit token
  await rateLimiter.acquire();
  requestCount++;

  console.log(`[SYNC:${correlationId}:${step}] Request #${requestCount} (attempt ${attempt})`);

  const response = await fetch(url, init);

  // Handle rate limit errors
  if (response.status === 429 || 
      (response.status === 403 && await isRateLimitError(response.clone()))) {
    
    if (attempt >= MAX_RETRIES) {
      console.error(`[SYNC:${correlationId}:${step}] Max retries (${MAX_RETRIES}) exceeded for rate limit`);
      return response;
    }

    // Parse Retry-After header or use exponential backoff
    const retryAfter = response.headers.get('Retry-After');
    let waitMs: number;
    
    if (retryAfter) {
      waitMs = parseInt(retryAfter, 10) * 1000;
    } else {
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s + random 0-1s
      waitMs = Math.pow(2, attempt - 1) * 1000 + Math.random() * 1000;
    }

    console.warn(`[SYNC:${correlationId}:${step}] Rate limited (${response.status}), waiting ${waitMs}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
    await new Promise(r => setTimeout(r, waitMs));

    return googleFetch(url, init, { correlationId, step, attempt: attempt + 1 });
  }

  return response;
}

async function isRateLimitError(response: Response): Promise<boolean> {
  try {
    const body = await response.json();
    const reason = body?.error?.errors?.[0]?.reason;
    return reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
  } catch {
    return false;
  }
}

async function getGoogleOAuthCredentials(
  supabase: SupabaseClient,
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
        const clientSecret = await decryptSecret(center.oauth_google_credentials);
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
        console.error(`[SYNC:CREDS] Decrypt failed for center ${centerId}`);
      }
    }
  }

  if (envClientId && envClientSecret) {
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

async function logIntegrationError(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string,
  correlationId: string
): Promise<string | null> {
  const credentials = await getGoogleOAuthCredentials(supabase, professionalId);

  if (!credentials) {
    console.error(`[SYNC:${correlationId}] Google OAuth credentials not configured`);
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
    // Use googleFetch for rate limiting
    const response = await googleFetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      },
      { correlationId, step: 'refresh_token' }
    );

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

      console.log(`[SYNC:${correlationId}] Token refreshed successfully`);
      return data.access_token;
    }

    console.error(`[SYNC:${correlationId}] Token refresh failed:`, data.error);
    await logIntegrationError(supabase, professionalId, 'sync-google-calendar', 'refresh_token', response.status, data.error || 'token_refresh_failed', data.error_description || 'Token refresh failed', { http_status: response.status, error: data.error }, correlationId);

    const { data: currentConn } = await supabase
      .from('oauth_connections')
      .select('consecutive_sync_errors')
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .single();
    
    const currentErrors = currentConn?.consecutive_sync_errors || 0;
    
    if (data.error === 'invalid_client') {
      await supabase
        .from('oauth_connections')
        .update({
          needs_reconnect: true,
          last_sync_status: 'oauth_credentials_invalid',
          last_sync_error_code: 'invalid_client',
          last_sync_error_message: 'Client ID o Secret del centro inválidos.',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
          consecutive_sync_errors: currentErrors + 1,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else if (data.error === 'invalid_grant') {
      await supabase
        .from('oauth_connections')
        .update({
          needs_reconnect: true,
          last_sync_status: 'token_revoked',
          last_sync_error_code: 'invalid_grant',
          last_sync_error_message: 'El acceso a Google fue revocado o expiró.',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
          consecutive_sync_errors: currentErrors + 1,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    } else {
      await supabase
        .from('oauth_connections')
        .update({
          last_sync_error_code: data.error,
          last_sync_error_message: data.error_description || 'Token refresh failed',
          last_token_refresh_at: new Date().toISOString(),
          last_token_refresh_result: 'fail',
          consecutive_sync_errors: currentErrors + 1,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[SYNC:${correlationId}] Error refreshing token:`, message);
    await logIntegrationError(supabase, professionalId, 'sync-google-calendar', 'refresh_token', null, 'exception', message, null, correlationId);
  }
  return null;
}

async function refreshGoogleTokenWithRetry(
  supabase: SupabaseClient,
  professionalId: string,
  refreshToken: string,
  correlationId: string,
  maxRetries: number = 3
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[SYNC:${correlationId}] Token refresh attempt ${attempt}/${maxRetries}`);
    const token = await refreshGoogleToken(supabase, professionalId, refreshToken, correlationId);
    if (token) return token;
    
    if (attempt < maxRetries) {
      const waitMs = 1000 * Math.pow(2, attempt - 1);
      console.log(`[SYNC:${correlationId}] Retry ${attempt}/${maxRetries} failed, waiting ${waitMs}ms...`);
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
  
  console.error(`[SYNC:${correlationId}] All token refresh attempts failed`);
  await supabase
    .from('oauth_connections')
    .update({
      needs_reconnect: true,
      last_sync_status: 'token_refresh_failed',
    })
    .eq('professional_id', professionalId)
    .eq('provider', 'google');
  
  return null;
}

async function getValidAccessToken(
  supabase: SupabaseClient,
  connection: { expires_at?: string | null; access_token?: string | null; refresh_token?: string | null; professional_id: string },
  correlationId: string
): Promise<string | null> {
  const now = new Date();
  const expiresAt = connection.expires_at ? new Date(connection.expires_at) : null;
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt && (expiresAt.getTime() - bufferMs) > now.getTime() && connection.access_token) {
    return connection.access_token;
  }

  if (connection.refresh_token) {
    return await refreshGoogleTokenWithRetry(supabase, connection.professional_id, connection.refresh_token, correlationId);
  }

  return null;
}

function parseGoogleEventTimes(ev: any): { start_at: string | null; end_at: string | null; all_day: boolean } {
  const isAllDay = !!ev.start?.date && !ev.start?.dateTime;

  if (isAllDay) {
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

async function fetchGoogleCalendarEventsIncremental(
  accessToken: string,
  calendarId: string,
  correlationId: string,
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
    fullSync = !syncToken;
    const params = buildGoogleEventsListParams({
      syncToken,
      timeMin,
      timeMax,
      pageToken,
    });

    const response = await googleFetch(
      `${baseUrl}?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      { correlationId, step: 'list_events' }
    );

    if (response.status === 410) {
      console.log(`[SYNC:${correlationId}] SyncToken expired (410), performing full resync`);
      return fetchGoogleCalendarEventsIncremental(accessToken, calendarId, correlationId, null, timeMin, timeMax);
    }

    if (!response.ok) {
      const error = await response.text();
      console.error(`[SYNC:${correlationId}] Error fetching events:`, error);
      throw new Error(`Google Calendar list failed (${response.status}): ${error}`);
    }

    const data = await response.json();
    allEvents = allEvents.concat(data.items || []);
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken || null;

    console.log(`[SYNC:${correlationId}] Fetched page with ${data.items?.length || 0} events, hasMore: ${!!pageToken}`);

  } while (pageToken);

  console.log(`[SYNC:${correlationId}] Total events fetched: ${allEvents.length}`);

  return { events: allEvents, nextSyncToken, fullSync };
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
  correlationId: string,
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

  const psycmaMarker = `\n\n[PSYCMA:${session.id}]`;
  const descriptionWithMarker = description + psycmaMarker;

  const event = {
    summary: title,
    description: descriptionWithMarker,
    start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
    end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' },
    extendedProperties: {
      private: { psycma_session_id: session.id, psycma_created: 'true' },
    },
  };

  console.log(`[SYNC:${correlationId}] Creating event for session ${session.id}`);

  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    },
    { correlationId, step: 'create_event' }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[SYNC:${correlationId}] Error creating event:`, error);
    return null;
  }

  const data = await response.json();
  console.log(`[SYNC:${correlationId}] Created event ${data.id}`);
  return data.id;
}

async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  session: any,
  patient: any,
  professional: any,
  correlationId: string,
  titleFormat?: string,
  descriptionFormat?: string,
  location?: any,
  bono?: any,
  expectedEtag?: string | null,
): Promise<any | null> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const defaultTitle = '{tipo} - {paciente}';
  const defaultDescription = 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';
  
  const title = formatEventText(titleFormat || defaultTitle, session, patient, professional, location, bono);
  const description = formatEventText(descriptionFormat || defaultDescription, session, patient, professional, location, bono);

  const psycmaMarker = `\n\n[PSYCMA:${session.id}]`;
  const descriptionWithMarker = description + psycmaMarker;

  const event: Record<string, unknown> = {
    summary: title,
    description: descriptionWithMarker,
    start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
    end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' },
    extendedProperties: {
      private: { psycma_session_id: session.id, psycma_created: 'true' },
    },
    // "2" = sage green when confirmed; null resets to calendar default
    colorId: session.status === 'confirmed' ? '2' : null,
  };

  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(expectedEtag ? { 'If-Match': expectedEtag } : {}),
      },
      body: JSON.stringify(event),
    },
    { correlationId, step: 'update_event' }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error(`[SYNC:${correlationId}] Error updating event ${eventId}:`, error);
    return false;
  }

  return await response.json();
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  correlationId: string
): Promise<boolean> {
  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
    { correlationId, step: 'delete_event' }
  );

  return response.ok || response.status === 404;
}

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
  
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

function sessionSchedule(session: { session_date: string; start_time: string; end_time: string }): CalendarSchedule {
  return {
    date: session.session_date,
    start: session.start_time,
    end: session.end_time,
  };
}

function googleSchedule(event: any): CalendarSchedule {
  const start = parseGoogleDateTimeToMadrid(event.start.dateTime);
  const end = parseGoogleDateTimeToMadrid(event.end.dateTime);
  return { date: start.date, start: start.time, end: end.time };
}

function stateSchedule(state: { baseline_date: string; baseline_start: string; baseline_end: string }): CalendarSchedule {
  return {
    date: state.baseline_date,
    start: state.baseline_start,
    end: state.baseline_end,
  };
}

async function saveGoogleSyncState(
  supabase: SupabaseClient,
  session: any,
  event: any,
  schedule: CalendarSchedule,
  status: 'synced' | 'conflict' | 'error' = 'synced',
  conflictPayload: Record<string, unknown> | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('google_session_sync_state').upsert({
    session_id: session.id,
    professional_id: session.professional_id,
    google_event_id: session.google_calendar_event_id,
    baseline_date: schedule.date,
    baseline_start: schedule.start,
    baseline_end: schedule.end,
    google_etag: event?.etag ?? null,
    google_updated_at: event?.updated ?? null,
    status,
    conflict_payload: conflictPayload,
    last_synced_at: status === 'synced' ? now : undefined,
    updated_at: now,
  }, { onConflict: 'session_id' });

  if (error) throw new Error(`Could not persist Google sync state: ${error.message}`);
}

async function renewChannelIfExpiring(
  supabase: SupabaseClient,
  professionalId: string,
  calendarId: string,
  accessToken: string,
  correlationId: string
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
      console.log(`[SYNC:${correlationId}] Channel valid for ${hoursUntilExpiry.toFixed(1)}h, skipping renewal`);
      return;
    }

    console.log(`[SYNC:${correlationId}] Channel expiring in ${hoursUntilExpiry.toFixed(1)}h, renewing...`);

    const { data: oauthConn } = await supabase
      .from('oauth_connections')
      .select('watch_channel_token, watch_channel_id, watch_resource_id')
      .eq('professional_id', professionalId)
      .eq('provider', 'google')
      .single();

    let channelToken = oauthConn?.watch_channel_token;
    if (!channelToken) {
      channelToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      await supabase
        .from('oauth_connections')
        .update({ watch_channel_token: channelToken, updated_at: new Date().toISOString() })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');
    }

    if (oauthConn?.watch_channel_id && oauthConn?.watch_resource_id) {
      try {
        await googleFetch(
          'https://www.googleapis.com/calendar/v3/channels/stop',
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: oauthConn.watch_channel_id, resourceId: oauthConn.watch_resource_id }),
          },
          { correlationId, step: 'stop_channel' }
        );
      } catch (e) {
        console.warn(`[SYNC:${correlationId}] Error stopping previous channel:`, e);
      }
    }

    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-webhook`;
    const newChannelId = crypto.randomUUID();

    const watchResponse = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newChannelId, type: 'web_hook', address: webhookUrl, token: channelToken }),
      },
      { correlationId, step: 'create_watch' }
    );

    if (watchResponse.ok) {
      const watchData = await watchResponse.json();
      const newExpiration = new Date(parseInt(watchData.expiration)).toISOString();

      await supabase
        .from('google_calendar_channels')
        .update({ channel_id: watchData.id, resource_id: watchData.resourceId, expiration: newExpiration })
        .eq('id', channel.id);

      await supabase
        .from('oauth_connections')
        .update({
          watch_channel_id: watchData.id,
          watch_resource_id: watchData.resourceId,
          watch_expires_at: newExpiration,
          watch_channel_token: channelToken,
          last_sync_status: 'watch_renewed',
          last_sync_error_code: null,
          consecutive_sync_errors: 0,
        })
        .eq('professional_id', professionalId)
        .eq('provider', 'google');

      console.log(`[SYNC:${correlationId}] Channel renewed, expires: ${newExpiration}`);
    } else {
      console.error(`[SYNC:${correlationId}] Failed to renew channel:`, await watchResponse.text());
    }
  } catch (error) {
    console.error(`[SYNC:${correlationId}] Error renewing channel:`, error);
  }
}

async function upsertCalendarEvents(
  supabase: SupabaseClient,
  professionalId: string,
  calendarId: string,
  events: any[],
  correlationId: string
): Promise<{ imported: number; deleted: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, deleted: 0, skipped: 0, errors: [] as string[] };

  if (events.length === 0) return result;

  const eventsToImport: any[] = [];
  
  for (const ev of events) {
    if (isPsycmaGoogleEvent(ev)) {
      result.skipped++;
    } else {
      eventsToImport.push(ev);
    }
  }

  if (result.skipped > 0) {
    console.log(`[SYNC:${correlationId}] Skipped ${result.skipped} Psycma events`);
  }

  if (eventsToImport.length === 0) return result;

  const googleEventIds = eventsToImport.map((ev: any) => ev.id);
  
  const { data: linkedSessions } = await supabase
    .from('sessions')
    .select('google_calendar_event_id')
    .eq('professional_id', professionalId)
    .not('google_calendar_event_id', 'is', null)
    .in('google_calendar_event_id', googleEventIds);

  const linkedEventIds = new Set((linkedSessions || []).map((s: { google_calendar_event_id: string | null }) => s.google_calendar_event_id));

  const mappedEvents = eventsToImport.map((ev: any) => {
    const times = parseGoogleEventTimes(ev);
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
      is_converted: linkedEventIds.has(ev.id),
    };
  });

  const batchSize = 100;
  for (let i = 0; i < mappedEvents.length; i += batchSize) {
    const batch = mappedEvents.slice(i, i + batchSize);
    const { error } = await supabase
      .from('calendar_events')
      .upsert(batch, { onConflict: 'professional_id,provider,google_event_id' });

    if (error) {
      console.error(`[SYNC:${correlationId}] Error upserting calendar events:`, error);
      result.errors.push(`Upsert error: ${error.message}`);
    } else {
      result.imported += batch.length;
    }
  }

  result.deleted = mappedEvents.filter(e => e.deleted).length;
  console.log(`[SYNC:${correlationId}] Upserted ${result.imported} external events, ${result.deleted} marked deleted`);

  return result;
}

async function syncLinkedSessionSchedule(params: {
  supabase: SupabaseClient; session: any; googleEvent: any; syncState: any;
  integrations: any; accessToken: string; calendarId: string; professional: any;
  professionalId: string; correlationId: string; titleFormat: string;
  descriptionFormat: string; result: SyncResult;
}): Promise<void> {
  const {
    supabase, session, googleEvent, integrations, accessToken, calendarId,
    professional, professionalId, correlationId, titleFormat, descriptionFormat, result,
  } = params;
  const psycmaValue = sessionSchedule(session);
  const googleValue = googleSchedule(googleEvent);

  if (!params.syncState) {
    const schedulesAgree = decideThreeWayScheduleSync(psycmaValue, psycmaValue, googleValue) === 'noop';
    await saveGoogleSyncState(
      supabase, session, googleEvent, psycmaValue,
      schedulesAgree ? 'synced' : 'conflict',
      schedulesAgree ? null : { reason: 'missing_baseline', psycma: psycmaValue, google: googleValue },
    );
    if (!schedulesAgree) result.warnings?.push(`Google sync conflict for session ${session.id}: missing baseline`);
    return;
  }

  const baseline = stateSchedule(params.syncState);
  const decision = decideThreeWayScheduleSync(baseline, psycmaValue, googleValue);
  console.log(`[SYNC:${correlationId}] Three-way decision for ${session.id}: ${decision}`);

  if (decision === 'noop') return;
  if (decision === 'already_converged') {
    await saveGoogleSyncState(supabase, session, googleEvent, psycmaValue);
    return;
  }

  if (integrations?.google_calendar_sync_mode !== 'two_way' || decision === 'push_psycma') {
    const updatedEvent = await updateGoogleCalendarEvent(
      accessToken, calendarId, session.google_calendar_event_id, session,
      session.patient, professional, correlationId, titleFormat, descriptionFormat,
      session.location, session.bono, googleEvent.etag,
    );
    if (updatedEvent) {
      await saveGoogleSyncState(supabase, session, updatedEvent, psycmaValue);
      result.updated++;
    } else {
      await saveGoogleSyncState(supabase, session, googleEvent, baseline, 'conflict', {
        reason: 'google_precondition_failed', psycma: psycmaValue, google: googleValue,
      });
      result.warnings?.push(`Google changed concurrently for session ${session.id}; no data overwritten`);
    }
    return;
  }

  if (decision === 'conflict') {
    await saveGoogleSyncState(supabase, session, googleEvent, baseline, 'conflict', {
      reason: 'simultaneous_change', psycma: psycmaValue, google: googleValue,
    });
    result.warnings?.push(`Simultaneous Google/Psycma change preserved for session ${session.id}`);
    await alertProfessionalSyncChange(supabase, {
      professionalId, centerId: professional?.center_id, patientId: session.patient_id,
      sessionId: session.id, outcome: 'conflict', oldDate: psycmaValue.date,
      oldTime: psycmaValue.start, newDate: googleValue.date, newTime: googleValue.start,
      correlationId,
    });
    return;
  }

  const { data: overlap } = await supabase
    .from('sessions').select('id')
    .eq('professional_id', professionalId)
    .eq('session_date', googleValue.date)
    .neq('status', 'cancelled').neq('id', session.id)
    .lt('start_time', googleValue.end).gt('end_time', googleValue.start)
    .limit(1);

  if (Array.isArray(overlap) && overlap.length) {
    await saveGoogleSyncState(supabase, session, googleEvent, baseline, 'conflict', {
      reason: 'overlap', conflicting_session_id: overlap[0]?.id,
      psycma: psycmaValue, google: googleValue,
    });
    result.warnings?.push(`Google change overlaps another session for ${session.id}; both values preserved`);
    await alertProfessionalSyncChange(supabase, {
      professionalId, centerId: professional?.center_id, patientId: session.patient_id,
      sessionId: session.id, outcome: 'conflict', oldDate: psycmaValue.date,
      oldTime: psycmaValue.start, newDate: googleValue.date, newTime: googleValue.start,
      correlationId,
    });
    return;
  }

  const { data: updatedSessions, error: updateError } = await supabase
    .from('sessions')
    .update({ session_date: googleValue.date, start_time: googleValue.start, end_time: googleValue.end })
    .eq('id', session.id).eq('updated_at', session.updated_at).select('id');

  if (updateError || !updatedSessions?.length) {
    await saveGoogleSyncState(supabase, session, googleEvent, baseline, 'conflict', {
      reason: 'psycma_compare_and_swap_failed', psycma: psycmaValue, google: googleValue,
    });
    result.warnings?.push(`Psycma changed concurrently for session ${session.id}; no data overwritten`);
    return;
  }

  await saveGoogleSyncState(supabase, session, googleEvent, googleValue);
  result.updated++;
  await alertProfessionalSyncChange(supabase, {
    professionalId, centerId: professional?.center_id, patientId: session.patient_id,
    sessionId: session.id, outcome: 'applied', oldDate: psycmaValue.date,
    oldTime: psycmaValue.start, newDate: googleValue.date, newTime: googleValue.start,
    correlationId,
  });
}

async function syncProfessional(
  supabase: SupabaseClient,
  professionalId: string,
  dateFrom: string,
  dateTo: string,
  correlationId: string
): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: [],
    warnings: [],
    calendarEventsImported: 0,
    requestCount: 0,
  };

  console.log(`[SYNC:${correlationId}] ====================================`);
  console.log(`[SYNC:${correlationId}] Professional ${professionalId}`);
  console.log(`[SYNC:${correlationId}] Date range: ${dateFrom} to ${dateTo}`);

  // Get OAuth connection
  const { data: connection, error: connError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('provider', 'google')
    .single();

  if (connError || !connection) {
    console.error(`[SYNC:${correlationId}] No OAuth connection found`);
    result.errors.push('No hay conexión con Google configurada');
    return result;
  }

  // Check if needs reconnect
  if (connection.needs_reconnect) {
    const isCredentialError = ['invalid_client', 'invalid_grant'].includes(connection.last_sync_error_code);
    
    if (isCredentialError) {
      console.error(`[SYNC:${correlationId}] ${connection.last_sync_error_code} - manual intervention required`);
      result.errors.push('La conexión con Google necesita reconectarse manualmente.');
      return result;
    }
    
    if (connection.refresh_token) {
      console.log(`[SYNC:${correlationId}] Attempting auto-recovery...`);
      const recoveredToken = await refreshGoogleTokenWithRetry(supabase, professionalId, connection.refresh_token, correlationId);
      
      if (!recoveredToken) {
        result.errors.push('La conexión con Google necesita reconectarse manualmente.');
        return result;
      }
    } else {
      result.errors.push('La conexión con Google necesita reconectarse manualmente.');
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
    result.errors.push('Google Calendar no está habilitado');
    return result;
  }

  const accessToken = await getValidAccessToken(supabase, connection, correlationId);
  if (!accessToken) {
    result.errors.push('Error de autenticación con Google.');
    return result;
  }

  const calendarId = connection.google_calendar_id;
  if (!calendarId) {
    result.errors.push('No hay calendario seleccionado.');
    return result;
  }
  
  console.log(`[SYNC:${correlationId}] Calendar: ${calendarId}`);

  // Renew webhook channel if expiring
  if (integrations?.google_calendar_sync_mode === 'two_way') {
    await renewChannelIfExpiring(supabase, professionalId, calendarId, accessToken, correlationId);
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
    correlationId,
    connection.sync_token,
    timeMin,
    timeMax
  );

  console.log(`[SYNC:${correlationId}] Fetched ${googleEvents.length} events, fullSync: ${fullSync}`);

  // Upsert events to calendar_events table
  const upsertResult = await upsertCalendarEvents(supabase, professionalId, calendarId, googleEvents, correlationId);
  result.calendarEventsImported = upsertResult.imported;
  result.errors.push(...upsertResult.errors);

  // Build a map of Google event IDs
  const googleEventMap = new Map<string, any>();
  for (const event of googleEvents) {
    if (event.id) googleEventMap.set(event.id, event);
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

  const sessionIds = (sessions || []).map((session: any) => session.id);
  const { data: syncStates, error: syncStatesError } = sessionIds.length > 0
    ? await supabase
        .from('google_session_sync_state')
        .select('*')
        .in('session_id', sessionIds)
    : { data: [], error: null };

  if (syncStatesError) {
    result.errors.push(`Error fetching Google sync state: ${syncStatesError.message}`);
    return result;
  }

  const syncStateBySessionId = new Map(
    (syncStates || []).map((state: any) => [state.session_id, state]),
  );

  // Track event checks to limit API calls
  let eventChecksCount = 0;

  // Sync Psycma sessions to Google Calendar
  for (const session of sessions || []) {
    if (!session.google_calendar_event_id) {
      // Create new event
      const eventId = await createGoogleCalendarEvent(
        accessToken, calendarId, session, session.patient, professional, correlationId,
        titleFormat, descriptionFormat, session.location, session.bono
      );

      if (eventId) {
        await supabase.from('sessions').update({ google_calendar_event_id: eventId }).eq('id', session.id);
        session.google_calendar_event_id = eventId;
        await saveGoogleSyncState(supabase, session, null, sessionSchedule(session));
        result.created++;
      } else {
        result.errors.push(`Failed to create event for session ${session.id}`);
      }
    } else {
      let googleEvent = googleEventMap.get(session.google_calendar_event_id);
      // Incremental responses contain only changed events. If an event is
      // absent there, it is unchanged rather than deleted.
      let eventExists = shouldTreatGoogleEventAsExisting(googleEvent, fullSync);
      
      // OPTIMIZATION: Limit the number of checkGoogleEventExists calls
      // If event is not in the fetched list, assume it doesn't exist and recreate
      // This saves 1 API call per "missing" session
      if (!googleEvent && fullSync && eventChecksCount < MAX_EVENT_CHECKS_PER_SYNC) {
        // Only do explicit check for first N sessions, then assume missing = recreate
        eventChecksCount++;
        console.log(`[SYNC:${correlationId}] Event ${session.google_calendar_event_id} not in list, checking (${eventChecksCount}/${MAX_EVENT_CHECKS_PER_SYNC})...`);
        
        const checkResponse = await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${session.google_calendar_event_id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
          { correlationId, step: 'check_event' }
        );
        
        if (checkResponse.ok) {
          const eventData = await checkResponse.json();
          eventExists = eventData.status !== 'cancelled';
        } else {
          eventExists = false;
        }
      } else if (!googleEvent && fullSync) {
        // Skip check, assume doesn't exist
        console.log(`[SYNC:${correlationId}] Event ${session.google_calendar_event_id} not in list, recreating (check limit reached)`);
        eventExists = false;
      }

      // Incremental responses omit unchanged Google events. If Psycma changed
      // since the common baseline, fetch that single event so the outgoing
      // update can still use a fresh schedule and ETag.
      const currentSyncState = syncStateBySessionId.get(session.id);
      if (
        !googleEvent && eventExists && currentSyncState &&
        decideThreeWayScheduleSync(
          stateSchedule(currentSyncState),
          sessionSchedule(session),
          stateSchedule(currentSyncState),
        ) === 'push_psycma'
      ) {
        const response = await googleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${session.google_calendar_event_id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
          { correlationId, step: 'fetch_changed_psycma_event' },
        );
        if (response.ok) googleEvent = await response.json();
        else result.warnings?.push(`Could not verify Google event for changed Psycma session ${session.id}`);
      }
      
      if (!eventExists) {
        // Recreate event
        console.log(`[SYNC:${correlationId}] Recreating event for session ${session.id}`);
        const newEventId = await createGoogleCalendarEvent(
          accessToken, calendarId, session, session.patient, professional, correlationId,
          titleFormat, descriptionFormat, session.location, session.bono
        );

        if (newEventId) {
          await supabase.from('sessions').update({ google_calendar_event_id: newEventId }).eq('id', session.id);
          session.google_calendar_event_id = newEventId;
          await saveGoogleSyncState(supabase, session, null, sessionSchedule(session));
          result.created++;
        } else {
          result.errors.push(`Failed to recreate event for session ${session.id}`);
        }
      } else if (googleEvent) {
        await syncLinkedSessionSchedule({
          supabase,
          session,
          googleEvent,
          syncState: currentSyncState,
          integrations,
          accessToken,
          calendarId,
          professional,
          professionalId,
          correlationId,
          titleFormat,
          descriptionFormat,
          result,
        });
        continue;

        /* Legacy resolver retained temporarily below for deployment diff safety.
         * It is unreachable: the three-way resolver above is authoritative. */
        // ============================================================
        // CONFLICT RESOLUTION (two-way sync) — defensive logic
        // ============================================================
        // Aceptar cambios desde Google sin restricciones puede borrar
        // citas existentes (caso real: una cita movida en Google a otra
        // fecha sobrescribió la fila Psycma haciendo desaparecer la cita
        // original sin ningún rastro). Este bloque protege los datos
        // clínicos respetando la política configurada por el profesional.
        // ============================================================
        const conflictMode: 'psycma_wins' | 'safe_two_way' | 'google_wins_legacy' =
          (integrations?.google_calendar_conflict_mode as any) || 'psycma_wins';

        if (
          integrations?.google_calendar_sync_mode === 'two_way' &&
          googleEvent.start?.dateTime &&
          conflictMode !== 'psycma_wins'
        ) {
          const parsedStart = parseGoogleDateTimeToMadrid(googleEvent.start.dateTime);
          const parsedEnd = parseGoogleDateTimeToMadrid(googleEvent.end.dateTime);

          const hasDifferences = session.session_date !== parsedStart.date ||
              session.start_time !== parsedStart.time ||
              session.end_time !== parsedEnd.time;

          if (hasDifferences) {
            const psycmaUpdatedAt = session.updated_at ? new Date(session.updated_at).getTime() : 0;
            const googleUpdatedAt = googleEvent.updated ? new Date(googleEvent.updated).getTime() : 0;
            const bufferMs = 5000;

            console.log(`[SYNC:${correlationId}] Comparing session ${session.id}: Psycma=${psycmaUpdatedAt}, Google=${googleUpdatedAt}, diff=${Math.abs(psycmaUpdatedAt - googleUpdatedAt)}ms, mode=${conflictMode}`);

            if (googleUpdatedAt > psycmaUpdatedAt + bufferMs) {
              // Google is newer. Decide based on conflict mode and movement size.
              const dayChanged = session.session_date !== parsedStart.date;
              const timeDeltaMinutes = (() => {
                try {
                  const a = (session.start_time || '00:00').split(':').map(Number);
                  const b = (parsedStart.time || '00:00').split(':').map(Number);
                  return Math.abs((a[0] * 60 + a[1]) - (b[0] * 60 + b[1]));
                } catch { return 9999; }
              })();
              const isLargeMove = dayChanged || timeDeltaMinutes > 120;

              // SAFETY GUARD #1: large moves (cambio de día o > 2h) nunca se aplican automáticamente.
              // Esto evita que un cambio en Google "trague" otra cita existente o mueva una sesión
              // fuera de la ventana razonable sin intervención humana.
              if (isLargeMove && conflictMode === 'safe_two_way') {
                console.warn(`[SYNC:${correlationId}] BLOCKED large move from Google for session ${session.id}: ${session.session_date} ${session.start_time} → ${parsedStart.date} ${parsedStart.time} (dayChanged=${dayChanged}, deltaMin=${timeDeltaMinutes}). Restoring Google to match Psycma.`);

                // Restaurar el evento Google a los valores Psycma (Psycma manda en cambios grandes).
                try {
                  await updateGoogleCalendarEvent(
                    accessToken!, calendarId, session.google_calendar_event_id, session,
                    session.patient, professional, correlationId, titleFormat, descriptionFormat,
                    session.location, session.bono
                  );
                } catch (e) {
                  console.error(`[SYNC:${correlationId}] Failed to restore Google event:`, e);
                }

                // Registrar el conflicto en logs (la tabla notifications es solo para emails).
                console.warn(`[SYNC:${correlationId}] CONFLICT large_move_blocked`, {
                  session_id: session.id,
                  google_event_id: session.google_calendar_event_id,
                  original: { date: session.session_date, start: session.start_time, end: session.end_time },
                  attempted: { date: parsedStart.date, start: parsedStart.time, end: parsedEnd.time },
                });

                result.warnings?.push(`Blocked large move from Google for session ${session.id} (${session.session_date} ${session.start_time} → ${parsedStart.date} ${parsedStart.time})`);

                // Notify the professional (in-app + email + WhatsApp)
                await alertProfessionalSyncChange(supabase, {
                  professionalId,
                  centerId: professional?.center_id,
                  patientId: session.patient_id,
                  sessionId: session.id,
                  outcome: 'blocked_large_move',
                  oldDate: session.session_date,
                  oldTime: session.start_time,
                  newDate: parsedStart.date,
                  newTime: parsedStart.time,
                  correlationId,
                });
                continue;
              }

              // SAFETY GUARD #2: aunque el modo lo permita, comprobar solapamiento antes de aplicar.
              const { data: overlap } = await supabase
                .from('sessions')
                .select('id')
                .eq('professional_id', professionalId)
                .eq('session_date', parsedStart.date)
                .neq('status', 'cancelled')
                .neq('id', session.id)
                .lt('start_time', parsedEnd.time)
                .gt('end_time', parsedStart.time)
                .limit(1);

              const overlapList = overlap ?? [];
              if (overlapList.length > 0) {
                console.warn(`[SYNC:${correlationId}] BLOCKED Google→Psycma update for session ${session.id}: would overlap session ${overlapList[0]?.id}`);
                try {
                  await updateGoogleCalendarEvent(
                    accessToken!, calendarId, session.google_calendar_event_id, session,
                    session.patient, professional, correlationId, titleFormat, descriptionFormat,
                    session.location, session.bono
                  );
                } catch (e) {
                  console.error(`[SYNC:${correlationId}] Failed to restore Google event:`, e);
                }
                console.warn(`[SYNC:${correlationId}] CONFLICT overlap_blocked`, {
                  session_id: session.id,
                  google_event_id: session.google_calendar_event_id,
                  attempted: { date: parsedStart.date, start: parsedStart.time, end: parsedEnd.time },
                });
                result.warnings?.push(`Overlap blocked Google→Psycma for session ${session.id}`);

                // Notify the professional
                await alertProfessionalSyncChange(supabase, {
                  professionalId,
                  centerId: professional?.center_id,
                  patientId: session.patient_id,
                  sessionId: session.id,
                  outcome: 'blocked_overlap',
                  oldDate: session.session_date,
                  oldTime: session.start_time,
                  newDate: parsedStart.date,
                  newTime: parsedStart.time,
                  correlationId,
                });
                continue;
              }

              // Aplicar cambio pequeño aprobado.
              console.log(`[SYNC:${correlationId}] Applying small Google→Psycma change for session ${session.id}`);
              const oldDateBefore = session.session_date;
              const oldTimeBefore = session.start_time;
              const { error: updateError } = await supabase.from('sessions').update({
                session_date: parsedStart.date,
                start_time: parsedStart.time,
                end_time: parsedEnd.time,
              }).eq('id', session.id);

              if (updateError) {
                console.error(`[SYNC:${correlationId}] Error updating session ${session.id} from Google:`, updateError?.message);
                result.errors.push(`Google→Psycma update failed for session ${session.id}: ${updateError?.message}`);
              } else {
                result.updated++;
                // Notify the professional that Google moved their session
                await alertProfessionalSyncChange(supabase, {
                  professionalId,
                  centerId: professional?.center_id,
                  patientId: session.patient_id,
                  sessionId: session.id,
                  outcome: 'applied',
                  oldDate: oldDateBefore,
                  oldTime: oldTimeBefore,
                  newDate: parsedStart.date,
                  newTime: parsedStart.time,
                  correlationId,
                });
              }
              continue;
            } else {
              console.log(`[SYNC:${correlationId}] Psycma is newer or tie, updating Google`);
            }
          }
        } else if (
          integrations?.google_calendar_sync_mode === 'two_way' &&
          googleEvent.start?.dateTime &&
          conflictMode === 'psycma_wins'
        ) {
          // Modo seguro por defecto: Psycma siempre gana en fecha/hora.
          // Si Google difiere, lo restauramos a los valores de Psycma.
          const parsedStart = parseGoogleDateTimeToMadrid(googleEvent.start.dateTime);
          const parsedEnd = parseGoogleDateTimeToMadrid(googleEvent.end.dateTime);
          const hasDifferences = session.session_date !== parsedStart.date ||
              session.start_time !== parsedStart.time ||
              session.end_time !== parsedEnd.time;
          if (hasDifferences) {
            console.log(`[SYNC:${correlationId}] psycma_wins: restoring Google event ${session.google_calendar_event_id} to Psycma values`);
          }
          // Cae al updateGoogleCalendarEvent de abajo, que reescribe Google.
        }

        // Update event in Google
        const updated = await updateGoogleCalendarEvent(
          accessToken!, calendarId, session.google_calendar_event_id, session,
          session.patient, professional, correlationId, titleFormat, descriptionFormat,
          session.location, session.bono
        );

        if (updated) result.updated++;
      }
    }
  }

  // Handle cancelled sessions
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
      const deleted = await deleteGoogleCalendarEvent(accessToken, calendarId, session.google_calendar_event_id, correlationId);
      if (deleted) result.deleted++;
    }
  }

  // Update sync state
  const hasErrors = result.errors.length > 0;
  
  if (hasErrors) {
    const currentErrors = connection.consecutive_sync_errors || 0;
    const newErrorCount = currentErrors + 1;
    
    if (newErrorCount >= 3) {
      await supabase.from('oauth_connections').update({
        sync_token: null,
        consecutive_sync_errors: 0,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'sync_errors_reset',
      }).eq('professional_id', professionalId).eq('provider', 'google');
    } else {
      await supabase.from('oauth_connections').update({
        consecutive_sync_errors: newErrorCount,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'sync_with_errors',
      }).eq('professional_id', professionalId).eq('provider', 'google');
    }
  } else {
    await supabase.from('oauth_connections').update({
      sync_token: nextSyncToken ?? connection.sync_token,
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'ok',
      consecutive_sync_errors: 0,
    }).eq('professional_id', professionalId).eq('provider', 'google');
  }

  await supabase.from('professional_integrations').update({ last_google_sync_at: new Date().toISOString() }).eq('professional_id', professionalId);

  result.requestCount = requestCount;
  console.log(`[SYNC:${correlationId}] Complete:`, result);

  return result;
}

async function syncProfessionalWithLock(
  supabase: SupabaseClient,
  professionalId: string,
  dateFrom: string,
  dateTo: string,
  correlationId: string
): Promise<SyncResult> {
  const lockToken = crypto.randomUUID();
  const { data: lockAcquired, error: lockError } = await supabase.rpc(
    'try_acquire_google_sync_lock',
    {
      p_professional_id: professionalId,
      p_lock_token: lockToken,
      p_lease_seconds: 900,
    }
  );

  if (lockError) {
    throw new Error(`Could not acquire Google sync lock: ${lockError.message}`);
  }

  if (!lockAcquired) {
    console.log(`[SYNC:${correlationId}] Sync already running for ${professionalId}, skipping`);
    return {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      warnings: ['sync_already_running'],
      skipped: true,
      requestCount: 0,
    };
  }

  console.log(`[SYNC:${correlationId}] Lock acquired for ${professionalId}`);

  try {
    const firstPassStartedAt = new Date().toISOString();
    const combined = await syncProfessional(supabase, professionalId, dateFrom, dateTo, correlationId);

    // A webhook can arrive after the incremental read while this lock is held.
    // Consume that durable pending flag once before releasing the lock so the
    // final change cannot be stranded waiting for another webhook.
    const { data: pendingWebhook } = await supabase
      .from('google_sync_debounce')
      .select('last_webhook_at, pending')
      .eq('professional_id', professionalId)
      .eq('pending', true)
      .gt('last_webhook_at', firstPassStartedAt)
      .maybeSingle();

    if (pendingWebhook) {
      await supabase
        .from('google_sync_debounce')
        .update({ pending: false, updated_at: new Date().toISOString() })
        .eq('professional_id', professionalId)
        .eq('pending', true);

      console.log(`[SYNC:${correlationId}] Webhook arrived during sync; running one catch-up pass`);
      const catchUp = await syncProfessional(supabase, professionalId, dateFrom, dateTo, correlationId);
      combined.created += catchUp.created;
      combined.updated += catchUp.updated;
      combined.deleted += catchUp.deleted;
      combined.calendarEventsImported = (combined.calendarEventsImported || 0) + (catchUp.calendarEventsImported || 0);
      combined.errors.push(...catchUp.errors);
      combined.warnings?.push(...(catchUp.warnings || []));
    }

    return combined;
  } finally {
    const { error: releaseError } = await supabase.rpc(
      'release_google_sync_lock',
      {
        p_professional_id: professionalId,
        p_lock_token: lockToken,
      }
    );

    if (releaseError) {
      console.error(`[SYNC:${correlationId}] Error releasing lock:`, releaseError);
    } else {
      console.log(`[SYNC:${correlationId}] Lock released for ${professionalId}`);
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate correlation ID for tracing
  const correlationId = crypto.randomUUID().slice(0, 8);
  
  // Reset request counter for this invocation
  requestCount = 0;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    const body = await req.json();
    const { professional_id, date_from, date_to, sync_all_professionals, triggered_by } = body;

    const authorization = req.headers.get('Authorization') ?? '';
    const bearerToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : '';
    const isServiceRequest = Boolean(serviceRoleKey) && bearerToken === serviceRoleKey;

    if (!isServiceRequest) {
      if (!bearerToken) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);
      if (authError || !authData.user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!canRequestGoogleSync({
        isServiceRequest: false,
        authenticatedUserId: authData.user.id,
        professionalId: professional_id || null,
        syncAllProfessionals: Boolean(sync_all_professionals),
      })) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for this professional' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Use provided correlation_id if available (from webhook)
    const finalCorrelationId = body.correlation_id || correlationId;

    console.log(`[SYNC:${finalCorrelationId}] Started, triggered_by: ${triggered_by || 'direct'}`);

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

    let totalResult: SyncResult = {
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [],
      warnings: [],
      calendarEventsImported: 0,
      requestCount: 0,
    };

    if (sync_all_professionals) {
      console.log(`[SYNC:${finalCorrelationId}] Starting sync for all professionals`);

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

      console.log(`[SYNC:${finalCorrelationId}] Found ${toSync.length} professionals to sync`);

      for (const connection of toSync) {
        try {
          const result = await syncProfessionalWithLock(
            supabase,
            connection.professional_id,
            dateFrom,
            dateTo,
            finalCorrelationId
          );
          totalResult.created += result.created;
          totalResult.updated += result.updated;
          totalResult.deleted += result.deleted;
          totalResult.calendarEventsImported = (totalResult.calendarEventsImported || 0) + (result.calendarEventsImported || 0);
          totalResult.errors.push(...result.errors.map(e => `[${connection.professional_id}] ${e}`));
          totalResult.warnings?.push(...(result.warnings || []).map(e => `[${connection.professional_id}] ${e}`));
        } catch (err) {
          console.error(`[SYNC:${finalCorrelationId}] Error syncing ${connection.professional_id}:`, err);
          totalResult.errors.push(`[${connection.professional_id}] ${err}`);
        }
      }
    } else if (professional_id) {
      totalResult = await syncProfessionalWithLock(
        supabase,
        professional_id,
        dateFrom,
        dateTo,
        finalCorrelationId
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'professional_id or sync_all_professionals required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    totalResult.requestCount = requestCount;

    return new Response(
      JSON.stringify(totalResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[SYNC:${correlationId}] Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, requestCount }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
