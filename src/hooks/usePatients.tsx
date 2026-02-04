import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Patient = Tables<'patients'>;
export type PatientInsert = TablesInsert<'patients'>;
export type PatientUpdate = TablesUpdate<'patients'>;

export interface PatientFilters {
  search?: string;
  status?: string;
  professionalId?: string;
}

export function usePatients(filters?: PatientFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['patients', filters],
    queryFn: async () => {
      let query = supabase
        .from('patients')
        .select(`
          *,
          assigned_professional:profiles!patients_assigned_professional_id_fkey(
            id, first_name, last_name, email
          )
        `)
        // Order by status priority: active first, then inactive, then discharged
        .order('status', { ascending: true })
        .order('updated_at', { ascending: false });

      if (filters?.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      }

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status as 'active' | 'inactive' | 'discharged');
      }

      if (filters?.professionalId && filters.professionalId !== 'all') {
        query = query.eq('assigned_professional_id', filters.professionalId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });
}

export function usePatient(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: async () => {
      if (!patientId) return null;

      const { data, error } = await supabase
        .from('patients')
        .select(`
          *,
          assigned_professional:profiles!patients_assigned_professional_id_fkey(
            id, first_name, last_name, email, specialty
          )
        `)
        .eq('id', patientId)
        .maybeSingle();

      if (error) throw error;
      
      // Return with status fields explicitly typed
      return data as (typeof data) & {
        status_source?: string | null;
        status_reason?: string | null;
        status_updated_at?: string | null;
      };
    },
    enabled: !!patientId,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (patient: Omit<PatientInsert, 'center_id'>) => {
      if (!profile?.center_id) throw new Error('No center assigned');

      const { data, error } = await supabase
        .from('patients')
        .insert({ ...patient, center_id: profile.center_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
    },
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: PatientUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('patients')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      queryClient.invalidateQueries({ queryKey: ['patient', data.id] });
    },
  });
}

export function useProfessionals() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['professionals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, specialty')
        .eq('is_active', true)
        .order('first_name');

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });
}
