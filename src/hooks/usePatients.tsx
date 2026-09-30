import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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

const PATIENT_LIST_SELECT = `
  *,
  assigned_professional:profiles!patients_assigned_professional_id_fkey(
    id, first_name, last_name, email
  )
`;

/** Aplica búsqueda y filtros del listado de contactos. Compartido por la lista completa y la paginada. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyPatientFilters<Q extends { or: any; eq: any }>(query: Q, filters?: PatientFilters): Q {
  if (filters?.search) {
    // Split by whitespace so "Pablo García" matches first_name="Pablo" + last_name="García"
    const terms = filters.search.trim().split(/\s+/).filter(Boolean);
    for (const term of terms) {
      const escaped = term.replace(/[%,()]/g, ' ');
      query = query.or(
        `first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%`
      );
    }
  }

  if (filters?.status && filters.status !== 'all') {
    query = query.eq('status', filters.status as 'active' | 'inactive' | 'discharged');
  }

  if (filters?.professionalId && filters.professionalId !== 'all') {
    query = query.eq('assigned_professional_id', filters.professionalId);
  }

  return query;
}

/** Lista completa (selectores de paciente en diálogos). Para el listado de Contactos, `usePatientsPage`. */
export function usePatients(filters?: PatientFilters) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['patients', filters],
    queryFn: async () => {
      const query = supabase
        .from('patients')
        .select(PATIENT_LIST_SELECT)
        // Order by status priority: active first, then inactive, then discharged
        .order('status', { ascending: true })
        .order('updated_at', { ascending: false });

      const { data, error } = await applyPatientFilters(query, filters);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });
}

/**
 * Una página del listado de Contactos, con el total exacto. La clave empieza por 'patients',
 * así que las invalidaciones existentes (`['patients']`) también la refrescan.
 */
export function usePatientsPage(filters: PatientFilters | undefined, range: { from: number; to: number }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['patients', 'page', filters, range.from, range.to],
    queryFn: async () => {
      const query = supabase
        .from('patients')
        .select(PATIENT_LIST_SELECT, { count: 'exact' })
        .order('status', { ascending: true })
        .order('updated_at', { ascending: false })
        // Desempate estable: sin él, dos páginas pueden repetir o saltarse filas.
        .order('id', { ascending: true });

      const { data, error, count } = await applyPatientFilters(query, filters).range(range.from, range.to);

      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
    enabled: !!profile?.center_id,
    placeholderData: keepPreviousData,
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
