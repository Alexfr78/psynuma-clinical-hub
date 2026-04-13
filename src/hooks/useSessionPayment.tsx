import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Session payment status — resolves the *real* outstanding balance for a session
 * by finding the current valid invoice and the active (non-refunded) debt.
 *
 * Key improvement over the old hook: excludes debts with status='refunded' and
 * debts linked to invoices with is_valid=false (replaced by rectificativa).
 * This prevents the UI from offering to collect on already-closed positions.
 */
export interface SessionPaymentStatus {
  hasPendingPayment: boolean;
  isPaid: boolean;
  isPartial: boolean;
  /** True only when there is a real outstanding balance > 0.01 */
  isCollectable: boolean;
  remainingAmount: number;
  activeDebt: {
    id: string;
    amount: number;
    paid_amount: number;
    status: string;
    invoice_id: string | null;
  } | null;
  validInvoiceId: string | null;
  validInvoiceStatus: string | null;
  // Legacy aliases kept for backward compat with existing UI code
  debt: SessionPaymentStatus['activeDebt'];
}

export function useSessionPaymentStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-payment-status', sessionId],
    queryFn: async (): Promise<SessionPaymentStatus> => {
      // 1. Find the current valid invoice for this session via invoice_items
      const { data: invoiceItems } = await supabase
        .from('invoice_items')
        .select('invoice_id, invoices!inner(id, is_valid, status, total)')
        .or(`session_id.eq.${sessionId},billable_event_id.in.(select id from billable_events where session_id='${sessionId}')`)

      // Pick the valid, non-cancelled invoice
      let validInvoice: { id: string; status: string; total: number } | null = null;
      if (invoiceItems) {
        for (const item of invoiceItems) {
          const inv = item.invoices as any;
          if (inv && inv.is_valid === true && inv.status !== 'cancelled') {
            validInvoice = { id: inv.id, status: inv.status, total: Number(inv.total) };
            break;
          }
        }
      }

      // Fallback: also try via billable_events if the .or() filter didn't work
      // (PostgREST subquery syntax may not be supported in all versions)
      if (!validInvoice) {
        const { data: beItems } = await supabase
          .from('billable_events')
          .select('id')
          .eq('session_id', sessionId!);

        if (beItems && beItems.length > 0) {
          const beIds = beItems.map(be => be.id);
          const { data: beInvoiceItems } = await supabase
            .from('invoice_items')
            .select('invoice_id, invoices!inner(id, is_valid, status, total)')
            .in('billable_event_id', beIds);

          if (beInvoiceItems) {
            for (const item of beInvoiceItems) {
              const inv = item.invoices as any;
              if (inv && inv.is_valid === true && inv.status !== 'cancelled') {
                validInvoice = { id: inv.id, status: inv.status, total: Number(inv.total) };
                break;
              }
            }
          }
        }
      }

      // 2. Find the active debt for this session, excluding refunded and invalid-invoice debts
      const { data: debts, error: debtsError } = await supabase
        .from('debts')
        .select('id, amount, paid_amount, status, invoice_id')
        .eq('session_id', sessionId!)
        .not('status', 'eq', 'refunded');

      if (debtsError) throw debtsError;

      // Filter out debts whose invoice has is_valid=false
      let activeDebt: SessionPaymentStatus['activeDebt'] = null;
      if (debts && debts.length > 0) {
        // If we know the valid invoice, prefer the debt linked to it
        const preferredDebt = validInvoice
          ? debts.find(d => d.invoice_id === validInvoice!.id)
          : null;

        if (preferredDebt) {
          activeDebt = preferredDebt as SessionPaymentStatus['activeDebt'];
        } else {
          // Check each debt's invoice validity
          for (const d of debts) {
            if (d.invoice_id) {
              const { data: inv } = await supabase
                .from('invoices')
                .select('is_valid')
                .eq('id', d.invoice_id)
                .single();
              if (inv && inv.is_valid === false) continue; // skip
            }
            activeDebt = d as SessionPaymentStatus['activeDebt'];
            break;
          }
        }
      }

      // 3. Calculate real remaining
      const debtAmount = activeDebt ? Number(activeDebt.amount) : 0;
      const paidAmount = activeDebt ? Number(activeDebt.paid_amount) : 0;
      const remainingAmount = Math.max(debtAmount - paidAmount, 0);

      const isPaid = activeDebt?.status === 'paid' || (debtAmount > 0 && remainingAmount < 0.01);
      const isPartial = activeDebt?.status === 'partial' || (paidAmount > 0 && remainingAmount >= 0.01);
      const hasPendingPayment = activeDebt ? activeDebt.status !== 'paid' : false;
      const isCollectable = remainingAmount > 0.01;

      return {
        hasPendingPayment,
        isPaid,
        isPartial,
        isCollectable,
        remainingAmount,
        activeDebt,
        validInvoiceId: validInvoice?.id || null,
        validInvoiceStatus: validInvoice?.status || null,
        // Legacy alias
        debt: activeDebt,
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

/**
 * Collect payment for a session using the backend RPC collect_session_payment_v2.
 *
 * The RPC atomically:
 * - Resolves the current valid invoice for the session
 * - Finds/creates the active debt (excluding refunded/invalid)
 * - Checks the real outstanding balance from actual payment records
 * - Blocks if already fully paid or if amount > remaining
 * - Inserts payment, recomputes debt, syncs invoice status
 * - Uses FOR UPDATE to prevent concurrent double-charges
 */
export function useCollectSessionPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CollectSessionPaymentParams) => {
      const { data, error } = await (supabase.rpc as any)('collect_session_payment_v2', {
        p_session_id: params.sessionId,
        p_patient_id: params.patientId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod,
        p_payment_date: params.paymentDate || new Date().toISOString().split('T')[0],
        p_reference: params.reference || null,
        p_notes: params.notes || null,
      });

      if (error) throw error;
      return data as unknown as {
        success: boolean;
        payment_id: string;
        debt_id: string;
        invoice_id: string | null;
        amount_paid: number;
        total_paid: number;
        debt_amount: number;
        remaining: number;
        status: string;
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Pago registrado correctamente');
    },
    onError: (error) => {
      toast.error('Error al registrar el pago: ' + error.message);
    },
  });
}
