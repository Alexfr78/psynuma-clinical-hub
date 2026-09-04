// Normalizes `consent_templates.verification_checkboxes` (jsonb) and reads
// `consents.verification_responses` (jsonb) against a stable per-checkbox key.
//
// BACKWARD COMPATIBILITY DECISION (do not "fix" without re-reading this):
// Before this change, `verification_checkboxes` was a plain array of strings
// (e.g. the cancellation-policy templates created by
// `src/hooks/useCancellationPolicy.tsx` and
// `supabase/functions/_shared/cancellationPolicyClickwrap.ts`:
// `verification_checkboxes: ['He leído y acepto la política de cancelación']`),
// and every `consents.verification_responses` row was keyed by the
// checkbox's *array index as a string* (e.g. `{ "0": true }` — see the
// column comment added in migration
// 20251214181125_a9f7e0cd-db11-4a39-b2f0-82a4a2a6fb57.sql).
//
// For a legacy string item we derive `key = String(index)`. That is exactly
// the key already used by every historical `verification_responses` row, so
// old data keeps resolving correctly with zero migration: `responses[key]`
// works unchanged for both legacy templates (keys `"0"`, `"1"`, ...) and new
// ones (semantic keys like `"recording"`, `"ai_processing"`, ...). The two
// key spaces never collide because new keys are always non-numeric slugs —
// this file is a good place to keep enforcing that invariant if new callers
// are added.
//
// This module is intentionally dependency-free (no Supabase import) so it
// can be reused as-is from the Deno edge functions that need the same
// normalization (see supabase/functions/_shared/consent.ts, which keeps its
// own copy because Deno functions cannot import from src/).

export interface VerificationCheckboxItem {
  /** Stable identifier. For legacy string checkboxes this is the array index as a string. */
  key: string;
  /** Text shown to the patient. */
  label: string;
  /** Whether the patient must give an explicit yes/no answer before signing (not whether the answer must be "yes"). */
  required: boolean;
}

export type RawVerificationCheckbox =
  | string
  | { key?: unknown; label?: unknown; required?: unknown }
  | null
  | undefined;

/**
 * Accepts whatever is stored in `consent_templates.verification_checkboxes`
 * (legacy `string[]`, the new `{ key, label, required }[]`, or a mix — jsonb
 * has no schema enforcement) and always returns the new shape.
 */
export function normalizeVerificationCheckboxes(raw: unknown): VerificationCheckboxItem[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    if (typeof item === 'string') {
      return { key: String(index), label: item, required: true };
    }

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const key = typeof obj.key === 'string' && obj.key.trim() !== '' ? obj.key : String(index);
      const label = typeof obj.label === 'string' ? obj.label : '';
      const required = typeof obj.required === 'boolean' ? obj.required : true;
      return { key, label, required };
    }

    // Defensive fallback for unexpected jsonb shapes (null, number, ...).
    return { key: String(index), label: item == null ? '' : String(item), required: true };
  });
}

/**
 * Reads a single checkbox's stored answer from `consents.verification_responses`.
 * Handles both a real boolean and the legacy `"true"`/`"false"` string values
 * that some older records contain (see ConsentDetailDialog's historical
 * `String(rawValue) === 'true'` guard, which this centralizes).
 * Returns `undefined` when the patient hasn't answered this checkbox yet.
 */
export function getVerificationResponseValue(
  responses: Record<string, unknown> | null | undefined,
  key: string,
): boolean | undefined {
  if (!responses || !Object.prototype.hasOwnProperty.call(responses, key)) return undefined;
  const raw = responses[key];
  return raw === true || raw === 'true';
}

/**
 * Builds the `{ [key]: boolean }` payload to persist in
 * `consents.verification_responses` from the patient's in-progress answers
 * (keyed by checkbox key, value `'authorized' | 'not_authorized' | undefined`).
 */
/**
 * Derives a readable, stable-ish key from a checkbox label for templates
 * authored through the admin UI (CreateTemplateDialog), e.g.
 * "Autorizo la grabación" -> "autorizo_la_grabacion". Purpose-specific
 * templates (like the Plaud consent) should set explicit semantic keys
 * instead of relying on this — see the SQL template in
 * scratchpad/plantilla-consentimiento.sql.
 */
export function slugifyCheckboxKey(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'checkbox';
}

/** Slugifies `label` and disambiguates it against `existingKeys` (e.g. two checkboxes with the same wording). */
export function generateUniqueCheckboxKey(label: string, existingKeys: string[]): string {
  const base = slugifyCheckboxKey(label);
  if (!existingKeys.includes(base)) return base;
  let suffix = 2;
  while (existingKeys.includes(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

export function buildVerificationResponsesPayload(
  checkboxes: VerificationCheckboxItem[],
  answers: Record<string, 'authorized' | 'not_authorized' | undefined>,
): Record<string, boolean> {
  const payload: Record<string, boolean> = {};
  for (const checkbox of checkboxes) {
    const answer = answers[checkbox.key];
    if (answer !== undefined) {
      payload[checkbox.key] = answer === 'authorized';
    }
  }
  return payload;
}
