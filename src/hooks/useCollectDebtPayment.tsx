import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';

interface CollectDebtPaymentArgs {
  debtId: string;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
}

export function useCollectDebtPayment() {
  const queryClient = useQueryClient();
  const createSignedInvoice = useCreateSignedInvoice();
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

      // 2. Create partial invoice for the amount being paid
      const taxRate = center?.default_tax_rate || 0;
      const taxAmount = (amount * taxRate) / 100;
      const isBono = !!debt.bono_id;

      const invoiceResult = await createSignedInvoice.mutateAsync({
        patientId: debt.patient_id,
        invoiceType: 'simplified',
        items: [{
          description: debt.notes || (isBono ? 'Pago de bono' : 'Pago de sesión'),
          quantity: 1,
          unit_price: amount,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total: amount + taxAmount,
          bono_id: debt.bono_id || undefined,
          session_id: debt.session_id || undefined,
        }],
        notes: notes || undefined,
        sendNotification: false,
      });

      const invoiceId = invoiceResult?.invoiceId;
      if (!invoiceId) throw new Error('No se pudo crear la factura');

      // 3. Insert payment linked to invoice
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

      // 4. Update debt
      const newPaid = Number(debt.paid_amount || 0) + amount;
      const newStatus = newPaid >= Number(debt.amount || 0) - 0.01 ? 'paid' : 'partial';

      const { error: updErr } = await supabase
        .from('debts')
        .update({
          paid_amount: newPaid,
          status: newStatus,
          invoice_id: invoiceId, // last invoice created
        })
        .eq('id', debtId);

      if (updErr) throw updErr;

      return { invoiceId, newPaid, newStatus };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Pago registrado y factura generada');
    },
    onError: (error) => {
      toast.error('Error al cobrar: ' + error.message);
    },
  });
}
