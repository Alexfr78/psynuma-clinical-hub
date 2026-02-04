import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useSetPatientDischarged() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientId: string) => {
      const { data, error } = await supabase
        .rpc('set_patient_discharged', { p_patient_id: patientId });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      toast.success('Contacto marcado como Alta');
    },
    onError: (error: Error) => {
      console.error('Error setting patient discharged:', error);
      toast.error('Error al marcar como Alta');
    },
  });
}

export function useRemovePatientDischarged() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientId: string) => {
      const { data, error } = await supabase
        .rpc('remove_patient_discharged', { p_patient_id: patientId });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
      const newStatus = (data as { status?: string })?.status;
      toast.success(`Estado actualizado a ${newStatus === 'active' ? 'Activo' : 'Inactivo'}`);
    },
    onError: (error: Error) => {
      console.error('Error removing patient discharged:', error);
      toast.error('Error al quitar Alta');
    },
  });
}

export function useRecomputePatientStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patientId: string) => {
      const { data, error } = await supabase
        .rpc('compute_patient_status', { p_patient_id: patientId });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient'] });
    },
  });
}

export function useRecomputeAllPatientStatuses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (centerId?: string) => {
      const { data, error } = await supabase
        .rpc('recompute_all_patient_statuses', { p_center_id: centerId || null });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      const processed = (data as { processed?: number })?.processed || 0;
      toast.success(`Estados recalculados para ${processed} contactos`);
    },
    onError: (error: Error) => {
      console.error('Error recomputing statuses:', error);
      toast.error('Error al recalcular estados');
    },
  });
}
