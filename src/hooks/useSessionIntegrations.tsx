import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SessionData {
  id?: string;
  professional_id: string;
  patient_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  session_modality?: string;
  video_provider?: string;
  session_type?: string;
}

interface PatientData {
  first_name: string;
  last_name: string;
  email?: string | null;
}

interface IntegrationResult {
  video_call_link?: string;
  video_provider?: string;
  google_calendar_event_id?: string;
}

export async function handleSessionIntegrations(
  session: SessionData,
  patient: PatientData,
  professionalIntegrations: any,
  oauthConnections: any[]
): Promise<IntegrationResult> {
  const result: IntegrationResult = {};
  const patientName = `${patient.first_name} ${patient.last_name}`;
  
  // Check if video modality
  const isVideoSession = session.session_modality === 'video' || 
                         session.video_provider === 'zoom' || 
                         session.video_provider === 'google_meet';

  // Get provider connections
  const googleConnection = oauthConnections?.find(c => c.provider === 'google');
  const zoomConnection = oauthConnections?.find(c => c.provider === 'zoom');

  // Determine video provider to use
  let videoProvider: 'zoom' | 'google_meet' | null = null;
  
  if (isVideoSession) {
    if (session.video_provider === 'zoom' || 
        (professionalIntegrations?.default_video_provider === 'zoom' && !session.video_provider)) {
      if (professionalIntegrations?.zoom_enabled && zoomConnection?.access_token) {
        videoProvider = 'zoom';
      }
    } else if (session.video_provider === 'google_meet' || 
               (professionalIntegrations?.default_video_provider === 'google_meet' && !session.video_provider)) {
      if (professionalIntegrations?.google_meet_enabled && googleConnection?.access_token) {
        videoProvider = 'google_meet';
      }
    }
  }

  // Create Zoom meeting if needed
  if (videoProvider === 'zoom') {
    try {
      console.log('Creating Zoom meeting...');
      const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
        body: {
          professional_id: session.professional_id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          topic: `Sesión de ${session.session_type || 'psicología'}`,
          patient_name: patientName,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      result.video_call_link = data.join_url;
      result.video_provider = 'zoom';
      console.log('Zoom meeting created:', data.meeting_id);
    } catch (err) {
      console.error('Error creating Zoom meeting:', err);
      toast.error('No se pudo crear la reunión de Zoom');
    }
  }

  // Create Google Calendar event (with or without Meet)
  if (professionalIntegrations?.google_calendar_enabled && googleConnection?.access_token) {
    const includeMeet = videoProvider === 'google_meet';
    
    try {
      console.log('Creating Google Calendar event...');
      const { data, error } = await supabase.functions.invoke('create-google-calendar-event', {
        body: {
          professional_id: session.professional_id,
          session_id: session.id,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          title: `Sesión con ${patientName}`,
          description: `Sesión de ${session.session_type || 'psicología'}`,
          patient_name: patientName,
          patient_email: patient.email,
          include_meet: includeMeet,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      result.google_calendar_event_id = data.event_id;
      
      if (includeMeet && data.meet_link) {
        result.video_call_link = data.meet_link;
        result.video_provider = 'google_meet';
      }
      
      console.log('Google Calendar event created:', data.event_id);
    } catch (err) {
      console.error('Error creating Google Calendar event:', err);
      toast.error('No se pudo sincronizar con Google Calendar');
    }
  }

  return result;
}

export async function handleSessionUpdate(
  sessionId: string,
  professionalId: string,
  googleEventId: string | null,
  updates: {
    session_date?: string;
    start_time?: string;
    end_time?: string;
    title?: string;
    status?: string;
  }
): Promise<void> {
  if (!googleEventId) return;

  try {
    await supabase.functions.invoke('update-google-calendar-event', {
      body: {
        professional_id: professionalId,
        event_id: googleEventId,
        ...updates,
      },
    });
    console.log('Google Calendar event updated');
  } catch (err) {
    console.error('Error updating Google Calendar event:', err);
  }
}

export async function handleSessionCancellation(
  professionalId: string,
  googleEventId: string | null,
  videoProvider: string | null,
  videoCallLink: string | null
): Promise<void> {
  // Cancel Google Calendar event
  if (googleEventId) {
    try {
      await supabase.functions.invoke('update-google-calendar-event', {
        body: {
          professional_id: professionalId,
          event_id: googleEventId,
          status: 'cancelled',
        },
      });
      console.log('Google Calendar event cancelled');
    } catch (err) {
      console.error('Error cancelling Google Calendar event:', err);
    }
  }

  // Delete Zoom meeting if applicable
  if (videoProvider === 'zoom' && videoCallLink) {
    // Extract meeting ID from URL
    const meetingIdMatch = videoCallLink.match(/\/j\/(\d+)/);
    if (meetingIdMatch) {
      try {
        await supabase.functions.invoke('delete-zoom-meeting', {
          body: {
            professional_id: professionalId,
            meeting_id: meetingIdMatch[1],
          },
        });
        console.log('Zoom meeting deleted');
      } catch (err) {
        console.error('Error deleting Zoom meeting:', err);
      }
    }
  }
}
