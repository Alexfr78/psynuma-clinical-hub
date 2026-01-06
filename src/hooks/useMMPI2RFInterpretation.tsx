import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MMPI2RFInterpretationParams {
  assessmentId: string;
  responses: Record<number, number>;
  clinicalContext?: string;
  patientAge?: number;
  patientGender?: string;
  consultationReason?: string;
}

export interface MMPI2RFInterpretation {
  validez: {
    estado: 'válido' | 'cuestionable' | 'inválido';
    observaciones: string;
    escalasProblematicas?: string[];
  };
  perfilClinico: {
    escalasElevadas: Array<{
      escala: string;
      puntuacionT: number;
      interpretacion: string;
    }>;
    formulacionIntegrada: string;
  };
  riesgos: {
    nivelGlobal: 'bajo' | 'moderado' | 'alto';
    suicidio: { nivel: string; observaciones: string };
    violencia: { nivel: string; observaciones: string };
    descompensacion: { nivel: string; observaciones: string };
  };
  hipotesisDiagnosticas: string[];
  intervenciones: {
    prioridades: string[];
    enfoqueSugerido: string;
    precauciones: string[];
  };
  resumenEjecutivo: string;
  rawInterpretation?: string;
}

export function useMMPI2RFInterpretation() {
  const queryClient = useQueryClient();

  const generateInterpretation = useMutation({
    mutationFn: async (params: MMPI2RFInterpretationParams) => {
      const { data, error } = await supabase.functions.invoke('interpret-mmpi2rf-results', {
        body: params,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al generar interpretación');

      return data.interpretation as MMPI2RFInterpretation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-detail', variables.assessmentId] });
      toast.success('Interpretación MMPI-2-RF generada correctamente');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error al generar interpretación';
      toast.error(message);
      console.error('MMPI-2-RF interpretation error:', error);
    },
  });

  return {
    generateInterpretation,
    isGenerating: generateInterpretation.isPending,
  };
}
