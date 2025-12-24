import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useHideCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (calendarEventId: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .update({ deleted: true, updated_at: new Date().toISOString() })
        .eq('id', calendarEventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Bloqueo ocultado de la agenda');
    },
    onError: (error) => {
      console.error('Error hiding calendar event:', error);
      toast.error('Error al ocultar el bloqueo');
    },
  });
}
