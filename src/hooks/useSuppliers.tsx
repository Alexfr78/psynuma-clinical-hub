import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

// TODO: eliminar cast cuando types.ts incluya las tablas del módulo de gastos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface Supplier {
  id: string;
  center_id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierInsert {
  name: string;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  province?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export function useSuppliers(filters?: { search?: string; activeOnly?: boolean }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['suppliers', profile?.center_id, filters],
    queryFn: async () => {
      let query = db.from('suppliers').select('*').order('name', { ascending: true });

      if (filters?.activeOnly !== false) {
        query = query.eq('is_active', true);
      }
      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: ['supplier', id],
    queryFn: async () => {
      const { data, error } = await db.from('suppliers').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as Supplier | null;
    },
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (supplier: SupplierInsert) => {
      const { data, error } = await db
        .from('suppliers')
        .insert({ ...supplier, center_id: profile!.center_id! })
        .select()
        .single();

      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor creado');
    },
    onError: (error: Error) => {
      toast.error('Error al crear el proveedor: ' + error.message);
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Supplier> & { id: string }) => {
      const { data, error } = await db
        .from('suppliers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success('Proveedor actualizado');
    },
    onError: (error: Error) => {
      toast.error('Error al actualizar el proveedor: ' + error.message);
    },
  });
}
