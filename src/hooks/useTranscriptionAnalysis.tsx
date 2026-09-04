import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCenter } from './useCenter';
import { checkPatientConsent, type ConsentCheckResult, type ConsentPurpose } from '@/lib/consent-verification';

// The exact, literal subject used for every clinical AI report send (email
// subject shown to the patient, and — for WhatsApp, where `subject` is not
// otherwise used by the app — an internal marker only). Kept for backward
// compatibility with send-notification's legacy fallback detection, but the
// column below (`purpose`) is now the primary signal it relies on. Keep this
// in sync with CLINICAL_REPORT_SUBJECT_MARKER in
// supabase/functions/send-notification/index.ts.
const CLINICAL_REPORT_SUBJECT_MARKER = 'Resumen de tu sesión';

// Explicit purpose marker (see migration in
// migracion-notifications-purpose.sql). send-notification's consent gate
// checks this column first, on every channel, to recognize a clinical AI
// report delivery among the many other notification kinds it processes.
const CLINICAL_REPORT_PURPOSE = 'clinical_report';

const CONSENT_PURPOSES: ConsentPurpose[] = ['ai_processing', 'report_generation', 'channel_whatsapp', 'channel_email'];

function consentBlockReason(purpose: ConsentPurpose, result: ConsentCheckResult | undefined): string | null {
  if (!result || result.granted) return null;

  const action =
    purpose === 'ai_processing' || purpose === 'report_generation'
      ? 'generar informes con IA'
      : purpose === 'channel_whatsapp'
        ? 'el envío por WhatsApp'
        : 'el envío por email';

  switch (result.reason) {
    case 'no_consent':
      return `Este contacto no tiene un consentimiento registrado. No es posible ${action}. Solicita un nuevo consentimiento.`;
    case 'not_signed':
      return `El consentimiento de este contacto está pendiente de firma. No es posible ${action} hasta que lo firme.`;
    case 'revoked':
      return `Este contacto ha revocado su consentimiento. No es posible ${action}.`;
    case 'expired':
      return `El consentimiento de este contacto ha caducado. No es posible ${action}. Solicita uno nuevo.`;
    case 'purpose_not_granted':
      return purpose.startsWith('channel_')
        ? `Este contacto no ha autorizado ${action}. Puedes probar otro canal o solicitar un nuevo consentimiento.`
        : `Este contacto no ha autorizado ${action}.`;
    default:
      return `No es posible ${action}: consentimiento no concedido.`;
  }
}

export interface TranscriptionConsentStatus {
  isLoading: boolean;
  patientId: string | null;
  canGenerate: boolean;
  generateBlockReason: string | null;
  canSendWhatsapp: boolean;
  whatsappBlockReason: string | null;
  canSendEmail: boolean;
  emailBlockReason: string | null;
}

interface UseTranscriptionAnalysisOptions {
  sessionId?: string;
  patientPhone?: string;
  patientEmail?: string;
  isOpen?: boolean;
}

export function useTranscriptionAnalysis(options: UseTranscriptionAnalysisOptions = {}) {
  const { sessionId, patientPhone, patientEmail, isOpen } = options;
  const { centerId, center } = useCenter();
  const analysisMode = center?.ai_analysis_mode || 'layered';
  const [baseAnalysis, setBaseAnalysis] = useState<string | null>(null);
  const [clinicalReport, setClinicalReport] = useState<string | null>(null);
  const [patientReport, setPatientReport] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Resolve the patient behind this session, then check every consent purpose
  // relevant to this dialog up front, so buttons can be disabled proactively
  // instead of letting the user hit the server-side block. The server check
  // in analyze-session-transcription / send-notification is the one that
  // actually matters — this is only for a clearer UX.
  const { data: consentPatientId } = useQuery({
    queryKey: ['transcription-analysis-patient-id', sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from('sessions')
        .select('patient_id')
        .eq('id', sessionId!)
        .maybeSingle();
      return (data as { patient_id: string | null } | null)?.patient_id ?? null;
    },
    enabled: !!isOpen && !!sessionId,
    staleTime: 30_000,
  });

  const { data: consentResults, isLoading: isConsentLoading } = useQuery({
    queryKey: ['patient-consent-status', consentPatientId, ...CONSENT_PURPOSES],
    queryFn: async () => {
      const entries = await Promise.all(
        CONSENT_PURPOSES.map(async (purpose) => [purpose, await checkPatientConsent(supabase, consentPatientId!, purpose)] as const)
      );
      return Object.fromEntries(entries) as Record<ConsentPurpose, ConsentCheckResult>;
    },
    enabled: !!consentPatientId,
    staleTime: 30_000,
  });

  const consent: TranscriptionConsentStatus = {
    isLoading: !!isOpen && !!sessionId && (isConsentLoading || !consentResults),
    patientId: consentPatientId ?? null,
    canGenerate: !!consentResults && !!consentResults.ai_processing?.granted && !!consentResults.report_generation?.granted,
    generateBlockReason: !consentResults
      ? null
      : consentBlockReason('ai_processing', consentResults.ai_processing) || consentBlockReason('report_generation', consentResults.report_generation),
    canSendWhatsapp: !!consentResults && !!consentResults.channel_whatsapp?.granted,
    whatsappBlockReason: consentResults ? consentBlockReason('channel_whatsapp', consentResults.channel_whatsapp) : null,
    canSendEmail: !!consentResults && !!consentResults.channel_email?.granted,
    emailBlockReason: consentResults ? consentBlockReason('channel_email', consentResults.channel_email) : null,
  };

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
          const clinical = (data as { ai_summary_clinical?: string | null }).ai_summary_clinical;
          const patient = (data as { ai_summary_patient?: string | null }).ai_summary_patient;
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

  const parseSingleModeReports = (payload: unknown): { clinical: string; patient: string } | null => {
    if (!payload || typeof payload !== 'object') return null;

    const record = payload as Record<string, unknown>;
    if (typeof record.clinical === 'string' && typeof record.patient === 'string') {
      return {
        clinical: record.clinical.trim(),
        patient: record.patient.trim(),
      };
    }

    if (typeof record.content !== 'string') return null;

    const cleaned = record.content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    const candidates = [cleaned];
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        if (typeof parsed.clinical === 'string' && typeof parsed.patient === 'string') {
          return {
            clinical: parsed.clinical.trim(),
            patient: parsed.patient.trim(),
          };
        }
      } catch {
        continue;
      }
    }

    return null;
  };

  const analyze = async (
    transcription: string,
    layer: 1 | 2 | 3,
    baseOverride?: string,
  ): Promise<string | null> => {
    // Client-side defense in depth: the server (analyze-session-transcription)
    // enforces this for real, but checking here avoids a round trip that would
    // just come back as an error.
    if (consent.generateBlockReason) {
      toast.error(consent.generateBlockReason);
      return null;
    }

    setIsAnalyzing(true);
    setCurrentLayer(layer);

    try {
      const body: Record<string, unknown> = { transcription, layer, centerId, sessionId };
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

      const isSingleResponse = data.mode === 'single' || (analysisMode === 'single' && layer === 1);

      if (isSingleResponse) {
        // Try to extract clinical/patient from the response in multiple ways
        let clinical: string | null = null;
        let patient: string | null = null;

        // Method 1: top-level keys from edge function
        if (typeof data.clinical === 'string' && data.clinical.trim()) {
          clinical = data.clinical.trim();
        }
        if (typeof data.patient === 'string' && data.patient.trim()) {
          patient = data.patient.trim();
        }

        // Method 2: parse from content field if top-level keys missing
        if (!clinical && typeof data.content === 'string') {
          const parsed = parseSingleModeReports(data);
          if (parsed) {
            clinical = parsed.clinical;
            patient = parsed.patient;
          }
        }

        // Method 3: if we only have content but couldn't parse JSON, use it as clinical
        if (!clinical && typeof data.content === 'string' && data.content.trim()) {
          console.warn('[transcription] Single mode: could not parse JSON, using raw content as clinical report');
          clinical = data.content.trim();
          patient = '';
        }

        if (clinical) {
          setBaseAnalysis(null);
          setClinicalReport(clinical);
          setPatientReport(patient || '');
          toast.success(patient ? 'Informes generados' : 'Informe clínico generado (el informe del paciente requiere regeneración)');
          if (sessionId) {
            await supabase
              .from('sessions')
              .update({
                notes: clinical,
                ai_summary_clinical: clinical,
                ai_summary_patient: patient || null,
                transcript_processed_at: new Date().toISOString(),
              })
              .eq('id', sessionId);
          }
          return clinical;
        }

        throw new Error('La respuesta del análisis directo no contenía informes válidos.');
      }

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
            })
            .eq('id', sessionId);
        }
      } else if (layer === 3) {
        setPatientReport(content);
        toast.success('Informe para paciente generado');
        if (sessionId) {
          await supabase
            .from('sessions')
            .update({ ai_summary_patient: content })
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
        .update({ notes: content, ai_summary_clinical: content })
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
        .update({ ai_summary_patient: content })
        .eq('id', sessionId);
      setPatientReport(content);
      toast.success('Informe del paciente guardado');
    } catch {
      toast.error('Error al guardar el informe');
    } finally {
      setIsSaving(false);
    }
  };

  const sendPatientReport = async (channel: 'whatsapp' | 'email', contentOverride?: string) => {
    const reportContent = contentOverride || patientReport;
    if (!sessionId || !reportContent || !centerId) {
      console.warn('[sendPatientReport] Missing data:', { sessionId: !!sessionId, reportContent: !!reportContent, centerId: !!centerId });
      toast.error('No hay informe del paciente para enviar');
      return;
    }

    const recipient = channel === 'whatsapp' ? patientPhone : patientEmail;
    if (!recipient) {
      toast.error(
        channel === 'whatsapp'
          ? 'El contacto no tiene teléfono registrado'
          : 'El contacto no tiene email registrado'
      );
      return;
    }

    // Client-side defense in depth — send-notification enforces this for real.
    const blockReason = channel === 'whatsapp' ? consent.whatsappBlockReason : consent.emailBlockReason;
    if (blockReason) {
      toast.error(blockReason);
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
          // Set on both channels: it's the real email subject shown to the
          // patient, and — for WhatsApp, where `subject` isn't otherwise used
          // — an internal marker. Kept for the legacy fallback in
          // send-notification's consent gate; `purpose` below is now the
          // primary signal.
          subject: CLINICAL_REPORT_SUBJECT_MARKER,
          // Primary signal for send-notification's consent gate — set on
          // every channel so a clinical report can never bypass it by going
          // out over a channel that doesn't otherwise use `subject`.
          purpose: CLINICAL_REPORT_PURPOSE,
          message: reportContent,
          status: 'pending' as const,
        })
        .select('id')
        .single();

      if (insertError || !notification) throw insertError || new Error('No se pudo crear la notificación');

      const { data: sendResult, error: sendError } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
      });

      const resultItem = sendResult?.results?.[0];
      if (sendError || sendResult?.ok === false || resultItem?.ok === false) {
        toast.error(resultItem?.error || 'No se pudo enviar el informe. Revisa el consentimiento del contacto.');
        return;
      }

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
    setIsLoaded(false);
  };

  return {
    baseAnalysis,
    clinicalReport,
    patientReport,
    isAnalyzing,
    isSaving,
    isSending,
    currentLayer,
    consent,
    analyze,
    saveClinicalReport,
    savePatientReport,
    sendPatientReport,
    downloadTxt,
    reset,
  };
}
