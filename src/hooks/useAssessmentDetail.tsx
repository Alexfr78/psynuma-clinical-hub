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
      const parsedResponse = responseData ? {
        id: (responseData as any).id,
        answers: typeof (responseData as any).answers === 'string' 
          ? JSON.parse((responseData as any).answers) 
          : (responseData as any).answers || {},
        factor_scores: typeof (responseData as any).factor_scores === 'string'
          ? JSON.parse((responseData as any).factor_scores)
          : (responseData as any).factor_scores || {},
        flags: typeof (responseData as any).flags === 'string'
          ? JSON.parse((responseData as any).flags)
          : (responseData as any).flags || null,
        metadata: typeof (responseData as any).metadata === 'string'
          ? JSON.parse((responseData as any).metadata)
          : (responseData as any).metadata || null,
        created_at: (responseData as any).created_at,
      } as AssessmentDetailResponse : null;

      return {
        id: data.id,
        status: data.status,
        created_at: data.created_at,
        sent_at: data.sent_at,
        completed_at: data.completed_at,
        expires_at: data.expires_at,
        patient: data.patient as unknown as AssessmentDetailPatient,
        template: {
          id: (data.template as any)?.id,
          code: (data.template as any)?.code,
          name: (data.template as any)?.name,
          items: (data.template as any)?.items || [],
          scoring: (data.template as any)?.scoring || {},
          interpretations: (data.template as any)?.interpretations || null,
          response_min: (data.template as any)?.response_min ?? 1,
          response_max: (data.template as any)?.response_max ?? 7,
          chart_full_mark: (data.template as any)?.chart_full_mark ?? 7,
          flag_threshold: (data.template as any)?.flag_threshold ?? 4,
          min_label: (data.template as any)?.min_label ?? null,
          max_label: (data.template as any)?.max_label ?? null,
        } as AssessmentDetailTemplate,
        professional: data.professional as unknown as { id: string; first_name: string; last_name: string },
        response: parsedResponse,
      } as AssessmentDetail;
    },
    enabled: !!assessmentId,
  });
}