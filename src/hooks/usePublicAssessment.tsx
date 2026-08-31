import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PublicAssessment {
  id: string;
  status: 'pending' | 'completed' | 'expired' | 'revoked';
  access_token: string;
  expires_at: string;
  completed_at: string | null;
  template: {
    id: string;
    code: string;
    name: string;
    instructions: string | null;
    items: { index: number; text: string }[];
    scoring: Record<string, { items: number[]; label: string }>;
    response_min: number;
    response_max: number;
    min_label: string | null;
    max_label: string | null;
  };
}

interface SubmitParams {
  // Most assessments send { [questionIndex]: numericScore }; EMO sends a rich
  // structured object (EMOAnswers). Both are just forwarded as opaque JSON,
  // so the type here is intentionally permissive.
  answers: Record<number, number> | object;
  examples?: Record<number, string>;
}

export function usePublicAssessment(token: string | undefined) {
  const queryClient = useQueryClient();

  const { data: assessment, isLoading, error } = useQuery({
    queryKey: ['public-assessment', token],
    queryFn: async () => {
      if (!token) throw new Error('No token');

      const { data, error } = await supabase
        .from('assessments')
        .select(`
          id,
          status,
          access_token,
          expires_at,
          completed_at,
          template:assessment_templates(id, code, name, instructions, items, scoring, response_min, response_max, min_label, max_label)
        `)
        .eq('access_token', token)
        .setHeader('x-assessment-token', token)
        .single();

      if (error) throw error;

      // PostgREST may return embedded relations as an array depending on relationship metadata.
      // Normalize to an object so the public page can reliably read template.response_min/max.
      const raw = data as Omit<PublicAssessment, 'template'> & {
        template: PublicAssessment['template'] | PublicAssessment['template'][];
      };
      const template = Array.isArray(raw?.template) ? raw.template[0] : raw?.template;

      return { ...raw, template } as PublicAssessment;
    },
    enabled: !!token,
  });

  const submitResponses = useMutation({
    mutationFn: async ({ answers, examples }: SubmitParams) => {
      if (!token) throw new Error('No token');

      const { data, error } = await supabase.functions.invoke('submit-assessment-response', {
        body: { token, answers, examples },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al enviar respuestas');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-assessment', token] });
      toast.success('Respuestas enviadas correctamente');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Error al enviar respuestas');
      console.error(error);
    },
  });

  const isExpired = assessment ? new Date(assessment.expires_at) < new Date() : false;
  const isCompleted = assessment?.status === 'completed';
  const isRevoked = assessment?.status === 'revoked';
  const canSubmit = assessment && !isExpired && !isCompleted && !isRevoked && assessment.status === 'pending';

  return {
    assessment,
    isLoading,
    error,
    isExpired,
    isCompleted,
    isRevoked,
    canSubmit,
    submitResponses,
  };
}
