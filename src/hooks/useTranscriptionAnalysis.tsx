import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCenter } from './useCenter';

interface UseTranscriptionAnalysisOptions {
  sessionId?: string;
  patientPhone?: string;
  patientEmail?: string;
  isOpen?: boolean;
}

export function useTranscriptionAnalysis(options: UseTranscriptionAnalysisOptions = {}) {
  const { sessionId, patientPhone, patientEmail, isOpen } = options;
  const { centerId } = useCenter();
  const [baseAnalysis, setBaseAnalysis] = useState<string | null>(null);
  const [clinicalReport, setClinicalReport] = useState<string | null>(null);
  const [patientReport, setPatientReport] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load existing reports from the session when dialog opens
  useEffect(() => {
    if (!isOpen || !sessionId) {
      setIsLoaded(false);
      return;
    }

    const loadExisting = async () => {
      try {
        const { data } = await supabase
          .from('sessions')
          .select('ai_summary_clinical, ai_summary_patient, transcript_processed_at')
          .eq('id', sessionId)
          .single();

        if (data) {
          const clinical = (data as any).ai_summary_clinical;
          const patient = (data as any).ai_summary_patient;
          if (clinical) {
            setBaseAnalysis(clinical);
            setClinicalReport(clinical);
          }
          if (patient) {
            setPatientReport(patient);
          }
        }
      } catch {
        // Silently fail — user can still generate new reports
      } finally {
        setIsLoaded(true);
      }
    };

    loadExisting();
  }, [isOpen, sessionId]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [currentLayer, setCurrentLayer] = useState<number | null>(null);

  const analyze = async (
    transcription: string,
    layer: 1 | 2 | 3,
    baseOverride?: string,
  ): Promise<string | null> => {
    setIsAnalyzing(true);
    setCurrentLayer(layer);

    try {
      const body: Record<string, unknown> = { transcription, layer, centerId };
      if (layer === 2 || layer === 3) {
        const base = baseOverride || baseAnalysis;
        if (!base) {
          toast.error('Primero debes generar la extracción clínica base (Capa 1)');
          return null;
        }
        body.baseAnalysis = base;
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

      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al analizar la transcripción';
      toast.error(message);
      console.error('Transcription analysis error:', err);
      return null;
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
    if (!sessionId || !patientReport || !centerId) return;

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
      // First create a notification record, then invoke send-notification with notificationId
      const { data: session } = await supabase
        .from('sessions')
        .select('patient_id')
        .eq('id', sessionId)
        .single();

      const { data: notification, error: insertError } = await supabase
        .from('notifications')
        .insert({
          center_id: centerId,
          session_id: sessionId,
          patient_id: session?.patient_id,
          type: channel,
          recipient,
          subject: channel === 'email' ? 'Resumen de tu sesión' : undefined,
          message: patientReport,
          status: 'pending' as const,
        })
        .select('id')
        .single();

      if (insertError || !notification) throw insertError || new Error('No se pudo crear la notificación');

      await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
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
