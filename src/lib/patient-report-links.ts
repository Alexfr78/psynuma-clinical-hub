import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

/**
 * El informe del paciente ya no viaja dentro del mensaje de WhatsApp/email —
 * solo un aviso neutro con un enlace a `/informe/:token` (ver
 * `PatientReportView.tsx` y la edge function `view-patient-report`). Este
 * módulo centraliza la creación de ese enlace y el texto del aviso para los
 * tres puntos que hoy envían informes: `useTranscriptionAnalysis.tsx`,
 * `PatientAIReports.tsx` y `SessionDetailDrawer.tsx`.
 *
 * `content_markdown` se guarda como una FOTO del informe en el momento del
 * envío (mismo criterio que `consents.content_snapshot`), no como una
 * referencia viva — así el paciente siempre ve exactamente lo que se le
 * envió, aunque el documento se reprocese después.
 */

type ReportLinksSupabaseClient = SupabaseClient<Database>;

/** 30 días: bastante para que el paciente lo consulte con calma, sin dejar
 *  la exposición abierta indefinidamente. Ver comentario en la migración
 *  `20260908120000_patient_report_links.sql` para la justificación completa. */
export const PATIENT_REPORT_LINK_TTL_DAYS = 30;

/** Asunto de email neutro: debe poder leerse en una notificación de pantalla
 *  de bloqueo sin revelar que se trata de terapia, el motivo o un diagnóstico. */
export const PATIENT_REPORT_EMAIL_SUBJECT = 'Tienes un documento disponible';

export interface CreatePatientReportLinkInput {
  centerId: string;
  patientId: string;
  sessionId?: string | null;
  aiGeneratedDocumentId?: string | null;
  title?: string;
  contentMarkdown: string;
}

export interface PatientReportLink {
  token: string;
  url: string;
}

/** Crea el enlace de consulta y devuelve su URL pública. */
export async function createPatientReportLink(
  supabase: ReportLinksSupabaseClient,
  input: CreatePatientReportLinkInput,
): Promise<PatientReportLink> {
  const expiresAt = new Date(Date.now() + PATIENT_REPORT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('patient_report_links')
    .insert({
      center_id: input.centerId,
      patient_id: input.patientId,
      session_id: input.sessionId ?? null,
      ai_generated_document_id: input.aiGeneratedDocumentId ?? null,
      title: input.title || 'Resumen de tu sesión',
      content_markdown: input.contentMarkdown,
      expires_at: expiresAt,
    })
    .select('access_token')
    .single();

  if (error || !data) throw error || new Error('No se pudo generar el enlace del informe');

  return {
    token: data.access_token,
    url: `${window.location.origin}/informe/${data.access_token}`,
  };
}

/**
 * Texto del aviso que sustituye al informe completo en el mensaje. Cálido
 * pero neutro: nada de "terapia", "sesión clínica" ni contenido que permita
 * inferir motivo o diagnóstico con solo ver la notificación en la pantalla
 * de bloqueo del móvil.
 */
export function buildPatientReportNotice(url: string, patientFirstName?: string | null): string {
  const greeting = patientFirstName ? `Hola ${patientFirstName},` : 'Hola,';
  return `${greeting} tienes disponible un resumen. Puedes consultarlo aquí: ${url}\n\nEste enlace es personal e intransferible.`;
}
