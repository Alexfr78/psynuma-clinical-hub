import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface SessionPaymentStatus {
  hasPendingPayment: boolean;
  isPaid: boolean;
  debt: {
    id: string;
    amount: number;
    paid_amount: number;
    status: string;
  } | null;
}

export function useSessionPaymentStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-payment-status', sessionId],
    queryFn: async (): Promise<SessionPaymentStatus> => {
      const { data: debt, error } = await supabase
        .from('debts')
        .select('id, amount, paid_amount, status')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (error) throw error;

      return {
        hasPendingPayment: debt ? debt.status !== 'paid' : false,
        isPaid: debt?.status === 'paid',
        debt: debt as SessionPaymentStatus['debt'],
      };
    },
    enabled: !!sessionId,
  });
}

export interface CollectSessionPaymentParams {
  sessionId: string;
  patientId: string;
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  reference?: string;
  notes?: string;
}

export function useCollectSessionPayment() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (params: CollectSessionPaymentParams) => {
      const centerId = profile!.center_id!;

      // 1. Check if debt exists for this session
      const { data: existingDebt } = await supabase
        .from('debts')
        .select('id, amount, paid_amount')
        .eq('session_id', params.sessionId)
        .maybeSingle();

      let debtId: string;

      if (existingDebt) {
        // Update existing debt
        debtId = existingDebt.id;
      } else {
        // Create new debt for session
        const { data: newDebt, error: debtError } = await supabase
          .from('debts')
          .insert({
            session_id: params.sessionId,
            patient_id: params.patientId,
            center_id: centerId,
            amount: params.amount,
            paid_amount: 0,
            status: 'pending',
          })
          .select()
          .single();

        if (debtError) throw debtError;
        debtId = newDebt.id;
      }

      // 2. Create the payment
      const { data: payment, error: paymentError } = await supabase
        .from('payments')
        .insert({
          session_id: params.sessionId,
          patient_id: params.patientId,
          center_id: centerId,
          amount: params.amount,
          payment_method: params.paymentMethod,
          payment_date: params.paymentDate || new Date().toISOString().split('T')[0],
          reference: params.reference || null,
          notes: params.notes || null,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 3. Update debt to paid
      const { error: updateError } = await supabase
        .from('debts')
        .update({
          paid_amount: params.amount,
          status: 'paid',
        })
        .eq('id', debtId);

      if (updateError) throw updateError;

      return { payment, debtId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      toast.success('Pago registrado correctamente');
    },
    onError: (error) => {
      toast.error('Error al registrar el pago: ' + error.message);
    },
  });
}
