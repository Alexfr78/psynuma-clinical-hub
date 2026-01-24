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

      // Get invoice total to compare
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('total')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      // Get total payments linked to this invoice
      const { data: paymentsSum, error: paymentsSumError } = await supabase
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId);

      if (paymentsSumError) throw paymentsSumError;

      const totalPaid = paymentsSum?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const invoiceTotal = Number(invoice.total);
      const isFullyPaid = totalPaid >= invoiceTotal;

      // Find the debt associated with this invoice and update it
      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .select('id, paid_amount, amount')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (debtError) throw debtError;

      if (debt) {
        // Update debt with new total paid
        const newStatus = totalPaid >= Number(debt.amount) ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending');

        await supabase
          .from('debts')
          .update({
            paid_amount: totalPaid,
            status: newStatus,
          })
          .eq('id', debt.id);
      }

      // Always update invoice status based on total payments
      if (isFullyPaid) {
        await supabase
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoiceId);
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
