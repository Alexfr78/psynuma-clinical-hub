import { useState } from 'react';
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

/**
 * Comprobación de consentimiento previa a generar/enviar informes clínicos con IA, y el envío
 * al paciente por WhatsApp/email del documento ya generado.
 *
 * La orquestación de generación (antes "3 capas": extracción base → informe clínico →
 * informe paciente, con `analyze()` gestionando el estado de cada una) se ha movido a
 * `useAIDocuments` (`@/hooks/useAIDocuments`), que habla con la edge function rediseñada por
 * plantillas de documento. Este hook se queda solo con lo que el encargo pide conservar tal
 * cual: la comprobación de consentimiento (es UX — la autoridad real está en el servidor, que
 * falla cerrado) y el envío del informe ya generado al paciente.
 */
export function useTranscriptionAnalysis(options: UseTranscriptionAnalysisOptions = {}) {
  const { sessionId, patientPhone, patientEmail, isOpen } = options;
  const { centerId } = useCenter();

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

  const [isSending, setIsSending] = useState(false);

  /** Envía el markdown (vigente, editado o no) de un documento ya generado al paciente. */
  const sendPatientReport = async (channel: 'whatsapp' | 'email', reportContent: string) => {
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

  return {
    isSending,
    consent,
    sendPatientReport,
    downloadTxt,
  };
}
