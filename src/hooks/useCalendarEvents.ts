import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CalendarEvent {
  id: string;
  professional_id: string;
  provider: 'google';
  calendar_id: string;
  google_event_id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  deleted: boolean;
  status: string | null;
  // Conversion tracking fields
  is_converted?: boolean;
  converted_session_id?: string | null;
  converted_at?: string | null;
}

interface UseCalendarEventsParams {
  professionalId: string | null | undefined;
  rangeStart: string; // YYYY-MM-DD
  rangeEnd: string;   // YYYY-MM-DD
  enabled?: boolean;
}

export function useCalendarEvents({ 
  professionalId, 
  rangeStart, 
  rangeEnd, 
  enabled = true 
}: UseCalendarEventsParams) {
  const fromIso = `${rangeStart}T00:00:00.000Z`;
  const toIso = `${rangeEnd}T23:59:59.999Z`;

  return useQuery({
    queryKey: ['calendar-events', professionalId, rangeStart, rangeEnd],
    queryFn: async () => {
      if (!professionalId || professionalId === 'all') {
        // If 'all' professionals, fetch for current user's professional ID
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        
        const { data, error } = await supabase
          .from('calendar_events')
          .select('id, professional_id, provider, calendar_id, google_event_id, summary, description, location, start_at, end_at, all_day, deleted, status, is_converted, converted_session_id, converted_at')
          .eq('provider', 'google')
          .eq('deleted', false)
          .eq('is_converted', false)
          .lt('start_at', toIso)
          .gt('end_at', fromIso)
          .order('start_at', { ascending: true });

        if (error) throw error;
        return (data ?? []) as CalendarEvent[];
      }

      // Specific professional
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, professional_id, provider, calendar_id, google_event_id, summary, description, location, start_at, end_at, all_day, deleted, status, is_converted, converted_session_id, converted_at')
        .eq('professional_id', professionalId)
        .eq('provider', 'google')
        .eq('deleted', false)
        .eq('is_converted', false)
        .lt('start_at', toIso)
        .gt('end_at', fromIso)
        .order('start_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as CalendarEvent[];
    },
    enabled: enabled && !!rangeStart && !!rangeEnd,
    staleTime: 1000 * 60, // 1 minute
  });
}

// Helper to convert CalendarEvent to a session-like format for display
export function calendarEventToSessionFormat(event: CalendarEvent): {
  id: string;
  google_calendar_event_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_type: string;
  status: string;
  notes: string;
  price: number;
  isGoogleEvent: true;
  all_day: boolean;
  professional_id: string;
  patient: null;
} {
  const startDate = event.start_at ? new Date(event.start_at) : new Date();
  const endDate = event.end_at ? new Date(event.end_at) : new Date();

  // Format date as YYYY-MM-DD in Europe/Madrid timezone
  const formatDateMadrid = (d: Date) => {
    return new Intl.DateTimeFormat('sv-SE', { 
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d);
  };

  // Format time as HH:mm in Europe/Madrid timezone
  const formatTimeMadrid = (d: Date) => {
    return new Intl.DateTimeFormat('es-ES', { 
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  };

  return {
    id: event.id,
    google_calendar_event_id: event.google_event_id,
    session_date: formatDateMadrid(startDate),
    start_time: event.all_day ? '00:00' : formatTimeMadrid(startDate),
    end_time: event.all_day ? '23:59' : formatTimeMadrid(endDate),
    session_type: 'Google Calendar',
    status: 'google_event',
    notes: `${event.summary || 'Evento externo'}${event.description ? '\n' + event.description : ''}`,
    price: 0,
    isGoogleEvent: true,
    all_day: event.all_day,
    professional_id: event.professional_id,
    patient: null,
  };
}
