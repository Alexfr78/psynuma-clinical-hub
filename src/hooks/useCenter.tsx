import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Center {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  invoice_prefix: string | null;
  invoice_next_number: number | null;
  created_at: string;
  updated_at: string;
}

export function useCenter() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const { data: center, isLoading } = useQuery({
    queryKey: ['center', centerId],
    queryFn: async () => {
      if (!centerId) return null;
      
      const { data, error } = await supabase
        .from('centers')
        .select('*')
        .eq('id', centerId)
        .maybeSingle();

      if (error) throw error;
      return data as Center | null;
    },
    enabled: !!centerId,
  });

  const updateCenter = useMutation({
    mutationFn: async (updates: Partial<Center>) => {
      if (!centerId) throw new Error('No center ID');
      
      const { data, error } = await supabase
        .from('centers')
        .update(updates)
        .eq('id', centerId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['center', centerId] });
      toast.success('Centro actualizado correctamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar el centro: ' + error.message);
    },
  });

  return {
    center,
    isLoading,
    updateCenter,
  };
}
