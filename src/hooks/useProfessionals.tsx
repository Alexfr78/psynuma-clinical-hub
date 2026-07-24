import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Profile = Tables<'profiles'>;
export type AppRole = Enums<'app_role'>;
export type Professional = Profile & { roles: AppRole[] };
export type ProfileUpdate = TablesUpdate<'profiles'>;
export type Availability = Tables<'availability'>;
export type AvailabilityInsert = TablesInsert<'availability'>;
export type AvailabilityUpdate = TablesUpdate<'availability'>;

export interface InviteProfessionalInput {
  first_name: string;
  last_name: string;
  email: string;
}

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

export function useProfessionalsWithRoles() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['professionals', 'with-roles', profile?.center_id],
    queryFn: async () => {
      if (!profile?.center_id) throw new Error('No center_id');

      const [profilesResult, rolesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('center_id', profile.center_id)
          .order('first_name', { ascending: true }),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .eq('center_id', profile.center_id),
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (rolesResult.error) throw rolesResult.error;

      const rolesByUser = new Map<string, AppRole[]>();
      for (const userRole of rolesResult.data) {
        const roles = rolesByUser.get(userRole.user_id) ?? [];
        roles.push(userRole.role);
        rolesByUser.set(userRole.user_id, roles);
      }

      return profilesResult.data.map((professional) => ({
        ...professional,
        roles: rolesByUser.get(professional.id) ?? [],
      })) as Professional[];
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

export function useInviteProfessional() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteProfessionalInput) => {
      const { data, error } = await supabase.functions.invoke('invite-professional', {
        body: input,
      });

      if (error) {
        let message = data?.error;
        const response = 'context' in error ? error.context : null;

        if (!message && response instanceof Response) {
          const errorBody = await response.clone().json().catch(() => null);
          message = errorBody?.error;
        }

        throw new Error(message || 'No se pudo enviar la invitación');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professionals'] });
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
