import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PAIInterpretationParams {
  assessmentId: string;
  tScores: Record<string, number>;
  clinicalContext?: string;
  patientAge?: number;
  patientGender?: string;
  consultationReason?: string;
}

export interface PAIInterpretation {
  validez: {
    estado: 'válido' | 'cuestionable' | 'inválido';
    observaciones: string;
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

export function usePAIInterpretation() {
  const queryClient = useQueryClient();

  const generateInterpretation = useMutation({
    mutationFn: async (params: PAIInterpretationParams) => {
      const { data, error } = await supabase.functions.invoke('interpret-pai-results', {
        body: params,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al generar interpretación');

      return data.interpretation as PAIInterpretation;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] });
      queryClient.invalidateQueries({ queryKey: ['assessment-detail', variables.assessmentId] });
      toast.success('Interpretación generada correctamente');
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Error al generar interpretación';
      toast.error(message);
      console.error('PAI interpretation error:', error);
    },
  });

  return {
    generateInterpretation,
    isGenerating: generateInterpretation.isPending,
  };
}
