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
    console.error('Google OAuth credentials not configured (neither center nor env vars)');
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
    
    // Detailed logging for debugging
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

      console.log('Token refreshed successfully, expires at:', expiresAt);
      return data.access_token;
    }

    // Handle specific error cases
    if (data.error === 'invalid_grant') {
      console.error('Refresh token has been revoked or expired - user needs to reconnect Google');
      // Mark the connection as invalid so user knows to reconnect
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

async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<any[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    console.error('Error fetching Google Calendar events:', error);
    return [];
  }

  const data = await response.json();
  return data.items || [];
}

function formatEventText(
  template: string,
  session: any,
  patient: any,
  professional: any
): string {
  const patientName = patient 
    ? `${patient.first_name || ''} ${patient.last_name || ''}`.trim() 
    : 'Paciente';
  const professionalName = professional 
    ? `${professional.first_name || ''} ${professional.last_name || ''}`.trim() 
    : 'Profesional';
  
  return template
    .replace(/{paciente}/g, patientName)
    .replace(/{profesional}/g, professionalName)
    .replace(/{tipo}/g, session.session_type || 'Sesión')
    .replace(/{hora}/g, session.start_time || '')
    .replace(/{fecha}/g, session.session_date || '')
    .replace(/{notas}/g, session.notes || '')
    .replace(/{telefono}/g, patient?.phone || '');
}

async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  session: any,
  patient: any,
  professional: any,
  titleFormat?: string,
  descriptionFormat?: string
): Promise<string | null> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const defaultTitle = '{tipo} - {paciente}';
  const defaultDescription = 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';
  
  const title = formatEventText(titleFormat || defaultTitle, session, patient, professional);
  const description = formatEventText(descriptionFormat || defaultDescription, session, patient, professional);

  const event = {
    summary: title,
    description: description,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Madrid',
    },
  };

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
    console.error('Error creating Google Calendar event:', error);
    return null;
  }

  const data = await response.json();
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
  descriptionFormat?: string
): Promise<boolean> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const defaultTitle = '{tipo} - {paciente}';
  const defaultDescription = 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}';
  
  const title = formatEventText(titleFormat || defaultTitle, session, patient, professional);
  const description = formatEventText(descriptionFormat || defaultDescription, session, patient, professional);

  const event = {
    summary: title,
    description: description,
    start: {
      dateTime: startDateTime,
      timeZone: 'Europe/Madrid',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Europe/Madrid',
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

  return response.ok;
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

// Parse Google Calendar datetime to Europe/Madrid timezone
function parseGoogleDateTimeToMadrid(dateTimeStr: string): { date: string; time: string } {
  const date = new Date(dateTimeStr);
  
  // Use Intl.DateTimeFormat to get correct time in Europe/Madrid
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

async function syncProfessional(
  supabase: any,
  professionalId: string,
  dateFrom: string,
  dateTo: string
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

  // Get OAuth connection
  const { data: connection, error: connError } = await supabase
    .from('oauth_connections')
    .select('*')
    .eq('professional_id', professionalId)
    .eq('provider', 'google')
    .single();

  if (connError || !connection) {
    result.errors.push('No hay conexión con Google configurada');
    return result;
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

  const accessToken = await getValidAccessToken(supabase, connection);
  if (!accessToken) {
    result.errors.push('Error de autenticación con Google. Reconecta tu cuenta.');
    return result;
  }

  const calendarId = connection.google_calendar_id || 'primary';

  // Get professional info
  const { data: professional } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', professionalId)
    .single();

  const professionalName = professional ? `${professional.first_name || ''} ${professional.last_name || ''}`.trim() : 'Profesional';

  // Get sessions to sync
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select(`
      *,
      patient:patients!sessions_patient_id_fkey(first_name, last_name)
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

    // Two-way sync preparation: fetch Google events first to detect changes
    const timeMin = `${dateFrom}T00:00:00Z`;
    const timeMax = `${dateTo}T23:59:59Z`;
    const googleEvents = await fetchGoogleCalendarEvents(accessToken, calendarId, timeMin, timeMax);
    
    // Build a map of Google event IDs to their data for change detection
    const googleEventMap = new Map<string, any>();
    for (const event of googleEvents) {
      if (event.id) {
        googleEventMap.set(event.id, event);
      }
    }

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
          descriptionFormat
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
        const googleEvent = googleEventMap.get(session.google_calendar_event_id);
        
        if (!googleEvent) {
          // Event was deleted from Google Calendar - recreate it
          console.log(`Event ${session.google_calendar_event_id} not found in Google, recreating...`);
          const newEventId = await createGoogleCalendarEvent(
            accessToken,
            calendarId,
            session,
            session.patient,
            professional,
            titleFormat,
            descriptionFormat
          );

          if (newEventId) {
            await supabase
              .from('sessions')
              .update({ google_calendar_event_id: newEventId })
              .eq('id', session.id);
            result.created++;
          } else {
            result.errors.push(`Failed to recreate event for session ${session.id}`);
          }
        } else {
          // Event exists - check if Google has newer changes (two-way sync)
          if (integrations?.google_calendar_sync_mode === 'two_way' && googleEvent.start?.dateTime) {
            // Parse using Europe/Madrid timezone to avoid timezone drift
            const parsedStart = parseGoogleDateTimeToMadrid(googleEvent.start.dateTime);
            const parsedEnd = parseGoogleDateTimeToMadrid(googleEvent.end.dateTime);
            const googleSessionDate = parsedStart.date;
            const googleStartTime = parsedStart.time;
            const googleEndTime = parsedEnd.time;

            console.log(`Comparing session ${session.id}: Psycma(${session.session_date} ${session.start_time}-${session.end_time}) vs Google(${googleSessionDate} ${googleStartTime}-${googleEndTime})`);

            // Check if Google event differs from Psycma session
            if (session.session_date !== googleSessionDate ||
                session.start_time !== googleStartTime ||
                session.end_time !== googleEndTime) {
              // Google has changes - update Psycma session
              console.log(`Session ${session.id} differs from Google event - updating Psycma`);
              await supabase
                .from('sessions')
                .update({
                  session_date: googleSessionDate,
                  start_time: googleStartTime,
                  end_time: googleEndTime,
                })
                .eq('id', session.id);
              result.updated++;
              continue; // Skip updating Google since we just synced from it
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
            descriptionFormat
          );

          if (updated) {
            result.updated++;
          }
        }
      }
    }

  // Handle cancelled sessions - delete from Google Calendar
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
        await supabase
          .from('sessions')
          .update({ google_calendar_event_id: null })
          .eq('id', session.id);
        result.deleted++;
      }
    }
  }

    // Two-way sync: Import events from Google Calendar as blocked slots
    if (integrations?.google_calendar_sync_mode === 'two_way') {
      // Get existing session event IDs to check for updates
      const existingEventIds = new Set(
        (sessions || [])
          .map((s: any) => s.google_calendar_event_id)
          .filter(Boolean)
      );
      
      // Get professional's center_id and a placeholder patient for blocked events
      const { data: profData } = await supabase
        .from('profiles')
        .select('center_id')
        .eq('id', professionalId)
        .single();

      // Get or create a placeholder patient for blocked events
      let placeholderPatientId: string | null = null;
      if (profData?.center_id) {
        const { data: existingPlaceholder } = await supabase
          .from('patients')
          .select('id')
          .eq('center_id', profData.center_id)
          .eq('first_name', '[Bloqueado]')
          .eq('last_name', 'Google Calendar')
          .maybeSingle();
        
        if (existingPlaceholder) {
          placeholderPatientId = existingPlaceholder.id;
        } else {
          const { data: newPlaceholder } = await supabase
            .from('patients')
            .insert({
              center_id: profData.center_id,
              first_name: '[Bloqueado]',
              last_name: 'Google Calendar',
              status: 'inactive',
            })
            .select('id')
            .single();
          placeholderPatientId = newPlaceholder?.id || null;
        }
      }

      // Check for imported sessions that need updates or were deleted from Google
      const { data: importedSessions } = await supabase
        .from('sessions')
        .select('id, google_calendar_event_id, session_date, start_time, end_time, notes, status')
        .eq('professional_id', professionalId)
        .eq('status', 'blocked')
        .not('google_calendar_event_id', 'is', null)
        .gte('session_date', dateFrom)
        .lte('session_date', dateTo);

      for (const session of importedSessions || []) {
        const googleEvent = googleEventMap.get(session.google_calendar_event_id);
        
        if (!googleEvent) {
          // Event was deleted from Google Calendar - cancel the session
          await supabase
            .from('sessions')
            .update({ status: 'cancelled' })
            .eq('id', session.id);
          result.deleted++;
          continue;
        }

        // Check if Google event was updated
        if (googleEvent.start?.dateTime) {
          // Parse using Europe/Madrid timezone
          const parsedStart = parseGoogleDateTimeToMadrid(googleEvent.start.dateTime);
          const parsedEnd = parseGoogleDateTimeToMadrid(googleEvent.end.dateTime);
          const googleSessionDate = parsedStart.date;
          const googleStartTime = parsedStart.time;
          const googleEndTime = parsedEnd.time;

          if (session.session_date !== googleSessionDate ||
              session.start_time !== googleStartTime ||
              session.end_time !== googleEndTime) {
            // Update Psycma session with Google changes
            await supabase
              .from('sessions')
              .update({
                session_date: googleSessionDate,
                start_time: googleStartTime,
                end_time: googleEndTime,
                notes: `[Google Calendar] ${googleEvent.summary || 'Evento externo'}\n${googleEvent.description || ''}`,
              })
              .eq('id', session.id);
            result.updated++;
          }
        }
      }

      // Import new events from Google Calendar
      for (const event of googleEvents) {
        // Skip events we created from Psycma
        if (existingEventIds.has(event.id)) continue;
        
        // Skip all-day events
        if (!event.start?.dateTime) continue;
      
      // Check if this event was already imported
      const { data: existingImport } = await supabase
        .from('sessions')
        .select('id')
        .eq('google_calendar_event_id', event.id)
        .maybeSingle();
      
      if (existingImport) continue;
      
      if (!placeholderPatientId) {
        console.error('Cannot import Google event: no placeholder patient available');
        continue;
      }
      
      // Parse event times using Europe/Madrid timezone
      const parsedStart = parseGoogleDateTimeToMadrid(event.start.dateTime);
      const parsedEnd = parseGoogleDateTimeToMadrid(event.end.dateTime);
      
      const sessionDate = parsedStart.date;
      const startTime = parsedStart.time;
      const endTime = parsedEnd.time;
      
      // Create a blocked session
      const { error: insertError } = await supabase
        .from('sessions')
        .insert({
          professional_id: professionalId,
          center_id: profData?.center_id,
          patient_id: placeholderPatientId,
          session_date: sessionDate,
          start_time: startTime,
          end_time: endTime,
          notes: `[Google Calendar] ${event.summary || 'Evento externo'}\n${event.description || ''}`,
          status: 'blocked',
          google_calendar_event_id: event.id,
          session_type: 'Bloqueado',
          price: 0,
        });

      if (!insertError) {
        result.created++;
      } else {
        console.error('Error importing event:', insertError);
      }
    }
  }

  // Update last sync time
  await supabase
    .from('professional_integrations')
    .update({ last_google_sync_at: new Date().toISOString() })
    .eq('professional_id', professionalId);

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

    // Calculate date range - use provided values or fetch from professional config
    let dateFrom = date_from;
    let dateTo = date_to;

    if (!dateFrom || !dateTo) {
      // Try to get configured sync days from professional_integrations
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

        console.log(`Using configured sync range: ${daysPast} days past, ${daysFuture} days future`);
      } else {
        // Default values for sync_all_professionals
        const now = new Date();
        const defaultDateFrom = new Date(now);
        defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
        const defaultDateTo = new Date(now);
        defaultDateTo.setDate(defaultDateTo.getDate() + 90);

        dateFrom = defaultDateFrom.toISOString().split('T')[0];
        dateTo = defaultDateTo.toISOString().split('T')[0];
      }
    }

    let totalResult: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] };

    if (sync_all_professionals) {
      // Sync all professionals with Google Calendar enabled
      const { data: allIntegrations } = await supabase
        .from('professional_integrations')
        .select('professional_id')
        .eq('google_calendar_enabled', true);

      for (const integration of allIntegrations || []) {
        const result = await syncProfessional(supabase, integration.professional_id, dateFrom, dateTo);
        totalResult.created += result.created;
        totalResult.updated += result.updated;
        totalResult.deleted += result.deleted;
        totalResult.errors.push(...result.errors);
      }
    } else if (professional_id) {
      totalResult = await syncProfessional(supabase, professional_id, dateFrom, dateTo);
    } else {
      return new Response(
        JSON.stringify({ error: 'professional_id or sync_all_professionals required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sync completed:', totalResult);

    return new Response(
      JSON.stringify(totalResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
