import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePatientPartner } from './usePatientRelationships';

export interface AssessmentResultSummary {
  assessmentId: string;
  completedAt: string | null;
  factorScores: Record<string, number>;
}

/**
 * Evaluaciones completadas de un contacto con una plantilla dada (p. ej. 'DAS'),
 * de la más reciente a la más antigua. Sirve para superponer a la pareja.
 */
export function usePatientResultsByCode(patientId: string | undefined, templateCode: string) {
  return useQuery({
    queryKey: ['patient-results-by-code', patientId, templateCode],
    queryFn: async (): Promise<AssessmentResultSummary[]> => {
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
        .eq('template.code', templateCode)
        .order('completed_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).flatMap(row => {
        const response = Array.isArray(row.response) ? row.response[0] : row.response;
        const factorScores = response?.factor_scores as Record<string, number> | null | undefined;
        if (!factorScores || Object.keys(factorScores).length === 0) return [];
        return [{ assessmentId: row.id, completedAt: row.completed_at, factorScores }];
      });
    },
    enabled: !!patientId,
  });
}

/** Nombre de la pareja vinculada y sus evaluaciones completadas con esa plantilla. */
export function usePartnerResultsByCode(patientId: string | undefined, templateCode: string) {
  const { data: couple } = usePatientPartner(patientId);
  const partner = couple?.partner;
  const { data: results = [] } = usePatientResultsByCode(partner?.id, templateCode);
  const partnerName = partner ? `${partner.first_name} ${partner.last_name}`.trim() : '';
  return { partnerName, results };
}
