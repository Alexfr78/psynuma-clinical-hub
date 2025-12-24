import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIssueInvoice } from '@/hooks/useIssueInvoice';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';

interface CollectDebtPaymentArgs {
  debtId: string;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
}

/**
 * Hook to collect payment on a debt that has an invoice_id (new bono model).
 * Does NOT create a new invoice - uses the existing draft/issued invoice.
 * Issues the invoice on first payment if it's still draft.
 */
export function useCollectDebtPayment() {
  const queryClient = useQueryClient();
  const issueInvoice = useIssueInvoice();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async ({ debtId, amount, paymentMethod, reference, notes }: CollectDebtPaymentArgs) => {
      if (!amount || amount <= 0) {
        throw new Error('El importe debe ser mayor que 0');
      }

      // 1. Read debt with all needed fields
      const { data: debt, error: debtErr } = await supabase
        .from('debts')
        .select('id, patient_id, center_id, bono_id, session_id, invoice_id, amount, paid_amount, status, notes')
        .eq('id', debtId)
        .single();

      if (debtErr) throw debtErr;
      if (!debt) throw new Error('Deuda no encontrada');
      if (!debt.center_id) throw new Error('La deuda no tiene center_id (error de datos)');

      const remaining = Number(debt.amount || 0) - Number(debt.paid_amount || 0);
      if (amount > remaining + 0.01) {
        throw new Error(`El importe supera el pendiente. Pendiente: ${remaining.toFixed(2)}€`);
      }

      // 2. Check if this debt has invoice_id (new model) or not (legacy)
      if (!debt.invoice_id) {
        throw new Error('Esta deuda no tiene factura asociada. Es una deuda del modelo anterior que requiere regularización.');
      }

      // 3. Get the invoice to check its status
      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('id', debt.invoice_id)
        .single();

      if (invErr || !invoice) {
        throw new Error('No se pudo obtener la factura asociada');
      }

      // 4. Insert payment linked to the existing invoice
      const { error: payErr } = await supabase.from('payments').insert({
        patient_id: debt.patient_id,
        center_id: debt.center_id,
        invoice_id: debt.invoice_id,
        session_id: debt.session_id || null,
        amount,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        reference: reference || null,
        notes: notes || null,
      });

      if (payErr) throw payErr;

      // 5. Recompute debt via RPC
      const { data: recomputeResult, error: rpcErr } = await supabase.rpc('recompute_debt_by_invoice', { 
        p_debt_id: debtId 
      });

      if (rpcErr) {
        console.error('Error recomputing debt:', rpcErr);
        throw new Error('Error al recalcular la deuda');
      }

      // 6. If invoice is draft, issue it (first payment)
      let invoiceIssued = false;
      if (invoice.status === 'draft') {
        try {
          await issueInvoice.mutateAsync(debt.invoice_id);
          invoiceIssued = true;
        } catch (issueErr) {
          console.error('Error issuing invoice:', issueErr);
          // Don't fail the whole operation, payment is already recorded
          toast.warning('Pago registrado, pero hubo un error al emitir la factura');
        }
      }

      return { 
        invoiceId: debt.invoice_id, 
        newPaid: (recomputeResult as { paid_amount?: number })?.paid_amount,
        newStatus: (recomputeResult as { status?: string })?.status,
        invoiceIssued,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      
      if (data.invoiceIssued) {
        toast.success('Pago registrado y factura emitida');
      } else {
        toast.success('Pago registrado correctamente');
      }
    },
    onError: (error) => {
      toast.error('Error al cobrar: ' + error.message);
    },
  });
}
