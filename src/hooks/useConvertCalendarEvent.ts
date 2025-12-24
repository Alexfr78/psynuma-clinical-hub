import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConvertCalendarEventParams {
  calendarEventId: string;
  patientId: string;
  sessionType: string;
  price: number;
  sessionModality?: string;
  locationId?: string | null;
  notes?: string | null;
  bonoId?: string | null;
  // For updating Google Calendar after conversion
  professionalId: string;
  googleEventId: string;
  patientName: string;
}

export function useConvertCalendarEvent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      calendarEventId,
      patientId,
      sessionType,
      price,
      sessionModality = 'in_person',
      locationId,
      notes,
      bonoId,
      professionalId,
      googleEventId,
      patientName,
    }: ConvertCalendarEventParams) => {
      // 1. Call the RPC to convert the calendar event to a session
      const { data: sessionId, error: rpcError } = await supabase.rpc(
        'convert_calendar_event_to_session',
        {
          p_calendar_event_id: calendarEventId,
          p_patient_id: patientId,
          p_session_type: sessionType,
          p_price: price,
          p_session_modality: sessionModality,
          p_location_id: locationId || null,
          p_notes: notes || null,
          p_bono_id: bonoId || null,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      // 2. Update the Google Calendar event with extendedProperties and new title
      try {
        const { error: updateError } = await supabase.functions.invoke(
          'update-google-calendar-event',
          {
            body: {
              professional_id: professionalId,
              event_id: googleEventId,
              title: `Sesión con ${patientName}`,
              psycma_session_id: sessionId,
            },
          }
        );

        if (updateError) {
          console.error('Error updating Google Calendar event:', updateError);
          // Don't throw - the session was created successfully
        }
      } catch (googleError) {
        console.error('Failed to update Google Calendar:', googleError);
        // Don't throw - the session was created successfully
      }

      return sessionId;
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      
      toast({
        title: 'Evento convertido',
        description: 'El bloqueo de Google Calendar se ha convertido en una consulta.',
      });
    },
    onError: (error: Error) => {
      console.error('Error converting calendar event:', error);
      toast({
        title: 'Error al convertir',
        description: error.message || 'No se pudo convertir el evento.',
        variant: 'destructive',
      });
    },
  });
}
