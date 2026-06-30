// Helpers for storing the signed cancellation policy that applies to a session.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export async function resolvePatientCancellationPolicyForSession(
  supabase: SupabaseClient,
  args: {
    centerId: string;
    patientId?: string | null;
  },
) {
  const { data: activePolicy, error: policyError } = await supabase
    .from("cancellation_policy_versions")
    .select("id")
    .eq("center_id", args.centerId)
    .eq("is_active", true)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (policyError) throw policyError;
  if (!args.patientId) {
    return {
      cancellation_policy_version_id: null,
      cancellation_policy_status: activePolicy?.id ? "not_signed" : null,
    };
  }

  const { data: signedPolicyConsent, error: consentError } = await supabase
    .from("consents")
    .select("cancellation_policy_version_id, signed_at")
    .eq("center_id", args.centerId)
    .eq("patient_id", args.patientId)
    .eq("status", "signed")
    .not("cancellation_policy_version_id", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (consentError) throw consentError;

  if (!signedPolicyConsent?.cancellation_policy_version_id) {
    return {
      cancellation_policy_version_id: null,
      cancellation_policy_status: activePolicy?.id ? "not_signed" : null,
    };
  }

  return {
    cancellation_policy_version_id: signedPolicyConsent.cancellation_policy_version_id,
    cancellation_policy_status:
      activePolicy?.id && signedPolicyConsent.cancellation_policy_version_id !== activePolicy.id
        ? "outdated"
        : "signed",
  };
}
