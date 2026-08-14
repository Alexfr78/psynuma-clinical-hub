import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScheduleException } from '@/lib/schedule-exceptions';

export function useScheduleExceptions(centerId?: string, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['schedule-exceptions', centerId, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from('schedule_exceptions')
        .select('*')
        .order('start_date', { ascending: true });

      if (centerId) query = query.eq('center_id', centerId);
      if (startDate) query = query.lte('start_date', endDate || startDate);
      if (endDate) query = query.gte('end_date', startDate || endDate);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ScheduleException[];
    },
    enabled: !!centerId,
  });
}

export function useCreateScheduleException() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (exception: Omit<ScheduleException, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .insert(exception)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-exceptions'] });
      toast({ title: 'Bloqueo creado', description: 'El bloqueo de disponibilidad se ha creado correctamente.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo crear el bloqueo.', variant: 'destructive' });
    },
  });
}

export function useUpdateScheduleException() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScheduleException> & { id: string }) => {
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-exceptions'] });
      toast({ title: 'Bloqueo actualizado' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo actualizar el bloqueo.', variant: 'destructive' });
    },
  });
}

export function useDeleteScheduleException() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_exceptions')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-exceptions'] });
      toast({ title: 'Bloqueo eliminado' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo eliminar el bloqueo.', variant: 'destructive' });
    },
  });
}

/**
 * Fetch sessions that overlap with a given date range (for conflict detection when creating exceptions).
 */
export function useConflictingSessions(
  centerId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  professionalId?: string | null,
  enabled = false
) {
  return useQuery({
    queryKey: ['conflicting-sessions', centerId, startDate, endDate, professionalId],
    queryFn: async () => {
      let query = supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, status, patient:patients!sessions_patient_id_fkey(first_name, last_name)')
        .eq('center_id', centerId!)
        .gte('session_date', startDate!)
        .lte('session_date', endDate!)
        .not('status', 'in', '("cancelled","no_show")');

      if (professionalId) {
        query = query.eq('professional_id', professionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!centerId && !!startDate && !!endDate,
  });
}
