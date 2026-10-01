import { qk } from '@/lib/query-keys';
import { listSearchPattern } from '@/lib/list-search';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
    is_valid?: boolean;
    status?: string;

  } | null;
  sessions: {
    id: string;
    session_date: string;
    session_type: string | null;
    bono_id: string | null;
    price: number | null;
    payment_status: string | null;
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

export interface DebtListFilters {
  patientId?: string;
  search?: string;
  status?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDebtFilters<Q extends { eq: any; gte: any; lte: any; in: any }>(query: Q, filters?: DebtListFilters): Q {
  if (filters?.patientId) query = query.eq('patient_id', filters.patientId);
  if (filters?.status) query = query.eq('status', filters.status as Debt['status']);
  else query = query.in('status', ['pending', 'partial']);
  return query;
}

function debtsListQuery(filters: DebtListFilters, head = false) {
  let query = supabase.from('debts').select('*, patients (id, first_name, last_name, phone, email), invoices (id, invoice_number, is_valid, status), sessions (id, session_date, session_type, bono_id, price, payment_status), excluded_invoice:invoices()', { count: 'exact', head });
  query = applyDebtFilters(query, filters);
  if (filters.search?.trim()) query = query.filter('search_text', 'ilike', listSearchPattern(filters.search));
  // Conserva deudas sin factura y excluye las facturas no operativas.
  return query.or('is_valid.eq.false,status.eq.cancelled', { referencedTable: 'excluded_invoice' })
    .is('excluded_invoice', null)
    .order('created_at', { ascending: false }).order('id', { ascending: true });
}

export function useDebtsPage(filters: DebtListFilters, range: { from: number; to: number }) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: qk.debts.page(filters, range.from, range.to, profile?.center_id),
    queryFn: async () => {
      const { data, count, error } = await debtsListQuery(filters).range(range.from, range.to);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as DebtWithRelations[], total: count ?? 0 };
    },
    enabled: !!profile?.center_id,
    placeholderData: keepPreviousData,
  });
}

export function useDebts(filters?: { patientId?: string; status?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: qk.debts.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('debts')
        .select(`
          *,
          patients (id, first_name, last_name, phone, email),
          invoices (id, invoice_number, is_valid, status),
          sessions (id, session_date, session_type, bono_id, price, payment_status)
        `)
        .order('created_at', { ascending: false });

      query = applyDebtFilters(query, filters);

      const { data, error } = await query;
      if (error) throw error;

      // Exclude debts whose invoice has been invalidated by a rectificativa or
      // annulled in AEAT. These debts should already be marked as refunded, but
      // as a safety net we also filter client-side to prevent stale data from
      // showing up as operational pending debts.
      const debts = (data ?? []) as unknown as DebtWithRelations[];
      const filtered = debts.filter((debt) => {
        if (debt.invoices && debt.invoices.is_valid === false) {
          return false;
        }
        if (debt.invoices && debt.invoices.status === 'cancelled') {
          return false;
        }
        return true;
      });


      return filtered;
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
      queryClient.invalidateQueries({ queryKey: qk.debts.all });
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
      queryClient.invalidateQueries({ queryKey: qk.debts.all });
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
    queryKey: qk.debtStats.all,
    queryFn: async () => {
      // La regla vive en SQL (get_receivables_summary): suma en la base, sin el tope de
      // 1.000 filas de PostgREST y con la RLS de siempre. Una factura emitida solo cuenta
      // si no tiene ninguna deuda registrada; con la deuda pagada ya no está pendiente.
      const { data, error } = await supabase.rpc('get_receivables_summary');
      if (error) throw error;

      const row = data?.[0];
      return {
        totalPending: Number(row?.total_pending ?? 0),
        overdueAmount: Number(row?.overdue_amount ?? 0),
        overdueCount: Number(row?.overdue_count ?? 0),
        totalCount: Number(row?.total_count ?? 0),
      };
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
      queryClient.invalidateQueries({ queryKey: qk.debts.all });
      queryClient.invalidateQueries({ queryKey: qk.debtStats.all });
      toast.success('Deuda eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar la deuda: ' + error.message);
    },
  });
}
