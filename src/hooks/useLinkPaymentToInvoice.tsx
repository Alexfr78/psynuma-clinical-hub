import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LinkPaymentParams {
  paymentId: string;
  invoiceId: string;
  amount: number;
}

/**
 * Hook to link an existing payment to an invoice.
 * Updates the payment's invoice_id and recalculates the associated debt.
 */
export function useLinkPaymentToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, invoiceId, amount }: LinkPaymentParams) => {
      // Update the payment with the invoice_id
      const { error: updateError } = await supabase
        .from('payments')
        .update({ invoice_id: invoiceId })
        .eq('id', paymentId);

      if (updateError) throw updateError;

      // Find the debt associated with this invoice and update it
      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .select('id, paid_amount, amount')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (debtError) throw debtError;

      if (debt) {
        // Calculate new paid amount
        const newPaidAmount = Number(debt.paid_amount || 0) + amount;
        const newStatus = newPaidAmount >= Number(debt.amount) ? 'paid' : 'partial';

        // Update debt
        await supabase
          .from('debts')
          .update({
            paid_amount: newPaidAmount,
            status: newStatus,
          })
          .eq('id', debt.id);

        // Update invoice status if fully paid
        if (newStatus === 'paid') {
          await supabase
            .from('invoices')
            .update({ status: 'paid' })
            .eq('id', invoiceId);
        }
      }

      return { paymentId, invoiceId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Pago vinculado a factura correctamente');
    },
    onError: (error) => {
      toast.error('Error al vincular el pago: ' + error.message);
    },
  });
}
