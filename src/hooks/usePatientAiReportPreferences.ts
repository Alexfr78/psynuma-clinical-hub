import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { qk } from '@/lib/query-keys';

export function usePatientAiReportPreferences(patientId: string | undefined, enabled = true) {
  const queryClient = useQueryClient();
  const preferenceQuery = useQuery({
    queryKey: qk.patientAiReportPreferences.byPatient(patientId),
    queryFn: async (): Promise<string[] | null> => {
      const { data, error } = await supabase
        .from('patients')
        .select('ai_patient_document_keys')
        .eq('id', patientId!)
        .single();

      if (error) throw error;
      return data.ai_patient_document_keys;
    },
    enabled: enabled && !!patientId,
  });

  const saveMutation = useMutation({
    mutationFn: async (documentKeys: string[] | null) => {
      if (!patientId) throw new Error('No se pudo determinar el contacto.');

      const { data, error } = await supabase
        .from('patients')
        .update({ ai_patient_document_keys: documentKeys })
        .eq('id', patientId)
        .select('ai_patient_document_keys')
        .single();

      if (error) throw error;
      return data.ai_patient_document_keys;
    },
    onSuccess: (documentKeys) => {
      queryClient.setQueryData(qk.patientAiReportPreferences.byPatient(patientId), documentKeys);
      queryClient.invalidateQueries({ queryKey: qk.patient.byPatient(patientId) });
      queryClient.invalidateQueries({ queryKey: qk.patients.all });
    },
  });

  return {
    documentKeys: preferenceQuery.data,
    isLoading: preferenceQuery.isLoading,
    error: preferenceQuery.error,
    save: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
  };
}
