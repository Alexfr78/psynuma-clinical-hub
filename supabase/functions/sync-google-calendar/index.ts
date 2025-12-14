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

async function refreshGoogleToken(
  supabase: any,
  professionalId: string,
  refreshToken: string
): Promise<string | null> {
  const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');

  if (!googleClientId || !googleClientSecret) {
    console.error('Google OAuth credentials not configured');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
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

async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  session: any,
  patientName: string,
  professionalName: string
): Promise<string | null> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const event = {
    summary: `${session.session_type || 'Sesión'} - ${patientName}`,
    description: `Profesional: ${professionalName}\nTipo: ${session.session_type || 'N/A'}\nNotas: ${session.notes || ''}`,
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
  patientName: string,
  professionalName: string
): Promise<boolean> {
  const startDateTime = `${session.session_date}T${session.start_time}`;
  const endDateTime = `${session.session_date}T${session.end_time}`;

  const event = {
    summary: `${session.session_type || 'Sesión'} - ${patientName}`,
    description: `Profesional: ${professionalName}\nTipo: ${session.session_type || 'N/A'}\nNotas: ${session.notes || ''}`,
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
    result.errors.push('No Google connection found');
    return result;
  }

  // Get integrations settings
  const { data: integrations } = await supabase
    .from('professional_integrations')
    .select('*')
    .eq('professional_id', professionalId)
    .single();

  if (!integrations?.google_calendar_enabled) {
    result.errors.push('Google Calendar not enabled');
    return result;
  }

  const accessToken = await getValidAccessToken(supabase, connection);
  if (!accessToken) {
    result.errors.push('Could not get valid access token');
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

  // Sync Psycma sessions to Google Calendar
  for (const session of sessions || []) {
    const patientName = session.patient 
      ? `${session.patient.first_name} ${session.patient.last_name}`
      : 'Paciente';

    if (!session.google_calendar_event_id) {
      // Create new event in Google Calendar
      const eventId = await createGoogleCalendarEvent(
        accessToken,
        calendarId,
        session,
        patientName,
        professionalName
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
      // Update existing event
      const updated = await updateGoogleCalendarEvent(
        accessToken,
        calendarId,
        session.google_calendar_event_id,
        session,
        patientName,
        professionalName
      );

      if (updated) {
        result.updated++;
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

    // Calculate default date range (30 days back, 90 days forward)
    const now = new Date();
    const defaultDateFrom = new Date(now);
    defaultDateFrom.setDate(defaultDateFrom.getDate() - 30);
    const defaultDateTo = new Date(now);
    defaultDateTo.setDate(defaultDateTo.getDate() + 90);

    const dateFrom = date_from || defaultDateFrom.toISOString().split('T')[0];
    const dateTo = date_to || defaultDateTo.toISOString().split('T')[0];

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
