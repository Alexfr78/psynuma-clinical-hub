import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { toast } from 'sonner';
import { addDays } from 'date-fns';

export interface Assessment {
  id: string;
  center_id: string;
  patient_id: string;
  template_id: string;
  professional_id: string;
  status: 'pending' | 'completed' | 'expired' | 'revoked';
  access_token: string;
  sent_via: string | null;
  sent_to: string | null;
  sent_at: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  patient?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  template?: {
    id: string;
    code: string;
    name: string;
  };
  professional?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  };
  response?: {
    id: string;
    factor_scores: Record<string, number>;
    flags: Record<string, boolean> | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
  } | null;
}

interface CreateAssessmentParams {
  patient_id: string;
  template_id: string;
  sent_via?: 'email' | 'whatsapp';
  sent_to?: string;
  expires_in_days?: number;
}

export function useAssessments(patientId?: string) {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();

  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['assessments', profile?.center_id, patientId],
    queryFn: async () => {
      if (!profile?.center_id) return [];

      let query = supabase
        .from('assessments')
        .select(`
          *,
          patient:patients(id, first_name, last_name, email, phone),
          template:assessment_templates(id, code, name),
          professional:profiles(id, first_name, last_name),
          response:assessment_responses(id, factor_scores, flags, metadata, created_at)
        `)
        .eq('center_id', profile.center_id)
        .order('created_at', { ascending: false });

      if (patientId) {
        query = query.eq('patient_id', patientId);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform response array to single object
      return (data || []).map(a => ({
        ...a,
        response: a.response?.[0] || null
      })) as Assessment[];
    },
    enabled: !!profile?.center_id,
  });

  const createAssessment = useMutation({
    mutationFn: async (params: CreateAssessmentParams) => {
      if (!profile?.center_id || !profile?.id) throw new Error('No center or profile');

      const expirationDays = params.expires_in_days || center?.consent_expiration_days || 7;
      const expiresAt = addDays(new Date(), expirationDays).toISOString();

      const { data, error } = await supabase
        .from('assessments')
        .insert({
          center_id: profile.center_id,
          patient_id: params.patient_id,
          template_id: params.template_id,
          professional_id: profile.id,
          sent_via: params.sent_via || null,
          sent_to: params.sent_to || null,
          sent_at: params.sent_via ? new Date().toISOString() : null,
          expires_at: expiresAt,
        })
        .select(`
          *,
          patient:patients(id, first_name, last_name, email, phone),
          template:assessment_templates(id, code, name)
        `)
        .single();

      if (error) throw error;
      return data as Assessment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Evaluación creada correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear la evaluación');
      console.error(error);
    },
  });

  const revokeAssessment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assessments')
        .update({ status: 'revoked' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Evaluación revocada');
    },
    onError: (error) => {
      toast.error('Error al revocar la evaluación');
      console.error(error);
    },
  });

  const deleteAssessment = useMutation({
    mutationFn: async (id: string) => {
      // Primero eliminar las respuestas asociadas
      const { error: responseError } = await supabase
        .from('assessment_responses')
        .delete()
        .eq('assessment_id', id);

      if (responseError) throw responseError;

      // Luego eliminar la evaluación
      const { error } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Evaluación eliminada');
    },
    onError: (error) => {
      toast.error('Error al eliminar la evaluación');
      console.error(error);
    },
  });

  const updateExpiration = useMutation({
    mutationFn: async ({ id, expires_at }: { id: string; expires_at: string }) => {
      const updates: { expires_at: string; status?: 'pending' } = { expires_at };

      // If new expiration is in the future and status is 'expired', reactivate to 'pending'
      if (new Date(expires_at) > new Date()) {
        const { data: current } = await supabase
          .from('assessments')
          .select('status')
          .eq('id', id)
          .single();
        if (current?.status === 'expired') {
          updates.status = 'pending';
        }
      }

      const { error } = await supabase
        .from('assessments')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Fecha de caducidad actualizada');
    },
    onError: (error) => {
      toast.error('Error al actualizar la fecha de caducidad');
      console.error(error);
    },
  });

  const resendAssessment = useMutation({
    mutationFn: async ({ id, sent_via, sent_to }: { id: string; sent_via: 'email' | 'whatsapp'; sent_to: string }) => {
      const { error } = await supabase
        .from('assessments')
        .update({
          sent_via,
          sent_to,
          sent_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      toast.success('Evaluación reenviada');
    },
    onError: (error) => {
      toast.error('Error al reenviar la evaluación');
      console.error(error);
    },
  });

  return {
    assessments,
    isLoading,
    createAssessment,
    revokeAssessment,
    deleteAssessment,
    resendAssessment,
  };
}
