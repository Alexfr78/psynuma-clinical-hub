// UI-only dependency cascade between the five granular consent purposes
// (see src/lib/consent-verification.ts for the `ConsentPurpose` union this
// mirrors). This is purely an interface aid for the public signature flow
// (MultiSignatureFlow.tsx): it keeps the patient from ticking incoherent
// combinations (e.g. authorizing the WhatsApp channel while refusing the AI
// processing that produces what gets sent over it).
//
// IMPORTANT: this is NOT a security boundary. `checkPatientConsent()` /
// `checkPatientConsent` in supabase/functions/_shared/consent.ts keeps
// evaluating every purpose independently and must never be changed to infer
// a purpose from another one — a legacy or malformed row with an incoherent
// combination must still fail closed, purpose by purpose. This module only
// shapes what the signing UI lets a patient *express*, never what the system
// *grants*.
//
// The dependency tree (a purpose requires its parent to be authorized before
// it can be authorized itself):
//
//   recording
//     └── ai_processing
//           └── report_generation
//                 ├── channel_whatsapp
//                 └── channel_email

import type { VerificationResponse } from './consent-acceptance';

/** Maps each purpose key to the purpose it depends on, or `null` for the root. */
export const CONSENT_CASCADE_PARENT: Record<string, string | null> = {
  recording: null,
  ai_processing: 'recording',
  report_generation: 'ai_processing',
  channel_whatsapp: 'report_generation',
  channel_email: 'report_generation',
};

/** The purpose (if any) that `key` requires to be authorized first. `null` for unknown keys and for the root. */
export function getCascadeParent(key: string): string | null {
  return Object.prototype.hasOwnProperty.call(CONSENT_CASCADE_PARENT, key)
    ? CONSENT_CASCADE_PARENT[key]
    : null;
}

/** The purposes (if any) that directly depend on `key`. Empty for unknown keys and for leaves. */
export function getCascadeChildren(key: string): string[] {
  return Object.entries(CONSENT_CASCADE_PARENT)
    .filter(([, parent]) => parent === key)
    .map(([childKey]) => childKey);
}

/**
 * Whether `key`'s "Autorizo" option should be selectable, i.e. its dependency
 * (if it has one) has been explicitly authorized. Purposes outside the known
 * cascade (e.g. legacy numeric keys from other templates) are always unlocked.
 */
export function isCascadeUnlocked(
  key: string,
  responses: Record<string, VerificationResponse>,
): boolean {
  const parent = getCascadeParent(key);
  if (!parent) return true;
  return responses[parent] === 'authorized';
}

/**
 * Applies the answer `value` for `key` and cascades the consequence down the
 * dependency tree: any descendant that was authorized becomes not-authorized,
 * since it can no longer stand without its (now refused/unanswered) parent.
 * Descendants that were never answered are left untouched — the UI locks
 * their "Autorizo" option instead of silently answering on the patient's
 * behalf (see `isCascadeUnlocked`).
 */
export function applyConsentCascade(
  key: string,
  value: VerificationResponse,
  responses: Record<string, VerificationResponse>,
): Record<string, VerificationResponse> {
  const next: Record<string, VerificationResponse> = { ...responses, [key]: value };

  if (value === 'authorized') return next;

  const queue = getCascadeChildren(key);
  while (queue.length > 0) {
    const childKey = queue.shift() as string;
    if (next[childKey] === 'authorized') {
      next[childKey] = 'not_authorized';
    }
    queue.push(...getCascadeChildren(childKey));
  }
  return next;
}
