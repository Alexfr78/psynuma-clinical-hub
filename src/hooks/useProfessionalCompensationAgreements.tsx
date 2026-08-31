import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type CompensationType = 'fixed' | 'percentage' | 'mixed';
export type CompensationBasis = 'collected_payments' | 'issued_invoices';

export interface CompensationAgreement {
  id: string;
  center_id: string;
  professional_id: string;
  compensation_type: CompensationType;
  fixed_amount: number;
  percentage_rate: number;
  compensation_basis: CompensationBasis;
  default_irpf_rate: number | null;
  category_id: string | null;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompensationAgreementInsert {
  professional_id: string;
  compensation_type: CompensationType;
  fixed_amount?: number;
  percentage_rate?: number;
  compensation_basis?: CompensationBasis;
  default_irpf_rate?: number | null;
  category_id?: string | null;
  effective_from?: string;
  notes?: string | null;
}

export interface VariableCompensationPreview {
  collected_total: number;
  variable_amount: number;
  percentage_rate: number;
}

/** The professional's currently active agreement (effective_to IS NULL), if any. */
export function useCompensationAgreement(professionalId: string | undefined) {
  return useQuery({
    queryKey: ['compensation-agreement', professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_compensation_agreements')
        .select('*')
        .eq('professional_id', professionalId!)
        .eq('is_active', true)
        .is('effective_to', null)
        .maybeSingle();

      if (error) throw error;
      return data as CompensationAgreement | null;
    },
    enabled: !!professionalId,
  });
}

export function useCompensationAgreementHistory(professionalId: string | undefined) {
  return useQuery({
    queryKey: ['compensation-agreement-history', professionalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('professional_compensation_agreements')
        .select('*')
        .eq('professional_id', professionalId!)
        .order('effective_from', { ascending: false });

      if (error) throw error;
      return data as CompensationAgreement[];
    },
    enabled: !!professionalId,
  });
}

export function useCreateCompensationAgreement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CompensationAgreementInsert) => {
      const effectiveFrom = input.effective_from ?? new Date().toISOString().split('T')[0];

      // Close the professional's currently active agreement (one day before
      // the new one starts) so the "only one active agreement" unique index
      // is respected, then insert the new one.
      const { data: current, error: currentError } = await supabase
        .from('professional_compensation_agreements')
        .select('id, effective_from')
        .eq('professional_id', input.professional_id)
        .eq('is_active', true)
        .is('effective_to', null)
        .maybeSingle();

      if (currentError) throw currentError;

      if (current) {
        const closeDate = new Date(effectiveFrom);
        closeDate.setDate(closeDate.getDate() - 1);
        const effectiveTo = closeDate.toISOString().split('T')[0];

        const { error: closeError } = await supabase
          .from('professional_compensation_agreements')
          .update({ effective_to: effectiveTo })
          .eq('id', current.id);

        if (closeError) throw closeError;
      }

      const { data, error } = await supabase
        .from('professional_compensation_agreements')
        .insert({
          ...input,
          center_id: profile!.center_id!,
          effective_from: effectiveFrom,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CompensationAgreement;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['compensation-agreement', variables.professional_id] });
      queryClient.invalidateQueries({ queryKey: ['compensation-agreement-history', variables.professional_id] });
      toast.success('Acuerdo de compensación guardado');
    },
    onError: (error: Error) => {
      toast.error('Error al guardar el acuerdo: ' + error.message);
    },
  });
}

export function usePreviewVariableCompensation(
  professionalId: string | undefined,
  periodStart: string | undefined,
  periodEnd: string | undefined,
) {
  return useQuery({
    queryKey: ['compensation-preview', professionalId, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('calculate_professional_variable_amount', {
        p_professional_id: professionalId,
        p_period_start: periodStart,
        p_period_end: periodEnd,
      });

      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? { collected_total: 0, variable_amount: 0, percentage_rate: 0 }) as VariableCompensationPreview;
    },
    enabled: !!professionalId && !!periodStart && !!periodEnd,
  });
}
