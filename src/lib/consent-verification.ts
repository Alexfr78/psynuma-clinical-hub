// Client-side purpose-scoped consent check. Mirrors
// supabase/functions/_shared/consent.ts exactly (kept as two files because
// Deno edge functions cannot import from src/) — keep both in sync if this
// logic changes.
//
// Design: a "purpose" is granted only by a consent whose
// `verification_responses` explicitly addresses that purpose key (i.e. the
// patient answered that specific checkbox, granted or not). Among those
// purpose-addressing consents, the most recently *signed* one wins — so a
// later consent that revisits the same purpose (granting or withdrawing it)
// always overrides an older one, even if the older one is still technically
// "valid". This never fails open: any ambiguity, missing data, or query
// error resolves to `granted: false`.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type ConsentPurpose =
  | 'recording' // grabación de audio de la sesión
  | 'ai_processing' // tratamiento por IA y por encargado externo
  | 'report_generation' // generación de informes clínicos y para el paciente
  | 'channel_whatsapp' // envío del resumen por WhatsApp
  | 'channel_email'; // envío del resumen por email

export type ConsentDenialReason =
  | 'no_consent'
  | 'not_signed'
  | 'revoked'
  | 'expired'
  | 'purpose_not_granted';

export interface ConsentCheckResult {
  granted: boolean;
  reason?: ConsentDenialReason;
  consentId?: string;
  signedAt?: string;
}

type ConsentsSupabaseClient = SupabaseClient<Database>;

interface ConsentPurposeRow {
  id: string;
  status: string | null;
  signed_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  verification_responses: unknown;
}

function hasPurposeKey(row: ConsentPurposeRow, purpose: string): boolean {
  const responses = row.verification_responses;
  return (
    !!responses
    && typeof responses === 'object'
    && !Array.isArray(responses)
    && Object.prototype.hasOwnProperty.call(responses, purpose)
  );
}

function isExplicitlyGranted(value: unknown): boolean {
  // Some legacy rows stored the string "true" instead of a real boolean.
  return value === true || value === 'true';
}

function pickMostRecentlySigned(rows: ConsentPurposeRow[]): ConsentPurposeRow | null {
  const signed = rows.filter((row) => row.status === 'signed' && !!row.signed_at);
  if (signed.length === 0) return null;
  return signed.reduce((latest, row) =>
    new Date(row.signed_at as string).getTime() > new Date(latest.signed_at as string).getTime()
      ? row
      : latest
  );
}

export async function checkPatientConsent(
  supabase: ConsentsSupabaseClient,
  patientId: string,
  purpose: ConsentPurpose,
): Promise<ConsentCheckResult> {
  try {
    if (!patientId) {
      return { granted: false, reason: 'no_consent' };
    }

    const { data, error } = await supabase
      .from('consents')
      .select('id, status, signed_at, revoked_at, expires_at, verification_responses')
      .eq('patient_id', patientId);

    if (error || !data) {
      return { granted: false, reason: 'no_consent' };
    }

    const rows = data as unknown as ConsentPurposeRow[];
    const withPurpose = rows.filter((row) => hasPurposeKey(row, purpose));
    if (withPurpose.length === 0) {
      return { granted: false, reason: 'no_consent' };
    }

    const mostRecent = pickMostRecentlySigned(withPurpose);
    if (!mostRecent) {
      return { granted: false, reason: 'not_signed' };
    }

    if (mostRecent.revoked_at) {
      return {
        granted: false,
        reason: 'revoked',
        consentId: mostRecent.id,
        signedAt: mostRecent.signed_at ?? undefined,
      };
    }

    if (mostRecent.expires_at && new Date(mostRecent.expires_at).getTime() < Date.now()) {
      return {
        granted: false,
        reason: 'expired',
        consentId: mostRecent.id,
        signedAt: mostRecent.signed_at ?? undefined,
      };
    }

    const responses = mostRecent.verification_responses as Record<string, unknown>;
    if (!isExplicitlyGranted(responses[purpose])) {
      return {
        granted: false,
        reason: 'purpose_not_granted',
        consentId: mostRecent.id,
        signedAt: mostRecent.signed_at ?? undefined,
      };
    }

    return {
      granted: true,
      consentId: mostRecent.id,
      signedAt: mostRecent.signed_at ?? undefined,
    };
  } catch (error) {
    console.error('[consent-verification] checkPatientConsent failed, denying by default:', error);
    return { granted: false, reason: 'no_consent' };
  }
}
