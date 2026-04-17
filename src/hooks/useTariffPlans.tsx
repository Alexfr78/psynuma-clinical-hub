import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TariffPlan {
  id: string;
  center_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TariffPlanWithStats extends TariffPlan {
  item_count: number;
  patient_count: number;
}

export interface TariffPlanItem {
  id: string;
  tariff_plan_id: string;
  target_type: 'session_type' | 'bono_template';
  target_id: string;
  price: number;
  created_at: string;
  updated_at: string;
  // Enriched
  target_name?: string;
  base_price?: number;
}

export interface TariffPlanAssignment {
  id: string;
  center_id: string;
  patient_id: string;
  tariff_plan_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Enriched
  tariff_plan?: Pick<TariffPlan, 'id' | 'name' | 'is_default'>;
}

// ── Tariff Plans ──────────────────────────────────────────────────────────────

export function useTariffPlans() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['tariff-plans', profile?.center_id],
    queryFn: async (): Promise<TariffPlanWithStats[]> => {
      const { data: plans, error } = await supabase
        .from('tariff_plans')
        .select('*')
        .eq('center_id', profile!.center_id!)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      if (!plans?.length) return [];

      const planIds = plans.map(p => p.id);

      // Counts en paralelo
      const [itemsRes, assignmentsRes] = await Promise.all([
        supabase.from('tariff_plan_items').select('tariff_plan_id').in('tariff_plan_id', planIds),
        supabase.from('patient_tariff_plan_assignments')
          .select('tariff_plan_id')
          .in('tariff_plan_id', planIds)
          .eq('is_active', true),
      ]);

      const itemCounts = new Map<string, number>();
      const patientCounts = new Map<string, number>();

      (itemsRes.data || []).forEach(r => {
        itemCounts.set(r.tariff_plan_id, (itemCounts.get(r.tariff_plan_id) ?? 0) + 1);
      });
      (assignmentsRes.data || []).forEach(r => {
        patientCounts.set(r.tariff_plan_id, (patientCounts.get(r.tariff_plan_id) ?? 0) + 1);
      });

      return plans.map(p => ({
        ...p,
        item_count: itemCounts.get(p.id) ?? 0,
        patient_count: patientCounts.get(p.id) ?? 0,
      }));
    },
    enabled: !!profile?.center_id,
  });
}

export function useTariffPlanItems(planId: string | undefined) {
  return useQuery({
    queryKey: ['tariff-plan-items', planId],
    queryFn: async (): Promise<TariffPlanItem[]> => {
      if (!planId) return [];

      const { data, error } = await supabase
        .from('tariff_plan_items')
        .select('*')
        .eq('tariff_plan_id', planId)
        .order('target_type')
        .order('created_at');

      if (error) throw error;
      const items = (data || []) as TariffPlanItem[];
      if (!items.length) return [];

      // Enriquecer con nombres y precios base
      const stIds = items.filter(i => i.target_type === 'session_type').map(i => i.target_id);
      const btIds = items.filter(i => i.target_type === 'bono_template').map(i => i.target_id);

      const [stRes, btRes] = await Promise.all([
        stIds.length > 0
          ? supabase.from('session_types').select('id, name, default_price').in('id', stIds)
          : { data: [] },
        btIds.length > 0
          ? supabase.from('bono_templates').select('id, name, total_price').in('id', btIds)
          : { data: [] },
      ]);

      const stMap = new Map(
        (stRes.data || []).map((r: { id: string; name: string; default_price: number }) => [r.id, { name: r.name, base_price: r.default_price }])
      );
      const btMap = new Map(
        (btRes.data || []).map((r: { id: string; name: string; total_price: number }) => [r.id, { name: r.name, base_price: Number(r.total_price) }])
      );

      return items.map(item => {
        const meta = item.target_type === 'session_type' ? stMap.get(item.target_id) : btMap.get(item.target_id);
        return { ...item, target_name: meta?.name, base_price: meta?.base_price };
      });
    },
    enabled: !!planId,
  });
}

// ── Mutations: Tariff Plans ───────────────────────────────────────────────────

export function useCreateTariffPlan() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; is_default?: boolean }) => {
      const { data, error } = await supabase
        .from('tariff_plans')
        .insert({
          center_id: profile!.center_id!,
          name: input.name,
          description: input.description ?? null,
          is_default: input.is_default ?? false,
          is_active: true,
          created_by: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
      toast.success('Plan tarifario creado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateTariffPlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string | null; is_default?: boolean; is_active?: boolean }) => {
      const { id, ...updates } = input;
      const { data, error } = await supabase
        .from('tariff_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
      toast.success('Plan tarifario actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDuplicateTariffPlan() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (planId: string) => {
      // Fetch original plan + items
      const { data: original, error: e1 } = await supabase
        .from('tariff_plans').select('*').eq('id', planId).single();
      if (e1) throw e1;
      const { data: items, error: e2 } = await supabase
        .from('tariff_plan_items').select('*').eq('tariff_plan_id', planId);
      if (e2) throw e2;

      // Create new plan
      const { data: newPlan, error: e3 } = await supabase
        .from('tariff_plans')
        .insert({
          center_id: original.center_id,
          name: `${original.name} (copia)`,
          description: original.description,
          is_default: false,
          is_active: true,
          created_by: profile!.id,
        })
        .select()
        .single();
      if (e3) throw e3;

      // Copy items
      if (items && items.length > 0) {
        const { error: e4 } = await supabase.from('tariff_plan_items').insert(
          items.map(item => ({
            tariff_plan_id: newPlan.id,
            target_type: item.target_type,
            target_id: item.target_id,
            price: item.price,
          }))
        );
        if (e4) throw e4;
      }

      return newPlan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
      toast.success('Plan tarifario duplicado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Mutations: Tariff Plan Items ──────────────────────────────────────────────

export function useUpsertTariffPlanItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      tariff_plan_id: string;
      target_type: 'session_type' | 'bono_template';
      target_id: string;
      price: number;
      existing_id?: string;
    }) => {
      if (input.existing_id) {
        const { data, error } = await supabase
          .from('tariff_plan_items')
          .update({ price: input.price })
          .eq('id', input.existing_id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('tariff_plan_items')
          .insert({
            tariff_plan_id: input.tariff_plan_id,
            target_type: input.target_type,
            target_id: input.target_id,
            price: input.price,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tariff-plan-items', data.tariff_plan_id] });
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTariffPlanItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, planId }: { id: string; planId: string }) => {
      const { error } = await supabase.from('tariff_plan_items').delete().eq('id', id);
      if (error) throw error;
      return planId;
    },
    onSuccess: (planId) => {
      queryClient.invalidateQueries({ queryKey: ['tariff-plan-items', planId] });
      queryClient.invalidateQueries({ queryKey: ['tariff-plans'] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ── Mutations: Patient Assignments ────────────────────────────────────────────

export function usePatientTariffAssignment(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-tariff-assignment', patientId],
    queryFn: async (): Promise<TariffPlanAssignment | null> => {
      if (!patientId) return null;
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('patient_tariff_plan_assignments')
        .select('*, tariff_plan:tariff_plans(id, name, is_default)')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .lte('start_date', today)
        .or(`end_date.is.null,end_date.gte.${today}`)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as TariffPlanAssignment | null;
    },
    enabled: !!patientId,
  });
}

export function useAssignTariffPlan() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      patient_id: string;
      tariff_plan_id: string;
      start_date: string;
      end_date?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('patient_tariff_plan_assignments')
        .insert({
          center_id: profile!.center_id!,
          patient_id: input.patient_id,
          tariff_plan_id: input.tariff_plan_id,
          start_date: input.start_date,
          end_date: input.end_date ?? null,
          notes: input.notes ?? null,
          is_active: true,
          created_by: profile!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient-tariff-assignment', data.patient_id] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
      toast.success('Tarifa asignada al paciente');
    },
    onError: (e: Error) => {
      const msg = e.message.includes('solap') || e.message.includes('overlap')
        ? 'Este paciente ya tiene una tarifa activa en ese rango.'
        : e.message;
      toast.error(msg);
    },
  });
}

export function useRemoveTariffAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patientId }: { id: string; patientId: string }) => {
      const { error } = await supabase
        .from('patient_tariff_plan_assignments')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
      return patientId;
    },
    onSuccess: (patientId) => {
      queryClient.invalidateQueries({ queryKey: ['patient-tariff-assignment', patientId] });
      queryClient.invalidateQueries({ queryKey: ['resolved-price'] });
      toast.success('Tarifa retirada del paciente');
    },
    onError: () => toast.error('Error al retirar la tarifa'),
  });
}
