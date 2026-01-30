import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Bono {
  id: string;
  patient_id: string;
  center_id: string;
  name: string;
  total_sessions: number;
  used_sessions: number;
  price_per_session: number;
  total_price: number;
  status: 'active' | 'exhausted' | 'expired' | 'cancelled';
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BonoWithPatient extends Bono {
  patients: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface BonoTemplate {
  id: string;
  center_id: string;
  name: string;
  total_sessions: number;
  price_per_session: number;
  total_price: number;
  validity_days: number | null;
  is_active: boolean;
  created_at: string;
}

export interface BonoInsert {
  patient_id: string;
  name: string;
  total_sessions: number;
  price_per_session: number;
  total_price: number;
  expires_at?: string | null;
}

export interface BonoTemplateInsert {
  name: string;
  total_sessions: number;
  price_per_session: number;
  total_price: number;
  validity_days?: number | null;
  is_active?: boolean;
}

export interface BonoSession {
  session_id: string;
  session_date: string;
  session_status: string;
  patient_name: string | null;
  professional_name: string | null;
  session_type_name: string | null;
  consumes_bono: boolean;
}

export interface DeleteBonoResult {
  success: boolean;
  action?: 'deleted' | 'cancelled';
  message?: string;
  error?: string;
  bono_name?: string;
  sessions_unlinked?: number;
  used_sessions?: number;
  total_sessions?: number;
}

export function useBonos(filters?: { patientId?: string; status?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['bonos', filters],
    queryFn: async () => {
      let query = supabase
        .from('bonos')
        .select(`
          *,
          patients (id, first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.patientId) {
        query = query.eq('patient_id', filters.patientId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status as 'active' | 'exhausted' | 'expired' | 'cancelled');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as BonoWithPatient[];
    },
    enabled: !!profile?.center_id,
  });
}

export function usePatientActiveBonos(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-active-bonos', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bonos')
        .select('*')
        .eq('patient_id', patientId!)
        .eq('status', 'active' as const)
        .order('expires_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      
      // Filter bonos with available sessions
      return (data ?? []).filter(
        bono => (bono.total_sessions - (bono.used_sessions || 0)) > 0
      ) as Bono[];
    },
    enabled: !!patientId,
  });
}

// Fetch a specific bono by ID (even if exhausted) - used to display currently assigned bono
export function useBono(bonoId: string | null | undefined) {
  return useQuery({
    queryKey: ['bono', bonoId],
    queryFn: async () => {
      if (!bonoId) return null;
      
      const { data, error } = await supabase
        .from('bonos')
        .select('*')
        .eq('id', bonoId)
        .maybeSingle();

      if (error) throw error;
      return data as Bono | null;
    },
    enabled: !!bonoId,
  });
}

// Fetch sessions linked to a bono
export function useBonoSessions(bonoId: string | undefined) {
  return useQuery({
    queryKey: ['bono-sessions', bonoId],
    queryFn: async () => {
      if (!bonoId) return [];

      const { data, error } = await supabase.rpc('get_bono_sessions', {
        p_bono_id: bonoId,
      });

      if (error) throw error;
      return data as BonoSession[];
    },
    enabled: !!bonoId,
  });
}

export function useCreateBono() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (bono: BonoInsert) => {
      const { data, error } = await supabase
        .from('bonos')
        .insert({
          ...bono,
          center_id: profile!.center_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      toast.success('Bono creado correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear el bono: ' + error.message);
    },
  });
}

export function useUpdateBono() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Bono> & { id: string }) => {
      const { data, error } = await supabase
        .from('bonos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      toast.success('Bono actualizado correctamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar el bono: ' + error.message);
    },
  });
}

// Delete a bono safely using RPC
export function useDeleteBono() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bonoId: string): Promise<DeleteBonoResult> => {
      const { data, error } = await supabase.rpc('delete_bono_safely', {
        p_bono_id: bonoId,
      });

      if (error) throw error;
      return data as unknown as DeleteBonoResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['bono-sessions'] });
      
      if (result.success) {
        if (result.action === 'deleted') {
          toast.success('Bono eliminado', {
            description: result.message,
          });
        } else if (result.action === 'cancelled') {
          toast.success('Bono cancelado', {
            description: result.message,
          });
        }
      } else {
        toast.error('Error', {
          description: result.error,
        });
      }
    },
    onError: (error: Error) => {
      toast.error('Error al eliminar bono', {
        description: error.message,
      });
    },
  });
}

export function useBonoTemplates() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['bono-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bono_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data as BonoTemplate[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateBonoTemplate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (template: BonoTemplateInsert) => {
      const { data, error } = await supabase
        .from('bono_templates')
        .insert({
          ...template,
          center_id: profile!.center_id!,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bono-templates'] });
      toast.success('Plantilla creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la plantilla: ' + error.message);
    },
  });
}

export function useDeleteBonoTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('bono_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bono-templates'] });
      toast.success('Plantilla eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar: ' + error.message);
    },
  });
}

// Apply bono to session using transactional RPC
export function useApplyBonoToSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bonoId, sessionId }: { bonoId: string; sessionId: string }) => {
      const { data, error } = await supabase
        .rpc('apply_bono_to_session', {
          p_bono_id: bonoId,
          p_session_id: sessionId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['bono-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
    },
    onError: (error) => {
      toast.error('Error al asignar bono: ' + error.message);
    },
  });
}

// Remove bono from session using transactional RPC
export function useRemoveBonoFromSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .rpc('remove_bono_from_session', {
          p_session_id: sessionId,
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['bono-sessions'] });
    },
    onError: (error) => {
      toast.error('Error al quitar bono: ' + error.message);
    },
  });
}

// Legacy hook - kept for backward compatibility but now uses RPC internally
export function useDeductBonoSession() {
  const applyBono = useApplyBonoToSession();
  
  return {
    ...applyBono,
    mutateAsync: async ({ bonoId, sessionId }: { bonoId: string; sessionId: string }) => {
      return applyBono.mutateAsync({ bonoId, sessionId });
    },
  };
}
