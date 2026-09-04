// Deno twin of src/lib/consent-verification.ts — mirrors its logic exactly.
// Duplicated (not imported) because edge functions cannot import from src/.
// Keep both files in sync if this logic changes.
//
// Also re-exports the checkbox normalizer (see src/lib/consent-checkboxes.ts
// for the full backward-compatibility rationale) for edge functions that
// render `verification_checkboxes` / `verification_responses`, such as
// generate-consent-pdf and submit-consent-signature.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ConsentPurpose =
  | "recording" // grabación de audio de la sesión
  | "ai_processing" // tratamiento por IA y por encargado externo
  | "report_generation" // generación de informes clínicos y para el paciente
  | "channel_whatsapp" // envío del resumen por WhatsApp
  | "channel_email"; // envío del resumen por email

export type ConsentDenialReason =
  | "no_consent"
  | "not_signed"
  | "revoked"
  | "expired"
  | "purpose_not_granted";

export interface ConsentCheckResult {
  granted: boolean;
  reason?: ConsentDenialReason;
  consentId?: string;
  signedAt?: string;
}

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
    && typeof responses === "object"
    && !Array.isArray(responses)
    && Object.prototype.hasOwnProperty.call(responses, purpose)
  );
}

function isExplicitlyGranted(value: unknown): boolean {
  // Some legacy rows stored the string "true" instead of a real boolean.
  return value === true || value === "true";
}

function pickMostRecentlySigned(rows: ConsentPurposeRow[]): ConsentPurposeRow | null {
  const signed = rows.filter((row) => row.status === "signed" && !!row.signed_at);
  if (signed.length === 0) return null;
  return signed.reduce((latest, row) =>
    new Date(row.signed_at as string).getTime() > new Date(latest.signed_at as string).getTime()
      ? row
      : latest
  );
}

export async function checkPatientConsent(
  supabase: SupabaseClient,
  patientId: string,
  purpose: ConsentPurpose,
): Promise<ConsentCheckResult> {
  try {
    if (!patientId) {
      return { granted: false, reason: "no_consent" };
    }

    const { data, error } = await supabase
      .from("consents")
      .select("id, status, signed_at, revoked_at, expires_at, verification_responses")
      .eq("patient_id", patientId);

    if (error || !data) {
      return { granted: false, reason: "no_consent" };
    }

    const rows = data as unknown as ConsentPurposeRow[];
    const withPurpose = rows.filter((row) => hasPurposeKey(row, purpose));
    if (withPurpose.length === 0) {
      return { granted: false, reason: "no_consent" };
    }

    const mostRecent = pickMostRecentlySigned(withPurpose);
    if (!mostRecent) {
      return { granted: false, reason: "not_signed" };
    }

    if (mostRecent.revoked_at) {
      return {
        granted: false,
        reason: "revoked",
        consentId: mostRecent.id,
        signedAt: mostRecent.signed_at ?? undefined,
      };
    }

    if (mostRecent.expires_at && new Date(mostRecent.expires_at).getTime() < Date.now()) {
      return {
        granted: false,
        reason: "expired",
        consentId: mostRecent.id,
        signedAt: mostRecent.signed_at ?? undefined,
      };
    }

    const responses = mostRecent.verification_responses as Record<string, unknown>;
    if (!isExplicitlyGranted(responses[purpose])) {
      return {
        granted: false,
        reason: "purpose_not_granted",
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
    console.error("[_shared/consent] checkPatientConsent failed, denying by default:", error);
    return { granted: false, reason: "no_consent" };
  }
}

// --- Checkbox normalization (see src/lib/consent-checkboxes.ts for the full
// backward-compatibility write-up; kept in sync here for Deno consumers) ---

export interface VerificationCheckboxItem {
  key: string;
  label: string;
  required: boolean;
}

export function normalizeVerificationCheckboxes(raw: unknown): VerificationCheckboxItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (typeof item === "string") {
      return { key: String(index), label: item, required: true };
    }

    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const key = typeof obj.key === "string" && obj.key.trim() !== "" ? obj.key : String(index);
      const label = typeof obj.label === "string" ? obj.label : "";
      const required = typeof obj.required === "boolean" ? obj.required : true;
      return { key, label, required };
    }

    return { key: String(index), label: item == null ? "" : String(item), required: true };
  });
}

export function getVerificationResponseValue(
  responses: Record<string, unknown> | null | undefined,
  key: string,
): boolean | undefined {
  if (!responses || !Object.prototype.hasOwnProperty.call(responses, key)) return undefined;
  const raw = responses[key];
  return raw === true || raw === "true";
}
