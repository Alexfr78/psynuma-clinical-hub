import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface SessionPaymentStatus {
  hasPendingPayment: boolean;
  isPaid: boolean;
  isPartial: boolean;
  debt: {
    id: string;
    amount: number;
    paid_amount: number;
    status: string;
    invoice_id: string | null;
  } | null;
}

export function useSessionPaymentStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-payment-status', sessionId],
    queryFn: async (): Promise<SessionPaymentStatus> => {
      const { data: debt, error } = await supabase
        .from('debts')
        .select('id, amount, paid_amount, status, invoice_id')
        .eq('session_id', sessionId!)
        .maybeSingle();

      if (error) throw error;

      return {
        hasPendingPayment: debt ? debt.status !== 'paid' : false,
        isPaid: debt?.status === 'paid',
        isPartial: debt?.status === 'partial',
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
        .select('id, amount, paid_amount, invoice_id')
        .eq('session_id', params.sessionId)
        .maybeSingle();

      let debtId: string;
      let invoiceId: string | null = null;
      let debtAmount: number = params.amount;

      if (existingDebt) {
        // Update existing debt
        debtId = existingDebt.id;
        debtAmount = Number(existingDebt.amount);
        invoiceId = existingDebt.invoice_id;
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

      // 2. If no invoice linked to debt, check if there's an invoice for this session via invoice_items
      if (!invoiceId) {
        const { data: invoiceItem } = await supabase
          .from('invoice_items')
          .select('invoice_id')
          .eq('session_id', params.sessionId)
          .maybeSingle();
        
        if (invoiceItem?.invoice_id) {
          invoiceId = invoiceItem.invoice_id;
          // Link the debt to this invoice
          await supabase
            .from('debts')
            .update({ invoice_id: invoiceId })
            .eq('id', debtId);
        }
      }

      // 3. Create the payment
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
          invoice_id: invoiceId,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // 4. Calculate new paid amount and status (support partial payments)
      const currentPaidAmount = existingDebt ? Number(existingDebt.paid_amount) : 0;
      const newPaidAmount = currentPaidAmount + params.amount;
      const newStatus = newPaidAmount >= debtAmount ? 'paid' : 'partial';

      // 5. Update debt
      const { error: updateError } = await supabase
        .from('debts')
        .update({
          paid_amount: newPaidAmount,
          status: newStatus,
        })
        .eq('id', debtId);

      if (updateError) throw updateError;

      // 6. If invoice exists and debt is now paid, update invoice status
      if (invoiceId && newStatus === 'paid') {
        await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoiceId);
      }

      return { payment, debtId, invoiceId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Pago registrado correctamente');
    },
    onError: (error) => {
      toast.error('Error al registrar el pago: ' + error.message);
    },
  });
}
