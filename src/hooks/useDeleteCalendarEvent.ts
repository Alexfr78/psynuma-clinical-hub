import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DeleteCalendarEventParams {
  calendarEventId: string;
  googleEventId: string;
  professionalId: string;
}

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteCalendarEventParams) => {
      const { calendarEventId, googleEventId, professionalId } = params;

      // 1. Delete the event from Google Calendar
      try {
        const { data, error: googleError } = await supabase.functions.invoke(
          'update-google-calendar-event',
          {
            body: {
              professional_id: professionalId,
              event_id: googleEventId,
              status: 'cancelled',
            },
          }
        );

        if (googleError) {
          console.error('Error deleting from Google Calendar:', googleError);
          // Continue with local deletion even if Google fails
        }

        if (data?.error === 'needs_reconnect') {
          console.warn('Google needs reconnect, deleting local only');
          toast.warning('No se pudo eliminar de Google Calendar. Reconecta tu cuenta.');
        }
      } catch (error) {
        console.error('Error calling Google Calendar API:', error);
        // Continue with local deletion
      }

      // 2. Delete the local record
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', calendarEventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Evento eliminado de la agenda y de Google Calendar');
    },
    onError: (error) => {
      console.error('Error deleting calendar event:', error);
      toast.error('Error al eliminar el evento');
    },
  });
}
