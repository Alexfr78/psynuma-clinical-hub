import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PublicSessionData {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
  session_type: string | null;
  session_modality: string | null;
  video_call_link: string | null;
  cancellation_policy: string | null;
  notes: string | null;
  access_token: string | null;
  patient: {
    first_name: string;
    last_name: string;
  } | null;
  professional: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  location: {
    name: string;
    street: string;
    number_details: string | null;
    city: string;
    postal_code: string | null;
  } | null;
  center: {
    name: string;
    address: string | null;
    address_details: string | null;
    city: string | null;
    postal_code: string | null;
  } | null;
}

export function usePublicSession(token: string | undefined) {
  return useQuery({
    queryKey: ['public-session', token],
    queryFn: async () => {
      if (!token) throw new Error('No token provided');

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          status,
          session_type,
          session_modality,
          video_call_link,
          cancellation_policy,
          notes,
          access_token,
          patient:patients!sessions_patient_id_fkey(first_name, last_name),
          professional:profiles!sessions_professional_id_fkey(first_name, last_name),
          location:center_locations!sessions_location_id_fkey(name, street, number_details, city, postal_code),
          center:centers!sessions_center_id_fkey(name, address, address_details, city, postal_code)
        `)
        .eq('access_token', token)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Session not found');
      
      return data as PublicSessionData;
    },
    enabled: !!token,
    retry: false,
  });
}

export function useUpdatePublicSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      token, 
      status,
      cancellation_reason 
    }: { 
      token: string; 
      status: string;
      cancellation_reason?: string;
    }) => {
      const updateData: Record<string, string> = { status };
      if (cancellation_reason) {
        updateData.cancellation_reason = cancellation_reason;
      }

      const { data, error } = await supabase
        .from('sessions')
        .update(updateData)
        .eq('access_token', token)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['public-session', variables.token] });
      
      const messages: Record<string, string> = {
        confirmed: '¡Tu cita ha sido confirmada!',
        cancelled: 'Tu cita ha sido cancelada.',
        reschedule_requested: 'Solicitud de reprogramación enviada.',
      };
      
      toast.success(messages[variables.status] || 'Estado actualizado');
    },
    onError: (error) => {
      console.error('Error updating session:', error);
      toast.error('Error', {
        description: 'No se pudo actualizar la cita. Inténtalo de nuevo.',
      });
    },
  });
}

// Helper function to check if cancellation is allowed based on policy
export function canCancelSession(
  sessionDate: string, 
  startTime: string, 
  cancellationPolicy: string | null
): { allowed: boolean; reason?: string } {
  const sessionDateTime = new Date(`${sessionDate}T${startTime}`);
  const now = new Date();
  const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // If session has already passed
  if (hoursUntilSession < 0) {
    return { allowed: false, reason: 'La cita ya ha pasado.' };
  }

  // Policy hours mapping
  const policyHoursMap: Record<string, { hours: number; label: string }> = {
    'not_allowed': { hours: Infinity, label: 'No se permiten cancelaciones para esta cita.' },
    'until_start': { hours: 0, label: '' },
    '1_hour': { hours: 1, label: '1 hora' },
    '2_hours': { hours: 2, label: '2 horas' },
    '24_hours': { hours: 24, label: '24 horas' },
    '48_hours': { hours: 48, label: '48 horas' },
    '72_hours': { hours: 72, label: '72 horas' },
  };

  const policy = policyHoursMap[cancellationPolicy || '24_hours'] || policyHoursMap['24_hours'];

  if (policy.hours === Infinity) {
    return { allowed: false, reason: policy.label };
  }

  if (policy.hours === 0) {
    return { allowed: true };
  }

  if (hoursUntilSession < policy.hours) {
    return { 
      allowed: false, 
      reason: `Las cancelaciones deben realizarse con al menos ${policy.label} de antelación.`
    };
  }

  return { allowed: true };
}
