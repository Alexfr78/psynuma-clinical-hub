import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Profile = Tables<'profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;
export type Availability = Tables<'availability'>;
export type AvailabilityInsert = TablesInsert<'availability'>;
export type AvailabilityUpdate = TablesUpdate<'availability'>;

export function useProfessionals() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['professionals', profile?.center_id],
    queryFn: async () => {
      if (!profile?.center_id) throw new Error('No center_id');

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('center_id', profile.center_id)
        .order('first_name', { ascending: true });

      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useProfessional(professionalId: string | null) {
  return useQuery({
    queryKey: ['professional', professionalId],
    queryFn: async () => {
      if (!professionalId) throw new Error('No professional ID');

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', professionalId)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!professionalId,
  });
}

export function useUpdateProfessional() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ProfileUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
      queryClient.invalidateQueries({ queryKey: ['professional'] });
    },
  });
}

export function useProfessionalAvailability(professionalId: string | null) {
  return useQuery({
    queryKey: ['availability', professionalId],
    queryFn: async () => {
      if (!professionalId) throw new Error('No professional ID');

      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .eq('professional_id', professionalId)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as Availability[];
    },
    enabled: !!professionalId,
  });
}

export function useCreateAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (availability: AvailabilityInsert) => {
      const { data, error } = await supabase
        .from('availability')
        .insert(availability)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['availability', variables.professional_id] });
    },
  });
}

export function useUpdateAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: AvailabilityUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('availability')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('availability')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}

export function useAllProfessionalAvailability(professionalIds: string[]) {
  return useQuery({
    queryKey: ['availability', 'all', professionalIds],
    queryFn: async () => {
      if (professionalIds.length === 0) return [];

      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .in('professional_id', professionalIds)
        .eq('is_available', true)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      return data as Availability[];
    },
    enabled: professionalIds.length > 0,
  });
}
