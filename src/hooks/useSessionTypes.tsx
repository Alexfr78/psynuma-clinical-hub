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
  is_public: boolean | null;
  display_order: number | null;
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
  display_order?: number;
  is_public?: boolean;
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
  is_public?: boolean;
  display_order?: number;
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
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

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
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

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

      // Use the atomic RPC to create with proper display_order
      const { data, error } = await supabase
        .rpc('create_session_type_with_order', {
          p_center_id: profile.center_id,
          p_name: sessionType.name,
          p_default_price: sessionType.default_price,
          p_duration_minutes: sessionType.duration_minutes,
          p_color: sessionType.color,
          p_commission_rate: sessionType.commission_rate ?? null,
          p_tax_treatment: sessionType.tax_treatment ?? null,
          p_vat_rate: sessionType.vat_rate ?? null,
          p_exemption_code: sessionType.exemption_code ?? null,
          p_non_subject_code: sessionType.non_subject_code ?? null,
          p_vat_regime_key: sessionType.vat_regime_key ?? null,
          p_is_public: sessionType.is_public ?? true,
        });

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

export function useReorderSessionTypes() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!profile?.center_id) throw new Error('No center found');

      const { data, error } = await supabase
        .rpc('reorder_session_types', {
          p_center_id: profile.center_id,
          p_ordered_ids: orderedIds,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-types'] });
      queryClient.invalidateQueries({ queryKey: ['session-types-all'] });
    },
    onError: (error) => {
      toast.error('Error al reordenar tipos de sesión');
      console.error('Error reordering session types:', error);
    },
  });
}
