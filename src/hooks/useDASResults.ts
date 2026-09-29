import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DASResultSummary {
  assessmentId: string;
  completedAt: string | null;
  factorScores: Record<string, number>;
}

/** DAS completados de un contacto, del más reciente al más antiguo. */
export function usePatientDASResults(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-das-results', patientId],
    queryFn: async (): Promise<DASResultSummary[]> => {
      if (!patientId) return [];
      const { data, error } = await supabase
        .from('assessments')
        .select(`
          id,
          completed_at,
          template:assessment_templates!inner(code),
          response:assessment_responses(factor_scores)
        `)
        .eq('patient_id', patientId)
        .eq('status', 'completed')
        .eq('template.code', 'DAS')
        .order('completed_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).flatMap(row => {
        const response = Array.isArray(row.response) ? row.response[0] : row.response;
        const factorScores = response?.factor_scores as Record<string, number> | null | undefined;
        if (!factorScores || factorScores['TOTAL'] === undefined) return [];
        return [{ assessmentId: row.id, completedAt: row.completed_at, factorScores }];
      });
    },
    enabled: !!patientId,
  });
}
