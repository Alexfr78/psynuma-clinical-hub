import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CustomPriceTargetType = 'session_type' | 'bono_template';

export interface CustomPrice {
  id: string;
  center_id: string;
  patient_id: string;
  target_type: CustomPriceTargetType;
  target_id: string;
  custom_price: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CustomPriceWithTarget extends CustomPrice {
  target_name?: string;
  base_price?: number;
}

export interface CustomPriceHistory {
  id: string;
  patient_custom_price_id: string;
  patient_id: string;
  center_id: string;
  target_type: CustomPriceTargetType;
  target_id: string;
  old_price: number | null;
  new_price: number;
  old_start_date: string | null;
  new_start_date: string;
  old_end_date: string | null;
  new_end_date: string | null;
  change_type: 'created' | 'updated' | 'deactivated' | 'expired';
  changed_by: string;
  changed_at: string;
}

export interface CreateCustomPriceInput {
  patient_id: string;
  target_type: CustomPriceTargetType;
  target_id: string;
  custom_price: number;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

export interface UpdateCustomPriceInput {
  id: string;
  custom_price: number;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
  target_type?: CustomPriceTargetType;
  target_id?: string;
}

// ── Resolved Price ─────────────────────────────────────────────────────────────

export interface ResolvedPrice {
  base_price: number;
  applied_price: number;
  /** 'base' | 'tariff_plan' | 'custom' */
  pricing_source: 'base' | 'tariff_plan' | 'custom';
  tariff_plan_id: string | null;
  tariff_plan_name: string | null;
  tariff_plan_assignment_id: string | null;
  custom_price_id: string | null;
  is_temporary: boolean;
  valid_from: string | null;
  valid_to: string | null;
  note: string | null;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Lista todas las tarifas personalizadas de un paciente, incluyendo nombre del servicio/bono */
export function usePatientCustomPrices(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-custom-prices', patientId],
    queryFn: async (): Promise<CustomPriceWithTarget[]> => {
      if (!patientId) return [];

      const { data, error } = await supabase
        .from('patient_custom_prices')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const prices = (data || []) as CustomPrice[];
      if (prices.length === 0) return [];

      // Enriquecer con nombre y precio base
      const sessionTypeIds = prices
        .filter(p => p.target_type === 'session_type')
        .map(p => p.target_id);
      const bonoTemplateIds = prices
        .filter(p => p.target_type === 'bono_template')
        .map(p => p.target_id);

      const [sessionTypesRes, bonoTemplatesRes] = await Promise.all([
        sessionTypeIds.length > 0
          ? supabase.from('session_types').select('id, name, default_price').in('id', sessionTypeIds)
          : { data: [], error: null },
        bonoTemplateIds.length > 0
          ? supabase.from('bono_templates').select('id, name, total_price').in('id', bonoTemplateIds)
          : { data: [], error: null },
      ]);

      const sessionTypeMap = new Map(
        (sessionTypesRes.data || []).map((st: { id: string; name: string; default_price: number }) => [
          st.id,
          { name: st.name, base_price: st.default_price },
        ])
      );
      const bonoTemplateMap = new Map(
        (bonoTemplatesRes.data || []).map((bt: { id: string; name: string; total_price: number }) => [
          bt.id,
          { name: bt.name, base_price: bt.total_price },
        ])
      );

      return prices.map(p => {
        const meta =
          p.target_type === 'session_type'
            ? sessionTypeMap.get(p.target_id)
            : bonoTemplateMap.get(p.target_id);
        return {
          ...p,
          target_name: meta?.name,
          base_price: meta?.base_price,
        };
      });
    },
    enabled: !!patientId,
  });
}

/** Historial de cambios de una tarifa personalizada concreta */
export function useCustomPriceHistory(customPriceId: string | undefined) {
  return useQuery({
    queryKey: ['custom-price-history', customPriceId],
    queryFn: async (): Promise<CustomPriceHistory[]> => {
      if (!customPriceId) return [];
      const { data, error } = await supabase
        .from('patient_custom_price_history')
        .select('*')
        .eq('patient_custom_price_id', customPriceId)
        .order('changed_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CustomPriceHistory[];
    },
    enabled: !!customPriceId,
  });
}

/** Resuelve el precio aplicable para un paciente + servicio/bono en una fecha */
export function useResolvedPrice(
  patientId: string | undefined,
  targetType: CustomPriceTargetType | undefined,
  targetId: string | undefined,
  referenceDate?: string
) {
  return useQuery({
    queryKey: ['resolved-price', patientId, targetType, targetId, referenceDate],
    queryFn: async (): Promise<ResolvedPrice | null> => {
      if (!patientId || !targetType || !targetId) return null;
      const { data, error } = await supabase.rpc('resolve_effective_price', {
        p_patient_id: patientId,
        p_target_type: targetType,
        p_target_id: targetId,
        p_reference_date: referenceDate || new Date().toISOString().split('T')[0],
      });
      if (error) throw error;
      return data as unknown as ResolvedPrice;
    },
    enabled: !!patientId && !!targetType && !!targetId,
  });
}

/** Crea una nueva tarifa personalizada */
export function useCreateCustomPrice() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCustomPriceInput) => {
      if (!profile?.center_id || !profile?.id) {
        throw new Error('No hay sesión activa');
      }
      const { data, error } = await supabase
        .from('patient_custom_prices')
        .insert({
          center_id: profile.center_id,
          patient_id: input.patient_id,
          target_type: input.target_type,
          target_id: input.target_id,
          custom_price: input.custom_price,
          start_date: input.start_date,
          end_date: input.end_date || null,
          notes: input.notes || null,
          created_by: profile.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['patient-custom-prices', variables.patient_id] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
      toast.success('Tarifa personalizada creada');
    },
    onError: (error: Error) => {
      const msg = error.message.includes('solape') || error.message.includes('overlap')
        ? 'Ya existe una tarifa activa para ese servicio/bono en ese rango de fechas.'
        : error.message;
      toast.error(msg);
    },
  });
}

/** Actualiza una tarifa personalizada existente */
export function useUpdateCustomPrice() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateCustomPriceInput) => {
      if (!profile?.id) throw new Error('No hay sesión activa');
      // Pasar created_by al updated para que el trigger de historial lo use
      const updatePayload: Record<string, unknown> = {
        custom_price: input.custom_price,
        start_date: input.start_date,
        end_date: input.end_date || null,
        notes: input.notes || null,
        created_by: profile.id,
      };
      if (input.target_type) updatePayload.target_type = input.target_type;
      if (input.target_id) updatePayload.target_id = input.target_id;

      const { data, error } = await supabase
        .from('patient_custom_prices')
        .update(updatePayload)
        .eq('id', input.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient-custom-prices', data.patient_id] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
      toast.success('Tarifa personalizada actualizada');
    },
    onError: (error: Error) => {
      const msg = error.message.includes('solape') || error.message.includes('overlap')
        ? 'Ya existe una tarifa activa para ese servicio/bono en ese rango de fechas.'
        : error.message;
      toast.error(msg);
    },
  });
}

/** Desactiva (soft-delete) una tarifa personalizada */
export function useDeactivateCustomPrice() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patientId }: { id: string; patientId: string }) => {
      if (!profile?.id) throw new Error('No hay sesión activa');
      const { data, error } = await supabase
        .from('patient_custom_prices')
        .update({ is_active: false, created_by: profile.id })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, patientId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient-custom-prices', data.patientId] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
      toast.success('Tarifa personalizada desactivada');
    },
    onError: () => toast.error('Error al desactivar la tarifa'),
  });
}
