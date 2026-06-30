import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CancellationCharge {
  id: string;
  center_id: string;
  patient_id: string;
  session_id: string | null;
  policy_version_id: string | null;
  status: 'pending_review' | 'confirmed' | 'forgiven' | 'paid' | 'cancelled';
  amount: number;
  original_amount: number;
  percentage: number;
  base_session_price: number;
  concept: string;
  review_note: string | null;
  debt_id: string | null;
  invoice_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  patients?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  sessions?: {
    id: string;
    session_date: string;
    start_time: string;
    session_type: string | null;
  } | null;
}

export function useCancellationCharges(status: CancellationCharge['status'] = 'pending_review') {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['cancellation-charges', profile?.center_id, status],
    queryFn: async () => {
      if (!profile?.center_id) return [];

      const { data, error } = await supabase
        .from('cancellation_charges')
        .select(`
          *,
          patients(id, first_name, last_name, email, phone),
          sessions(id, session_date, start_time, session_type)
        `)
        .eq('center_id', profile.center_id)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CancellationCharge[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useConfirmCancellationCharge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (charge: CancellationCharge) => {
      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .insert({
          center_id: charge.center_id,
          patient_id: charge.patient_id,
          session_id: charge.session_id,
          amount: charge.amount,
          paid_amount: 0,
          status: 'pending',
          notes: charge.concept,
        })
        .select('id')
        .single();

      if (debtError) throw debtError;

      const { error: chargeError } = await supabase
        .from('cancellation_charges')
        .update({
          status: 'confirmed',
          debt_id: debt.id,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', charge.id);

      if (chargeError) throw chargeError;
      return debt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancellation-charges'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast.success('Deuda generada desde la cancelación');
    },
    onError: (error) => {
      toast.error('No se pudo generar la deuda', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}

export function useForgiveCancellationCharge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chargeId: string) => {
      const { error } = await supabase
        .from('cancellation_charges')
        .update({
          status: 'forgiven',
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', chargeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancellation-charges'] });
      toast.success('Cargo perdonado');
    },
    onError: (error) => {
      toast.error('No se pudo perdonar el cargo', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}
