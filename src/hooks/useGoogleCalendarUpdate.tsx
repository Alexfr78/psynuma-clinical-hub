import { useProfessionalIntegrations } from './useProfessionalIntegrations';
import { SessionWithRelations } from './useSessions';
import { supabase } from '@/integrations/supabase/client';

interface SyncOptions {
  session_date?: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  status?: string;
}

export interface SyncResult {
  success: boolean;
  newEventId?: string;
  recreated?: boolean;
  created?: boolean;
  error?: string;
}

export function useGoogleCalendarUpdate(overrideProfessionalId?: string) {
  const { integrations, isProviderConnected } = useProfessionalIntegrations(overrideProfessionalId);

  const isGoogleCalendarConnected = Boolean(
    integrations?.google_calendar_enabled && isProviderConnected('google')
  );

  // Create a new Google Calendar event for a session that doesn't have one
  const createGoogleEventForSession = async (
    session: SessionWithRelations,
    updates: SyncOptions
  ): Promise<SyncResult> => {
    const sessionDate = updates.session_date || session.session_date;
    const startTime = updates.start_time || session.start_time;
    const endTime = updates.end_time || session.end_time;
    
    console.log(`[SYNC] Creating Google event for session ${session.id} with patient_id: ${session.patient_id}`);

    const { data, error } = await supabase.functions.invoke('create-google-calendar-event', {
      body: {
        professional_id: session.professional_id,
        session_id: session.id,
        session_date: sessionDate,
        start_time: startTime,
        end_time: endTime,
        patient_id: session.patient_id, // Pass patient_id for format templates
        patient_email: session.patient?.email,
        include_meet: false,
      },
    });

    if (error || data?.error) {
      console.error('[SYNC] Error creating Google event:', error || data?.error);
      return { success: false, error: error?.message || data?.error };
    }

    // Save the new event_id in the session
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ google_calendar_event_id: data.event_id })
      .eq('id', session.id);

    if (updateError) {
      console.error('[SYNC] Error saving event_id to session:', updateError);
    } else {
      console.log(`[SYNC] Saved google_calendar_event_id ${data.event_id} to session ${session.id}`);
    }

    return { success: true, newEventId: data.event_id, created: true };
  };

  // Sync session changes to Google Calendar
  const syncToGoogle = async (
    session: SessionWithRelations,
    updates: SyncOptions
  ): Promise<SyncResult> => {
    if (!isGoogleCalendarConnected) {
      console.log('[SYNC] Google Calendar not connected, skipping sync');
      return { success: true }; // Not an error, just skipped
    }

    const sessionData = session as any;
    const googleEventId = sessionData.google_calendar_event_id;

    // If status is cancelled and we have an event_id, delete the event
    if (updates.status === 'cancelled') {
      if (googleEventId) {
        console.log(`[SYNC] Session cancelled, deleting Google Calendar event ${googleEventId}`);
        const { data, error } = await supabase.functions.invoke('update-google-calendar-event', {
          body: {
            professional_id: session.professional_id,
            event_id: googleEventId,
            status: 'cancelled',
          },
        });

        if (error || data?.success === false) {
          const msg = (data?.message || data?.error || error?.message) as string | undefined;
          console.error('[SYNC] Error deleting Google event:', error || data);
          return { success: false, error: msg || 'No se pudo actualizar Google Calendar' };
        }
      }
      return { success: true };
    }

    // If NO google_event_id exists, create a new event (auto-migration for old sessions)
    if (!googleEventId) {
      console.log(`[SYNC] No google_calendar_event_id for session ${session.id}, creating new event`);
      return await createGoogleEventForSession(session, updates);
    }

    // Update the existing event
    const patientName = session.patient 
      ? `${session.patient.first_name} ${session.patient.last_name}`
      : 'Paciente';

    console.log(`[SYNC] Updating Google Calendar event ${googleEventId} for session ${session.id}`);

    const { data, error } = await supabase.functions.invoke('update-google-calendar-event', {
      body: {
        professional_id: session.professional_id,
        event_id: googleEventId,
        psycma_session_id: session.id,
        session_date: updates.session_date || session.session_date,
        start_time: updates.start_time || session.start_time,
        end_time: updates.end_time || session.end_time,
        title: updates.title || `Sesión con ${patientName}`,
        create_if_not_exists: false, // We have an event_id, so expect it to exist
      },
    });

    if (error || data?.success === false) {
      const msg = (data?.message || data?.error || error?.message) as string | undefined;
      console.error('[SYNC] Error updating Google event:', error || data);
      return { success: false, error: msg || 'No se pudo actualizar Google Calendar' };
    }

    // If the event was recreated (404/410), save the new event_id
    if (data?.recreated && data?.event_id) {
      console.log(`[SYNC] Event was recreated. New event_id: ${data.event_id}`);
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ google_calendar_event_id: data.event_id })
        .eq('id', session.id);

      if (updateError) {
        console.error('[SYNC] Error saving recreated event_id to session:', updateError);
      } else {
        console.log(`[SYNC] Saved new google_calendar_event_id ${data.event_id} to session ${session.id}`);
      }

      return { success: true, newEventId: data.event_id, recreated: true };
    }

    // If event was created (shouldn't happen here since we have event_id, but handle it)
    if (data?.created && data?.event_id) {
      console.log(`[SYNC] Event was created. event_id: ${data.event_id}`);
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ google_calendar_event_id: data.event_id })
        .eq('id', session.id);

      if (updateError) {
        console.error('[SYNC] Error saving created event_id to session:', updateError);
      }

      return { success: true, newEventId: data.event_id, created: true };
    }

    return { success: true };
  };

  // Sync a moved session (date/time changes)
  const syncMoveToGoogle = async (
    session: SessionWithRelations,
    newDate: string,
    newStartTime: string,
    newEndTime: string
  ): Promise<SyncResult> => {
    return syncToGoogle(session, {
      session_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
    });
  };

  return {
    syncToGoogle,
    syncMoveToGoogle,
    createGoogleEventForSession,
    isGoogleCalendarConnected,
  };
}
