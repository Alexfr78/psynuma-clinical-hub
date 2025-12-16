import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Payment {
  id: string;
  patient_id: string;
  center_id: string;
  invoice_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentWithRelations extends Payment {
  session_id: string | null;
  patients: {
    id: string;
    first_name: string;
    last_name: string;
  };
  invoices: {
    id: string;
    invoice_number: string;
  } | null;
  sessions: {
    id: string;
    session_date: string;
    start_time: string;
  } | null;
}

export interface PaymentInsert {
  patient_id: string;
  invoice_id?: string | null;
  session_id?: string | null;
  amount: number;
  payment_date?: string;
  payment_method?: string;
  reference?: string | null;
  notes?: string | null;
}

export function usePayments(filters?: { patientId?: string; startDate?: string; endDate?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['payments', filters],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          *,
          patients (id, first_name, last_name),
          invoices (id, invoice_number),
          sessions (id, session_date, start_time)
        `)
        .order('payment_date', { ascending: false });

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }
      if (filters?.startDate) {
        query = query.gte('payment_date', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('payment_date', filters.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as PaymentWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (payment: PaymentInsert) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          ...payment,
          center_id: profile!.center_id!,
        })
        .select()
        .single();

      if (error) throw error;

      // If payment is linked to an invoice, update debt and invoice status
      if (payment.invoice_id) {
        const { data: debt } = await supabase
          .from('debts')
          .select('id, paid_amount, amount')
          .eq('invoice_id', payment.invoice_id)
          .maybeSingle();

        if (debt) {
          const newPaidAmount = Number(debt.paid_amount) + payment.amount;
          const newStatus = newPaidAmount >= Number(debt.amount) ? 'paid' : 'partial';

          await supabase
            .from('debts')
            .update({
              paid_amount: newPaidAmount,
              status: newStatus,
            })
            .eq('id', debt.id);

          // Update invoice status based on payment
          if (newStatus === 'paid') {
            await supabase
              .from('invoices')
              .update({ status: 'paid' })
              .eq('id', payment.invoice_id);
          }
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Pago registrado correctamente');
    },
    onError: (error) => {
      toast.error('Error al registrar el pago: ' + error.message);
    },
  });
}

export interface PaymentUpdate {
  amount?: number;
  payment_method?: string;
  payment_date?: string;
  reference?: string | null;
  notes?: string | null;
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PaymentUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      toast.success('Pago actualizado correctamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar el pago: ' + error.message);
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: PaymentWithRelations) => {
      // If payment has session_id, reset the debt to pending
      if (payment.session_id) {
        const { data: debt } = await supabase
          .from('debts')
          .select('id')
          .eq('session_id', payment.session_id)
          .maybeSingle();

        if (debt) {
          await supabase
            .from('debts')
            .update({ paid_amount: 0, status: 'pending' })
            .eq('id', debt.id);
        }
      }

      // If payment has invoice_id, decrement paid_amount and update invoice status
      if (payment.invoice_id) {
        const { data: debt } = await supabase
          .from('debts')
          .select('id, paid_amount, amount')
          .eq('invoice_id', payment.invoice_id)
          .maybeSingle();

        if (debt) {
          const newPaidAmount = Math.max(0, Number(debt.paid_amount) - payment.amount);
          const newStatus = newPaidAmount >= Number(debt.amount) ? 'paid' : newPaidAmount > 0 ? 'partial' : 'pending';
          
          await supabase
            .from('debts')
            .update({ paid_amount: newPaidAmount, status: newStatus })
            .eq('id', debt.id);

          // Update invoice status: if no longer fully paid, set to 'issued'
          if (newStatus !== 'paid') {
            await supabase
              .from('invoices')
              .update({ status: 'issued' })
              .eq('id', payment.invoice_id);
          }
        }
      }

      // Delete the payment
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      toast.success('Pago eliminado correctamente');
    },
    onError: (error) => {
      toast.error('Error al eliminar el pago: ' + error.message);
    },
  });
}

export function usePaymentStats() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['payment-stats'],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('payments')
        .select('amount, payment_method')
        .gte('payment_date', startOfMonth)
        .lte('payment_date', endOfMonth);

      if (error) throw error;

      const stats = {
        totalAmount: 0,
        byMethod: {} as Record<string, number>,
        count: data.length,
      };

      data.forEach((payment) => {
        stats.totalAmount += Number(payment.amount);
        const method = payment.payment_method || 'cash';
        stats.byMethod[method] = (stats.byMethod[method] || 0) + Number(payment.amount);
      });

      return stats;
    },
    enabled: !!profile?.center_id,
  });
}
