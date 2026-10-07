import { qk } from '@/lib/query-keys';
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
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      queryClient.invalidateQueries({ queryKey: qk.patient.all });
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
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      queryClient.invalidateQueries({ queryKey: qk.patient.all });
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
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      queryClient.invalidateQueries({ queryKey: qk.patient.all });
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
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      const processed = (data as { processed?: number })?.processed || 0;
      toast.success(`Estados recalculados para ${processed} contactos`);
    },
    onError: (error: Error) => {
      console.error('Error recomputing statuses:', error);
      toast.error('Error al recalcular estados');
    },
  });
}

/**
 * Bloquea o desbloquea las reservas online del paciente (reserva pública,
 * portal y /cita). No cancela sus citas existentes ni le cierra el portal.
 */
export function useSetPatientBookingBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ patientId, blocked, reason }: { patientId: string; blocked: boolean; reason?: string | null }) => {
      const { error } = await supabase
        .from('patients')
        .update({
          booking_blocked: blocked,
          booking_blocked_reason: blocked ? (reason?.trim() || null) : null,
          booking_blocked_at: blocked ? new Date().toISOString() : null,
        })
        .eq('id', patientId);

      if (error) throw error;
      return blocked;
    },
    onSuccess: (blocked) => {
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
      queryClient.invalidateQueries({ queryKey: qk.patient.all });
      toast.success(blocked ? 'Reservas online bloqueadas' : 'Reservas online desbloqueadas');
    },
    onError: (error: Error) => {
      console.error('Error updating booking block:', error);
      toast.error('No se pudo cambiar el bloqueo de reservas');
    },
  });
}
