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
          invoices (id, invoice_number)
        `)
        .order('created_at', { ascending: false });

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      } else {
        // By default, show only pending and partial
        query = query.in('status', ['pending', 'partial'] as const);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DebtWithRelations[];
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
      const { data, error } = await supabase
        .from('debts')
        .select('amount, paid_amount, status, due_date')
        .in('status', ['pending', 'partial']);

      if (error) throw error;

      const now = new Date();
      const stats = {
        totalPending: 0,
        overdueAmount: 0,
        overdueCount: 0,
        totalCount: data.length,
      };

      data.forEach((debt) => {
        const remaining = Number(debt.amount) - Number(debt.paid_amount);
        stats.totalPending += remaining;

        if (debt.due_date && new Date(debt.due_date) < now) {
          stats.overdueAmount += remaining;
          stats.overdueCount++;
        }
      });

      return stats;
    },
    enabled: !!profile?.center_id,
  });
}
