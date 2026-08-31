import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export type ExpenseRecurrenceFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface ExpenseRecurringTemplate {
  id: string;
  center_id: string;
  category_id: string;
  supplier_id: string | null;
  description: string;
  default_amount: number;
  frequency: ExpenseRecurrenceFrequency;
  day_of_period: number;
  anchor_month: number | null;
  is_active: boolean;
  starts_on: string;
  ends_on: string | null;
  default_payment_method: string | null;
  vat_rate: number | null;
  irpf_rate: number | null;
  last_generated_period: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseRecurringTemplateWithRelations extends ExpenseRecurringTemplate {
  category: { id: string; name: string; color: string } | null;
  supplier: { id: string; name: string } | null;
}

export interface ExpenseRecurringTemplateInsert {
  category_id: string;
  supplier_id?: string | null;
  description: string;
  default_amount: number;
  frequency: ExpenseRecurrenceFrequency;
  day_of_period: number;
  anchor_month?: number | null;
  starts_on?: string;
  ends_on?: string | null;
  default_payment_method?: string | null;
  vat_rate?: number | null;
  irpf_rate?: number | null;
}

export function useExpenseRecurringTemplates() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-recurring-templates', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_recurring_templates')
        .select('*, category:expense_categories(id, name, color), supplier:suppliers(id, name)')
        .order('description', { ascending: true });

      if (error) throw error;
      return data as ExpenseRecurringTemplateWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateExpenseRecurringTemplate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (template: ExpenseRecurringTemplateInsert) => {
      const { data, error } = await supabase
        .from('expense_recurring_templates')
        .insert({ ...template, center_id: profile!.center_id!, created_by: profile!.id })
        .select()
        .single();

      if (error) throw error;
      return data as ExpenseRecurringTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-recurring-templates'] });
      toast.success('Gasto recurrente creado');
    },
    onError: (error: Error) => {
      toast.error('Error al crear el gasto recurrente: ' + error.message);
    },
  });
}

export function useUpdateExpenseRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExpenseRecurringTemplateInsert> & { id: string }) => {
      const { data, error } = await supabase
        .from('expense_recurring_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ExpenseRecurringTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-recurring-templates'] });
      toast.success('Gasto recurrente actualizado');
    },
    onError: (error: Error) => {
      toast.error('Error al actualizar el gasto recurrente: ' + error.message);
    },
  });
}

export function useToggleExpenseRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('expense_recurring_templates')
        .update({ is_active: isActive })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-recurring-templates'] });
      toast.success('Estado actualizado');
    },
    onError: (error: Error) => {
      toast.error('Error: ' + error.message);
    },
  });
}

export function useDeleteExpenseRecurringTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expense_recurring_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-recurring-templates'] });
      toast.success('Gasto recurrente eliminado');
    },
    onError: (error: Error) => {
      toast.error('Error al eliminar el gasto recurrente: ' + error.message);
    },
  });
}
