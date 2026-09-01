import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type ExpenseKind = 'fixed_recurring' | 'variable' | 'supplier_invoice' | 'professional_payment';
export type ExpenseStatus = 'pending' | 'paid' | 'cancelled';

export interface Expense {
  id: string;
  center_id: string;
  kind: ExpenseKind;
  category_id: string;
  supplier_id: string | null;
  professional_id: string | null;
  compensation_agreement_id: string | null;
  compensation_period_start: string | null;
  compensation_period_end: string | null;
  recurring_template_id: string | null;
  generated_period_start: string | null;
  description: string;
  amount: number;
  tax_base: number | null;
  vat_rate: number | null;
  vat_amount: number | null;
  irpf_rate: number | null;
  irpf_amount: number | null;
  supplier_invoice_number: string | null;
  invoice_issue_date: string | null;
  operation_date: string | null;
  expense_date: string;
  due_date: string | null;
  status: ExpenseStatus;
  payment_method: string | null;
  paid_at: string | null;
  paid_amount: number;
  attachment_path: string | null;
  attachment_mime_type: string | null;
  ai_extraction_status: 'pending' | 'processing' | 'done' | 'failed' | null;
  ai_extraction_raw: unknown;
  ai_extraction_confidence: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseWithRelations extends Expense {
  category: { id: string; name: string; color: string } | null;
  supplier: { id: string; name: string; tax_id: string | null } | null;
  professional: { id: string; first_name: string | null; last_name: string | null } | null;
}

export interface ExpenseInsert {
  kind: ExpenseKind;
  category_id: string;
  supplier_id?: string | null;
  professional_id?: string | null;
  description: string;
  amount: number;
  tax_base?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  irpf_rate?: number | null;
  irpf_amount?: number | null;
  supplier_invoice_number?: string | null;
  invoice_issue_date?: string | null;
  operation_date?: string | null;
  expense_date?: string;
  due_date?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  ai_extraction_status?: 'pending' | 'processing' | 'done' | 'failed' | null;
  ai_extraction_raw?: unknown;
}

export interface ExpenseFilters {
  month?: string; // 'YYYY-MM'
  categoryId?: string;
  supplierId?: string;
  professionalId?: string;
  status?: ExpenseStatus;
  kind?: ExpenseKind;
}

const EXPENSE_SELECT = `
  *,
  category:expense_categories(id, name, color),
  supplier:suppliers(id, name, tax_id),
  professional:profiles!expenses_professional_id_fkey(id, first_name, last_name)
`;

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function useExpenses(filters?: ExpenseFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expenses', profile?.center_id, filters],
    queryFn: async () => {
      let query = supabase.from('expenses').select(EXPENSE_SELECT).order('expense_date', { ascending: false });

      if (filters?.month) {
        const { start, end } = monthRange(filters.month);
        query = query.gte('expense_date', start).lte('expense_date', end);
      }
      if (filters?.categoryId) query = query.eq('category_id', filters.categoryId);
      if (filters?.supplierId) query = query.eq('supplier_id', filters.supplierId);
      if (filters?.professionalId) query = query.eq('professional_id', filters.professionalId);
      if (filters?.status) query = query.eq('status', filters.status);
      if (filters?.kind) query = query.eq('kind', filters.kind);

      const { data, error } = await query;
      if (error) throw error;
      return data as ExpenseWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select(EXPENSE_SELECT).eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as ExpenseWithRelations | null;
    },
    enabled: !!id,
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (expense: ExpenseInsert) => {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          ...expense,
          center_id: profile!.center_id!,
          created_by: profile!.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      toast.success('Gasto registrado');
    },
    onError: (error: Error) => {
      toast.error('Error al registrar el gasto: ' + error.message);
    },
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExpenseInsert> & { id: string }) => {
      const { data, error } = await supabase.from('expenses').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data as Expense;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      toast.success('Gasto actualizado');
    },
    onError: (error: Error) => {
      toast.error('Error al actualizar el gasto: ' + error.message);
    },
  });
}

export function useMarkExpensePaid() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, paidAt, paymentMethod }: { id: string; paidAt: string; paymentMethod: string }) => {
      const { data: current, error: fetchError } = await supabase
        .from('expenses')
        .select('amount')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;

      const { data, error } = await supabase
        .from('expenses')
        .update({
          status: 'paid',
          paid_at: paidAt,
          payment_method: paymentMethod,
          paid_amount: current.amount,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Expense;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      toast.success('Gasto marcado como pagado');
    },
    onError: (error: Error) => {
      toast.error('Error: ' + error.message);
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense-stats'] });
      toast.success('Gasto eliminado');
    },
    onError: (error: Error) => {
      toast.error('Error al eliminar el gasto: ' + error.message);
    },
  });
}

const ALLOWED_RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;

export function useUploadExpenseReceipt() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ expenseId, file, skipStatusReset }: { expenseId: string; file: File; skipStatusReset?: boolean }) => {
      if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) {
        throw new Error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
      }
      if (file.size > MAX_RECEIPT_SIZE_BYTES) {
        throw new Error('El archivo no puede superar 10 MB.');
      }

      const ext = file.name.split('.').pop() || 'pdf';
      const filePath = `${profile!.center_id}/${expenseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('expense-receipts')
        .upload(filePath, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      // When the caller already ran AI extraction on this file before the
      // expense existed (upload-first flow), the row was created with
      // ai_extraction_status already set to 'done' — don't reset it back to
      // 'pending' here, or the already-extracted data looks unprocessed.
      const { error: updateError } = await supabase
        .from('expenses')
        .update({
          attachment_path: filePath,
          attachment_mime_type: file.type,
          ...(skipStatusReset ? {} : { ai_extraction_status: 'pending' }),
        })
        .eq('id', expenseId);
      if (updateError) throw updateError;

      return { path: filePath };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expense', variables.expenseId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Justificante subido');
    },
    onError: (error: Error) => {
      toast.error('Error al subir el justificante: ' + error.message);
    },
  });
}

export interface ExtractedReceiptData {
  supplier_name?: string | null;
  supplier_tax_id?: string | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  tax_base?: number | null;
  vat_rate?: number | null;
  vat_amount?: number | null;
  irpf_rate?: number | null;
  irpf_amount?: number | null;
  total_amount?: number | null;
  currency?: string | null;
}

export function useExtractExpenseReceiptData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ expenseId, attachmentPath }: { expenseId: string; attachmentPath: string }) => {
      const { data, error } = await supabase.functions.invoke('extract-expense-receipt-data', {
        body: { expenseId, attachmentPath },
      });

      if (error) {
        let message: string | undefined;
        const response = 'context' in error ? (error as { context?: unknown }).context : null;
        if (response instanceof Response) {
          const errorBody = await response.clone().json().catch(() => null);
          message = errorBody?.error;
        }
        throw new Error(message || 'No se pudo extraer la información del justificante');
      }

      return data?.extracted as ExtractedReceiptData;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['expense', variables.expenseId] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Extracts fiscal data from a receipt before any expense row exists, so the "Nuevo gasto" form can be pre-filled from the upload. */
export function useExtractExpenseReceiptPreview() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fileBase64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke('extract-expense-receipt-data', {
        body: { fileBase64, mimeType: file.type, fileName: file.name },
      });

      if (error) {
        let message: string | undefined;
        const response = 'context' in error ? (error as { context?: unknown }).context : null;
        if (response instanceof Response) {
          const errorBody = await response.clone().json().catch(() => null);
          message = errorBody?.error;
        }
        throw new Error(message || 'No se pudo extraer la información del justificante');
      }

      return data?.extracted as ExtractedReceiptData;
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useExpenseStats(month?: string) {
  const { profile } = useAuth();
  const effectiveMonth = month ?? new Date().toISOString().slice(0, 7);

  return useQuery({
    queryKey: ['expense-stats', profile?.center_id, effectiveMonth],
    queryFn: async () => {
      const { start, end } = monthRange(effectiveMonth);
      const todayISO = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('expenses')
        .select('amount, paid_amount, status, due_date, expense_date')
        .neq('status', 'cancelled');

      if (error) throw error;

      const stats = { totalPending: 0, totalPaidThisMonth: 0, overdueCount: 0, overdueAmount: 0 };

      for (const expense of data as Array<{ amount: number; paid_amount: number; status: string; due_date: string | null; expense_date: string }>) {
        const inMonth = expense.expense_date >= start && expense.expense_date <= end;

        if (expense.status === 'pending') {
          if (inMonth) stats.totalPending += Number(expense.amount);
          if (expense.due_date && expense.due_date < todayISO) {
            stats.overdueCount++;
            stats.overdueAmount += Number(expense.amount) - Number(expense.paid_amount || 0);
          }
        }
        if (expense.status === 'paid' && inMonth) {
          stats.totalPaidThisMonth += Number(expense.paid_amount || expense.amount);
        }
      }

      return stats;
    },
    enabled: !!profile?.center_id,
  });
}

export interface QuarterRange {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export function quarterToDateRange({ year, quarter }: QuarterRange): { start: string; end: string; label: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, label: `T${quarter} ${year}` };
}

/** Data needed for the "Cuenta de resultados" report + export, for a given quarter. */
export function useExpenseIncomeStatementData(range: QuarterRange) {
  const { profile } = useAuth();
  const { start, end } = quarterToDateRange(range);

  return useQuery({
    queryKey: ['expense-income-statement', profile?.center_id, start, end],
    queryFn: async () => {
      const [invoicesRes, expensesRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('total, tax_amount, retention_amount, status, is_valid')
          .in('status', ['issued', 'paid'])
          .eq('is_valid', true)
          .gte('issue_date', start)
          .lte('issue_date', end),
        supabase
          .from('expenses')
          .select('amount, vat_amount, irpf_amount, kind, status')
          .neq('status', 'cancelled')
          .gte('expense_date', start)
          .lte('expense_date', end),
      ]);

      if (invoicesRes.error) throw invoicesRes.error;
      if (expensesRes.error) throw expensesRes.error;

      const invoices = invoicesRes.data as Array<{ total: number; tax_amount: number; retention_amount: number | null }>;
      const expenses = expensesRes.data as Array<{ amount: number; vat_amount: number | null; irpf_amount: number | null; kind: ExpenseKind }>;

      const income = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
      const vatOutput = invoices.reduce((sum, inv) => sum + Number(inv.tax_amount || 0), 0);
      const irpfWithheldOnSales = invoices.reduce((sum, inv) => sum + Number(inv.retention_amount || 0), 0);

      const sumByKind = (kind: ExpenseKind) => expenses.filter((e) => e.kind === kind).reduce((sum, e) => sum + Number(e.amount), 0);

      const vatInput = expenses
        .filter((e) => e.kind === 'supplier_invoice')
        .reduce((sum, e) => sum + Number(e.vat_amount || 0), 0);
      const irpfWithheldOnExpenses = expenses.reduce((sum, e) => sum + Number(e.irpf_amount || 0), 0);

      return {
        income,
        expensesFixedRecurring: sumByKind('fixed_recurring'),
        expensesVariable: sumByKind('variable'),
        expensesSupplierInvoice: sumByKind('supplier_invoice'),
        expensesProfessionalPayment: sumByKind('professional_payment'),
        vatOutput,
        vatInput,
        irpfWithheldOnSales,
        irpfWithheldOnExpenses,
      };
    },
    enabled: !!profile?.center_id,
  });
}

/** Expenses of kind='supplier_invoice' in a date range, shaped for the VAT book export. */
export function useExpensesForVatBook(range: QuarterRange) {
  const { profile } = useAuth();
  const { start, end } = quarterToDateRange(range);

  return useQuery({
    queryKey: ['expenses-vat-book', profile?.center_id, start, end],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .eq('kind', 'supplier_invoice')
        .gte('expense_date', start)
        .lte('expense_date', end)
        .order('expense_date', { ascending: true });

      if (error) throw error;
      return data as ExpenseWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function usePendingExpensesThisMonth() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expenses-pending-this-month', profile?.center_id],
    queryFn: async () => {
      const now = new Date();
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      const endISO = endOfMonth.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('expenses')
        .select(EXPENSE_SELECT)
        .eq('status', 'pending')
        .lte('due_date', endISO)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data as ExpenseWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}
