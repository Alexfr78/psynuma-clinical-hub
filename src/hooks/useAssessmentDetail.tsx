import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AssessmentDetailPatient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
}

export interface AssessmentDetailTemplate {
  id: string;
  code: string;
  name: string;
  items: { index: number; text: string }[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  interpretations: Record<string, { interpretation: string; intervention: string }> | null;
}

export interface AssessmentDetailResponse {
  id: string;
  answers: Record<string, number>;
  factor_scores: Record<string, number>;
  flags: Record<string, boolean> | null;
  created_at: string;
}

export interface AssessmentDetail {
  id: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string;
  patient: AssessmentDetailPatient;
  template: AssessmentDetailTemplate;
  professional: { id: string; first_name: string; last_name: string };
  response: AssessmentDetailResponse | null;
}

export function useAssessmentDetail(assessmentId: string | undefined) {
  return useQuery({
    queryKey: ['assessment-detail', assessmentId],
    queryFn: async () => {
      if (!assessmentId) throw new Error('Assessment ID requerido');

      const { data, error } = await supabase
        .from('assessments')
        .select(`
          id,
          status,
          created_at,
          sent_at,
          completed_at,
          expires_at,
          patient:patients(id, first_name, last_name, email),
          template:assessment_templates(id, code, name, items, scoring, interpretations),
          professional:profiles(id, first_name, last_name),
          response:assessment_responses(id, answers, factor_scores, flags, created_at)
        `)
        .eq('id', assessmentId)
        .single();

      if (error) throw error;
      if (!data) throw new Error('Evaluación no encontrada');

      // Transformar response de array a objeto único (relación 1:1)
      const response = Array.isArray(data.response) && data.response.length > 0
        ? data.response[0]
        : null;

      return {
        ...data,
        patient: data.patient as unknown as AssessmentDetailPatient,
        template: {
          ...data.template,
          items: (data.template as any)?.items || [],
          scoring: (data.template as any)?.scoring || {},
          interpretations: (data.template as any)?.interpretations || null,
        } as AssessmentDetailTemplate,
        professional: data.professional as unknown as { id: string; first_name: string; last_name: string },
        response: response ? {
          ...response,
          answers: (response as any).answers || {},
          factor_scores: (response as any).factor_scores || {},
          flags: (response as any).flags || null,
        } as AssessmentDetailResponse : null,
      } as AssessmentDetail;
    },
    enabled: !!assessmentId,
  });
}
