import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Debt {
  id: string;
  patient_id: string;
  center_id: string;
  session_id: string | null;
  invoice_id: string | null;
  bono_id: string | null;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: 'pending' | 'partial' | 'paid' | 'refunded';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DebtWithRelations extends Debt {
  patients: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  };
  invoices: {
    id: string;
    invoice_number: string;
  } | null;
}

export interface DebtInsert {
  patient_id: string;
  session_id?: string | null;
  invoice_id?: string | null;
  amount: number;
  due_date?: string | null;
  notes?: string | null;
}

export function useDebts(filters?: { patientId?: string; status?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['debts', filters],
    queryFn: async () => {
      let query = supabase
        .from('debts')
        .select(`
          *,
          patients (id, first_name, last_name, phone, email),
          invoices (id, invoice_number, is_valid)
        `)
        .order('created_at', { ascending: false });

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status as 'pending' | 'partial' | 'paid' | 'refunded');
      } else {
        // By default, show only pending and partial
        query = query.in('status', ['pending', 'partial'] as const);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Exclude debts whose invoice has been invalidated by a rectificativa.
      // These debts should have status='refunded' from the RPC, but as a safety
      // net we also filter client-side to prevent stale data from showing up
      // as operational pending debts.
      const filtered = (data as any[]).filter((debt) => {
        if (debt.invoices && debt.invoices.is_valid === false) {
          return false;
        }
        return true;
      });

      return filtered as DebtWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateDebt() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (debt: DebtInsert) => {
      const { data, error } = await supabase
        .from('debts')
        .insert({
          ...debt,
          center_id: profile!.center_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Deuda registrada');
    },
    onError: (error) => {
      toast.error('Error: ' + error.message);
    },
  });
}

export function useUpdateDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Debt> & { id: string }) => {
      const { data, error } = await supabase
        .from('debts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      toast.success('Deuda actualizada');
    },
    onError: (error) => {
      toast.error('Error: ' + error.message);
    },
  });
}

export function useDebtStats() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['debt-stats'],
    queryFn: async () => {
      const [debtsRes, issuedRes] = await Promise.all([
        supabase
          .from('debts')
          .select('amount, paid_amount, status, due_date, invoice_id')
          .in('status', ['pending', 'partial']),
        supabase
          .from('invoices')
          .select('id, total, is_valid')
          .eq('status', 'issued')
          .eq('is_valid', true),
      ]);

      if (debtsRes.error) throw debtsRes.error;

      // If debts have invoice_id, we need to verify those invoices are still valid.
      // Collect invoice_ids from debts to check validity.
      const debtInvoiceIds = new Set<string>();
      const invoiceIdsToCheck = new Set<string>();
      debtsRes.data.forEach((debt) => {
        if (debt.invoice_id) {
          debtInvoiceIds.add(debt.invoice_id);
          invoiceIdsToCheck.add(debt.invoice_id);
        }
      });

      // Fetch validity for debts' invoices
      let invalidInvoiceIds = new Set<string>();
      if (invoiceIdsToCheck.size > 0) {
        const { data: invoiceValidity } = await supabase
          .from('invoices')
          .select('id, is_valid')
          .in('id', Array.from(invoiceIdsToCheck))
          .eq('is_valid', false);

        if (invoiceValidity) {
          invalidInvoiceIds = new Set(invoiceValidity.map(i => i.id));
        }
      }

      const now = new Date();
      const stats = {
        totalPending: 0,
        overdueAmount: 0,
        overdueCount: 0,
        totalCount: 0,
      };

      // Exclude debts whose invoice is invalidated by rectificativa
      debtsRes.data.forEach((debt) => {
        if (debt.invoice_id && invalidInvoiceIds.has(debt.invoice_id)) {
          return; // Skip debts for invalidated invoices
        }

        const remaining = Number(debt.amount) - Number(debt.paid_amount);
        stats.totalPending += remaining;
        stats.totalCount++;

        if (debt.due_date && new Date(debt.due_date) < now) {
          stats.overdueAmount += remaining;
          stats.overdueCount++;
        }
      });

      // Add issued valid invoices without a debt record
      if (issuedRes.data) {
        issuedRes.data
          .filter(inv => !debtInvoiceIds.has(inv.id))
          .forEach(inv => {
            stats.totalPending += Number(inv.total);
            stats.totalCount++;
          });
      }

      return stats;
    },
    enabled: !!profile?.center_id,
  });
}

export function useDeleteDebt() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (debtId: string) => {
      const { error } = await supabase
        .from('debts')
        .delete()
        .eq('id', debtId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast.success('Deuda eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar la deuda: ' + error.message);
    },
  });
}
