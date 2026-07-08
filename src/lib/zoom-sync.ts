import { supabase } from '@/integrations/supabase/client';

interface ZoomSession {
  professional_id: string;
  zoom_meeting_id?: string | null;
}

export async function syncZoomMeetingDateTime(
  session: ZoomSession,
  sessionDate: string,
  startTime: string,
  endTime: string,
): Promise<void> {
  if (!session.zoom_meeting_id) return;

  const { data, error } = await supabase.functions.invoke('update-zoom-meeting', {
    body: {
      professional_id: session.professional_id,
      meeting_id: session.zoom_meeting_id,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
    },
  });

  if (error || data?.success === false) {
    throw new Error(data?.error || error?.message || 'No se pudo actualizar Zoom');
  }
}
