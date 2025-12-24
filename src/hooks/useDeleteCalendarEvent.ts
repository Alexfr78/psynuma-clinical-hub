import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useDeleteCalendarEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (calendarEventId: string) => {
      const { error } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', calendarEventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast.success('Bloqueo eliminado de la agenda');
    },
    onError: (error) => {
      console.error('Error deleting calendar event:', error);
      toast.error('Error al eliminar el bloqueo');
    },
  });
}
