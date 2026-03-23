import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseTranscriptionAnalysisOptions {
  sessionId?: string;
  patientPhone?: string;
  patientEmail?: string;
}

export function useTranscriptionAnalysis(options: UseTranscriptionAnalysisOptions = {}) {
  const { sessionId, patientPhone, patientEmail } = options;
  const [baseAnalysis, setBaseAnalysis] = useState<string | null>(null);
  const [clinicalReport, setClinicalReport] = useState<string | null>(null);
  const [patientReport, setPatientReport] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
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
        if (sessionId) {
          await supabase
            .from('sessions')
            .update({
              notes: content,
              ai_summary_clinical: content,
              transcript_processed_at: new Date().toISOString(),
            } as any)
            .eq('id', sessionId);
        }
      } else if (layer === 3) {
        setPatientReport(content);
        toast.success('Informe para paciente generado');
        if (sessionId) {
          await supabase
            .from('sessions')
            .update({ ai_summary_patient: content } as any)
            .eq('id', sessionId);
        }
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

  const saveClinicalReport = async (content: string) => {
    if (!sessionId) return;
    setIsSaving(true);
    try {
      await supabase
        .from('sessions')
        .update({ notes: content, ai_summary_clinical: content } as any)
        .eq('id', sessionId);
      setClinicalReport(content);
      toast.success('Informe clínico guardado');
    } catch {
      toast.error('Error al guardar el informe');
    } finally {
      setIsSaving(false);
    }
  };

  const savePatientReport = async (content: string) => {
    if (!sessionId) return;
    setIsSaving(true);
    try {
      await supabase
        .from('sessions')
        .update({ ai_summary_patient: content } as any)
        .eq('id', sessionId);
      setPatientReport(content);
      toast.success('Informe del paciente guardado');
    } catch {
      toast.error('Error al guardar el informe');
    } finally {
      setIsSaving(false);
    }
  };

  const sendPatientReport = async (channel: 'whatsapp' | 'email') => {
    if (!sessionId || !patientReport) return;

    const recipient = channel === 'whatsapp' ? patientPhone : patientEmail;
    if (!recipient) {
      toast.error(
        channel === 'whatsapp'
          ? 'El contacto no tiene teléfono registrado'
          : 'El contacto no tiene email registrado'
      );
      return;
    }

    setIsSending(true);
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          sessionId,
          channel,
          recipient,
          subject: channel === 'email' ? 'Resumen de tu sesión' : undefined,
          message: patientReport,
        },
      });
      toast.success(`Informe enviado por ${channel === 'whatsapp' ? 'WhatsApp' : 'email'}`);
    } catch {
      toast.error('Error al enviar el informe');
    } finally {
      setIsSending(false);
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
    isSaving,
    isSending,
    currentLayer,
    analyze,
    saveClinicalReport,
    savePatientReport,
    sendPatientReport,
    downloadTxt,
    reset,
  };
}
