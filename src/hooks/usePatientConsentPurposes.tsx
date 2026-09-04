import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { checkPatientConsent, type ConsentCheckResult, type ConsentPurpose } from '@/lib/consent-verification';
import { ALL_CONSENT_PURPOSES } from '@/lib/consent-block-messages';

export type PatientConsentPurposeResults = Record<ConsentPurpose, ConsentCheckResult>;

/**
 * Resolves the granted/denied status of all five consent purposes for a
 * patient, for display in the granular permissions panel
 * (PatientConsents.tsx) and its compact summary indicator
 * (PatientSummary.tsx). Follows the same "resolve every purpose in
 * parallel via TanStack Query" pattern as useTranscriptionAnalysis.tsx.
 *
 * checkPatientConsent() itself fails closed on any Supabase error — by
 * design (see src/lib/consent-verification.ts), so callers gating a real
 * send never accidentally allow one. That means it cannot, on its own,
 * distinguish a genuine fetch failure from a patient who legitimately has
 * no consents yet. This hook runs a cheap probe query first so the panel
 * can show an explicit "couldn't check" state instead of silently
 * rendering every purpose as denied, which would be misleading.
 */
export function usePatientConsentPurposes(patientId: string | undefined) {
  const query = useQuery({
    queryKey: ['patient-consent-purposes', patientId],
    queryFn: async () => {
      const probe = await supabase
        .from('consents')
        .select('id')
        .eq('patient_id', patientId as string)
        .limit(1);
      if (probe.error) throw probe.error;

      const entries = await Promise.all(
        ALL_CONSENT_PURPOSES.map(
          async (purpose) => [purpose, await checkPatientConsent(supabase, patientId as string, purpose)] as const,
        ),
      );
      return Object.fromEntries(entries) as PatientConsentPurposeResults;
    },
    enabled: !!patientId,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    results: query.data,
    isLoading: !!patientId && (query.isLoading || (!query.data && !query.isError)),
    isError: query.isError,
  };
}
