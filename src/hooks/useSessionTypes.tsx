import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type { TaxTreatment, ExemptionCode, NonSubjectCode } from '@/lib/verifactu-validation';

export interface SessionType {
  id: string;
  center_id: string;
  name: string;
  default_price: number;
  commission_rate: number | null;
  duration_minutes: number;
  color: string;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  // Fiscal fields
  tax_treatment: TaxTreatment | null;
  vat_rate: number | null;
  exemption_code: ExemptionCode | null;
  non_subject_code: NonSubjectCode | null;
  vat_regime_key: string | null;
}

export interface SessionTypeInsert {
  name: string;
  default_price: number;
  commission_rate?: number;
  duration_minutes: number;
  color: string;
  // Fiscal fields
  tax_treatment?: TaxTreatment;
  vat_rate?: number;
  exemption_code?: ExemptionCode | null;
  non_subject_code?: NonSubjectCode | null;
  vat_regime_key?: string;
}

export interface SessionTypeUpdate {
  id: string;
  name?: string;
  default_price?: number;
  commission_rate?: number;
  duration_minutes?: number;
  color?: string;
  is_active?: boolean;
  // Fiscal fields
  tax_treatment?: TaxTreatment;
  vat_rate?: number;
  exemption_code?: ExemptionCode | null;
  non_subject_code?: NonSubjectCode | null;
  vat_regime_key?: string;
}

export function useSessionTypes() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['session-types', centerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_types')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as SessionType[];
    },
    enabled: !!centerId,
  });
}

export function useAllSessionTypes() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['session-types-all', centerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_types')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as SessionType[];
    },
    enabled: !!centerId,
  });
}

export function useCreateSessionType() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (sessionType: SessionTypeInsert) => {
      if (!profile?.center_id) throw new Error('No center found');

      const { data, error } = await supabase
        .from('session_types')
        .insert({
          ...sessionType,
          center_id: profile.center_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-types'] });
      queryClient.invalidateQueries({ queryKey: ['session-types-all'] });
      toast.success('Tipo de sesión creado');
    },
    onError: (error) => {
      toast.error('Error al crear tipo de sesión');
      console.error('Error creating session type:', error);
    },
  });
}

export function useUpdateSessionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: SessionTypeUpdate) => {
      const { data, error } = await supabase
        .from('session_types')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-types'] });
      queryClient.invalidateQueries({ queryKey: ['session-types-all'] });
      toast.success('Tipo de sesión actualizado');
    },
    onError: (error) => {
      toast.error('Error al actualizar tipo de sesión');
      console.error('Error updating session type:', error);
    },
  });
}

export function useDeleteSessionType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('session_types')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-types'] });
      queryClient.invalidateQueries({ queryKey: ['session-types-all'] });
      toast.success('Tipo de sesión eliminado');
    },
    onError: (error) => {
      toast.error('Error al eliminar tipo de sesión');
      console.error('Error deleting session type:', error);
    },
  });
}
