import { useProfessionalIntegrations } from './useProfessionalIntegrations';
import { handleSessionUpdate, handleSessionCancellation } from './useSessionIntegrations';
import { SessionWithRelations } from './useSessions';

interface SyncOptions {
  session_date?: string;
  start_time?: string;
  end_time?: string;
  title?: string;
  status?: string;
}

export function useGoogleCalendarUpdate() {
  const { integrations, isProviderConnected } = useProfessionalIntegrations();

  const isGoogleCalendarConnected = Boolean(
    integrations?.google_calendar_enabled && isProviderConnected('google')
  );

  // Sync session changes to Google Calendar
  const syncToGoogle = async (
    session: SessionWithRelations,
    updates: SyncOptions
  ) => {
    if (!isGoogleCalendarConnected) {
      console.log('Google Calendar not connected, skipping sync');
      return;
    }

    const sessionData = session as any;
    const googleEventId = sessionData.google_calendar_event_id;

    if (!googleEventId) {
      console.log('No Google Calendar event ID, skipping sync');
      return;
    }

    // If status is cancelled, delete the event
    if (updates.status === 'cancelled') {
      console.log('Session cancelled, cancelling Google Calendar event...');
      await handleSessionCancellation(
        session.professional_id,
        googleEventId,
        sessionData.video_provider,
        sessionData.video_call_link
      );
    } else {
      // Update the event with new details
      console.log('Updating Google Calendar event...');
      await handleSessionUpdate(
        session.id,
        session.professional_id,
        googleEventId,
        updates
      );
    }
  };

  // Sync a moved session (date/time changes)
  const syncMoveToGoogle = async (
    session: SessionWithRelations,
    newDate: string,
    newStartTime: string,
    newEndTime: string
  ) => {
    const patientName = session.patient 
      ? `${session.patient.first_name} ${session.patient.last_name}`
      : 'Paciente';

    await syncToGoogle(session, {
      session_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
      title: `Sesión con ${patientName}`,
    });
  };

  return {
    syncToGoogle,
    syncMoveToGoogle,
    isGoogleCalendarConnected,
  };
}
