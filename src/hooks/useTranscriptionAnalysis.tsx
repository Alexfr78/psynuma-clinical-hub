import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useTranscriptionAnalysis() {
  const [baseAnalysis, setBaseAnalysis] = useState<string | null>(null);
  const [clinicalReport, setClinicalReport] = useState<string | null>(null);
  const [patientReport, setPatientReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<number | null>(null);

  const analyze = async (transcription: string, layer: 1 | 2 | 3) => {
    setIsAnalyzing(true);
    setCurrentLayer(layer);

    try {
      const body: Record<string, unknown> = { transcription, layer };
      if (layer === 2 || layer === 3) {
        if (!baseAnalysis) {
          toast.error('Primero debes generar la extracción clínica base (Capa 1)');
          return;
        }
        body.baseAnalysis = baseAnalysis;
      }

      const { data, error } = await supabase.functions.invoke('analyze-session-transcription', { body });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al analizar');

      const content = data.content as string;

      if (layer === 1) {
        setBaseAnalysis(content);
        toast.success('Extracción clínica base completada');
      } else if (layer === 2) {
        setClinicalReport(content);
        toast.success('Informe clínico generado');
      } else if (layer === 3) {
        setPatientReport(content);
        toast.success('Informe para paciente generado');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al analizar la transcripción';
      toast.error(message);
      console.error('Transcription analysis error:', err);
    } finally {
      setIsAnalyzing(false);
      setCurrentLayer(null);
    }
  };

  const downloadTxt = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setBaseAnalysis(null);
    setClinicalReport(null);
    setPatientReport(null);
  };

  return {
    baseAnalysis,
    clinicalReport,
    patientReport,
    isAnalyzing,
    currentLayer,
    analyze,
    downloadTxt,
    reset,
  };
}
