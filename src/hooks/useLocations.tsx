import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CenterLocation {
  id: string;
  center_id: string;
  name: string;
  street: string;
  number_details: string | null;
  city: string;
  postal_code: string | null;
  country: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface LocationInsert {
  name: string;
  street: string;
  number_details?: string;
  city: string;
  postal_code?: string;
  country?: string;
}

export function useLocations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['locations', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('center_locations')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      return data as CenterLocation[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (location: LocationInsert) => {
      if (!profile?.center_id) throw new Error('No center assigned');

      const { data, error } = await supabase
        .from('center_locations')
        .insert({ ...location, center_id: profile.center_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}

export function useDeleteLocation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('center_locations')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
}
