import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIssueInvoice } from '@/hooks/useIssueInvoice';
import { toast } from 'sonner';

interface CollectDebtPaymentArgs {
  debtId: string;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  /** If provided, use this invoice. If debt has no invoice and this is not provided, error. */
  invoiceId?: string;
  /** If true, issue the invoice on first payment (when draft). Default true. */
  issueInvoice?: boolean;
}

/**
 * Hook to collect payment on a debt.
 * If the debt already has an invoice_id, uses that invoice.
 * If the debt has no invoice_id but invoiceId is passed, links and uses that.
 * Does NOT auto-create invoices - caller must handle that decision based on center settings.
 */
export function useCollectDebtPayment() {
  const queryClient = useQueryClient();
  const issueInvoiceMutation = useIssueInvoice();

  return useMutation({
    mutationFn: async ({ 
      debtId, 
      amount, 
      paymentMethod, 
      reference, 
      notes,
      invoiceId: providedInvoiceId,
      issueInvoice: shouldIssue = true,
    }: CollectDebtPaymentArgs) => {
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

      // 2. Determine invoice ID to use
      let invoiceId: string | null = debt.invoice_id || providedInvoiceId || null;
      
      // If no invoice_id on debt but one was provided, link it
      if (!debt.invoice_id && providedInvoiceId) {
        const { error: linkErr } = await supabase
          .from('debts')
          .update({ invoice_id: providedInvoiceId })
          .eq('id', debtId);

        if (linkErr) throw linkErr;
        invoiceId = providedInvoiceId;
      }

      // 3. Get invoice status if we have one
      let invoiceStatus: string | null = null;
      if (invoiceId) {
        const { data: invoice, error: invErr } = await supabase
          .from('invoices')
          .select('id, status')
          .eq('id', invoiceId)
          .single();

        if (invErr || !invoice) {
          throw new Error('No se pudo obtener la factura asociada');
        }
        invoiceStatus = invoice.status;
      }

      // 4. Insert payment
      const { error: payErr } = await supabase.from('payments').insert({
        patient_id: debt.patient_id,
        center_id: debt.center_id,
        invoice_id: invoiceId,
        session_id: debt.session_id || null,
        amount,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString(),
        reference: reference || null,
        notes: notes || null,
      });

      if (payErr) throw payErr;

      // 5. If invoice is draft and shouldIssue, issue it BEFORE recomputing
      let invoiceIssued = false;
      if (invoiceId && invoiceStatus === 'draft' && shouldIssue) {
        try {
          await issueInvoiceMutation.mutateAsync(invoiceId);
          invoiceIssued = true;
        } catch (issueErr) {
          console.error('Error issuing invoice:', issueErr);
          toast.warning('Pago registrado, pero hubo un error al emitir la factura');
        }
      }

      // 6. Recompute debt via RPC if there's an invoice (also syncs invoice status)
      if (invoiceId) {
        const { error: rpcErr } = await supabase.rpc('recompute_debt_by_invoice', { 
          p_debt_id: debtId 
        });

        if (rpcErr) {
          console.error('Error recomputing debt:', rpcErr);
        }
      } else {
        // Manual update if no invoice
        const newPaid = Number(debt.paid_amount || 0) + amount;
        const newStatus = newPaid >= Number(debt.amount) ? 'paid' : 'partial';
        await supabase
          .from('debts')
          .update({ paid_amount: newPaid, status: newStatus })
          .eq('id', debtId);

        // Auto-complete past session when debt is fully paid
        if (newStatus === 'paid' && debt.session_id) {
          await supabase
            .from('sessions')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', debt.session_id)
            .in('status', ['scheduled', 'confirmed'])
            .lt('session_date', new Date().toISOString().split('T')[0]);
        }
      }

      return { 
        invoiceId,
        invoiceIssued,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['bono-payment-status'] });
      
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
