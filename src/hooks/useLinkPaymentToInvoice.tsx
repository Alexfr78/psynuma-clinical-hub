import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LinkPaymentParams {
  paymentId: string;
  invoiceId: string;
}

/**
 * Hook to reassign a payment to a (different) invoice.
 *
 * Uses the backend RPC `reassign_payment_to_invoice_v2` which atomically:
 * - Validates that the target invoice is valid (is_valid=true, not cancelled/draft)
 * - Blocks reassignment to invoices invalidated by a rectificativa
 * - Moves the payment, recomputes debts and invoice statuses for both
 *   the source and target invoices
 * - Creates a debt record for the target invoice if one doesn't exist
 *
 * Business rule: payments must never be linked to an invoice that has been
 * replaced by a total rectificativa (is_valid = false).
 */
export function useLinkPaymentToInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, invoiceId }: LinkPaymentParams) => {
      const { data, error } = await supabase.rpc('reassign_payment_to_invoice_v2', {
        p_payment_id: paymentId,
        p_target_invoice_id: invoiceId,
      });

      if (error) throw error;
      return data;
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
