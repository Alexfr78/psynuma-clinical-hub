// Shared UI copy for blocking a clinical AI report send (WhatsApp/email) on
// the client, mirroring the messages send-notification returns from the
// server-side gate (see consentDenialMessage in
// supabase/functions/send-notification/index.ts — keep both in sync).
//
// Used by every UI surface that lets a professional push out
// session.ai_summary_patient over WhatsApp or email:
// TranscriptionAnalysisDialog.tsx (via useTranscriptionAnalysis.tsx, which
// keeps its own inline copy of this logic), PatientAIReports.tsx, and
// SessionDetailDrawer.tsx.
//
// This is UX only — the real enforcement is server-side in send-notification,
// which fails closed regardless of what the client shows.

import type { ConsentCheckResult, ConsentPurpose } from './consent-verification';

export function consentSendBlockReason(
  channel: 'whatsapp' | 'email',
  result: ConsentCheckResult | undefined,
): string | null {
  if (!result || result.granted) return null;

  const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'email';

  switch (result.reason) {
    case 'no_consent':
      return `Este contacto no tiene un consentimiento registrado. No es posible el envío por ${channelLabel}. Solicita un nuevo consentimiento.`;
    case 'not_signed':
      return `El consentimiento de este contacto está pendiente de firma. No es posible el envío por ${channelLabel} hasta que lo firme.`;
    case 'revoked':
      return `Este contacto ha revocado su consentimiento. No es posible el envío por ${channelLabel}.`;
    case 'expired':
      return `El consentimiento de este contacto ha caducado. No es posible el envío por ${channelLabel}. Solicita uno nuevo.`;
    case 'purpose_not_granted':
      return `Este contacto no ha autorizado el envío por ${channelLabel}. Prueba otro canal o solicita un nuevo consentimiento.`;
    default:
      return `No es posible el envío por ${channelLabel}: consentimiento no concedido.`;
  }
}

// --- Purpose-level status copy (granular permissions panel) ------------
//
// Used by PatientConsents.tsx (permissions panel) and PatientSummary.tsx
// (compact "Permisos: N de 5" indicator) to show, per purpose, whether it is
// authorized and — when it isn't — a plain-language reason. This is
// distinct from consentSendBlockReason above, which phrases things as "this
// send is blocked because…"; here we instead describe the *state* of the
// purpose itself ("revocado", "caducado", "no lo marcó"), so it reads as a
// status line rather than an action-blocking message. The vocabulary
// (revocado, caducado, pendiente de firma, no ha autorizado) intentionally
// matches consentSendBlockReason so the app never uses two different words
// for the same underlying state.

export const ALL_CONSENT_PURPOSES: ConsentPurpose[] = [
  'recording',
  'ai_processing',
  'report_generation',
  'channel_whatsapp',
  'channel_email',
];

export const CONSENT_PURPOSE_LABELS: Record<ConsentPurpose, string> = {
  recording: 'Grabación de sesiones',
  ai_processing: 'Tratamiento con IA',
  report_generation: 'Generación de informes',
  channel_whatsapp: 'Envío por WhatsApp',
  channel_email: 'Envío por email',
};

export function consentPurposeStatusReason(result: ConsentCheckResult | undefined): string | null {
  if (!result || result.granted) return null;

  switch (result.reason) {
    case 'no_consent':
      return 'No hay ningún consentimiento registrado para este contacto.';
    case 'not_signed':
      return 'El consentimiento está pendiente de firma.';
    case 'revoked':
      return 'El contacto revocó esta autorización.';
    case 'expired':
      return 'La autorización ha caducado.';
    case 'purpose_not_granted':
      return 'El contacto no marcó esta casilla al firmar.';
    default:
      return 'Consentimiento no concedido.';
  }
}

export function countGrantedConsentPurposes(
  results: Partial<Record<ConsentPurpose, ConsentCheckResult>> | undefined,
): { granted: number; total: number } {
  const total = ALL_CONSENT_PURPOSES.length;
  if (!results) return { granted: 0, total };
  const granted = ALL_CONSENT_PURPOSES.filter((purpose) => results[purpose]?.granted).length;
  return { granted, total };
}
