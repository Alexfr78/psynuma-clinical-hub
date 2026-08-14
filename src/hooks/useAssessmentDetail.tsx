import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AssessmentDetailPatient {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

export interface AssessmentDetailTemplate {
  id: string;
  code: string;
  name: string;
  items: { index: number; text: string }[];
  scoring: Record<string, { items: number[]; label: string; description?: string }>;
  interpretations: Record<string, { interpretation: string; intervention: string }> | null;
  response_min: number;
  response_max: number;
  chart_full_mark: number;
  flag_threshold: number;
  min_label: string | null;
  max_label: string | null;
}

export interface AssessmentDetailResponse {
  id: string;
  answers: Record<string, number>;
  factor_scores: Record<string, number>;
  flags: Record<string, boolean> | null;
  metadata: Record<string, unknown> | null;
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
          patient:patients(id, first_name, last_name, email, date_of_birth, gender),
          template:assessment_templates(id, code, name, items, scoring, interpretations, response_min, response_max, chart_full_mark, flag_threshold, min_label, max_label),
          professional:profiles(id, first_name, last_name),
          response:assessment_responses(id, answers, factor_scores, flags, metadata, created_at)
        `)
        .eq('id', assessmentId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Evaluación no encontrada');

      // Transformar response de array a objeto único (relación 1:1)
      const responseData = Array.isArray(data.response) && data.response.length > 0
        ? data.response[0]
        : data.response;

      // Parsear JSON fields correctamente
      const rawResponse = responseData as unknown as {
        id: string;
        answers: string | Record<string, number> | null;
        factor_scores: string | Record<string, number> | null;
        flags: string | Record<string, boolean> | null;
        metadata: string | Record<string, unknown> | null;
        created_at: string;
      } | null;
      const parsedResponse = rawResponse ? {
        id: rawResponse.id,
        answers: typeof rawResponse.answers === 'string'
          ? JSON.parse(rawResponse.answers)
          : rawResponse.answers || {},
        factor_scores: typeof rawResponse.factor_scores === 'string'
          ? JSON.parse(rawResponse.factor_scores)
          : rawResponse.factor_scores || {},
        flags: typeof rawResponse.flags === 'string'
          ? JSON.parse(rawResponse.flags)
          : rawResponse.flags || null,
        metadata: typeof rawResponse.metadata === 'string'
          ? JSON.parse(rawResponse.metadata)
          : rawResponse.metadata || null,
        created_at: rawResponse.created_at,
      } as AssessmentDetailResponse : null;

      const tpl = data.template as unknown as Partial<AssessmentDetailTemplate> | null;
      return {
        id: data.id,
        status: data.status,
        created_at: data.created_at,
        sent_at: data.sent_at,
        completed_at: data.completed_at,
        expires_at: data.expires_at,
        patient: data.patient as unknown as AssessmentDetailPatient,
        template: {
          id: tpl?.id,
          code: tpl?.code,
          name: tpl?.name,
          items: tpl?.items || [],
          scoring: tpl?.scoring || {},
          interpretations: tpl?.interpretations || null,
          response_min: tpl?.response_min ?? 1,
          response_max: tpl?.response_max ?? 7,
          chart_full_mark: tpl?.chart_full_mark ?? 7,
          flag_threshold: tpl?.flag_threshold ?? 4,
          min_label: tpl?.min_label ?? null,
          max_label: tpl?.max_label ?? null,
        } as AssessmentDetailTemplate,
        professional: data.professional as unknown as { id: string; first_name: string; last_name: string },
        response: parsedResponse,
      } as AssessmentDetail;
    },
    enabled: !!assessmentId,
  });
}