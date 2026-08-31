import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ExpenseCategory {
  id: string;
  center_id: string;
  name: string;
  color: string;
  icon: string | null;
  is_professional_payment_category: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategoryInsert {
  name: string;
  color?: string;
  icon?: string | null;
  is_active?: boolean;
  display_order?: number;
}

export function useExpenseCategories(includeInactive = false) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['expense-categories', profile?.center_id, includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('expense_categories')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ExpenseCategory[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (category: ExpenseCategoryInsert) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .insert({ ...category, center_id: profile!.center_id! })
        .select()
        .single();

      if (error) throw error;
      return data as ExpenseCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría creada');
    },
    onError: (error: Error) => {
      toast.error('Error al crear la categoría: ' + error.message);
    },
  });
}

export function useUpdateExpenseCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ExpenseCategory> & { id: string }) => {
      const { data, error } = await supabase
        .from('expense_categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ExpenseCategory;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría actualizada');
    },
    onError: (error: Error) => {
      toast.error('Error al actualizar la categoría: ' + error.message);
    },
  });
}

export function useDeleteExpenseCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete — categories may be referenced by historical expenses.
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Categoría desactivada');
    },
    onError: (error: Error) => {
      toast.error('Error al desactivar la categoría: ' + error.message);
    },
  });
}
