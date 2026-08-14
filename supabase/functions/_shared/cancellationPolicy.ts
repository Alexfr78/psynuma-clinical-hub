// Helpers for storing the signed cancellation policy that applies to a session.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

function normalizePolicyText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function looksLikeCancellationPolicyConsent(consent: { content_snapshot?: string | null; template?: { name?: string | null } | { name?: string | null }[] | null }): boolean {
  const template = Array.isArray(consent.template) ? consent.template[0] : consent.template;
  const text = normalizePolicyText([
    consent.content_snapshot,
    template?.name,
  ].filter(Boolean).join(" "));

  return text.includes("politica de cancelacion")
    || text.includes("politica cancelacion")
    || (text.includes("cancelacion") && text.includes("fuera de plazo"));
}

export async function resolveSignedCancellationPolicyVersion(
  supabase: SupabaseClient,
  args: {
    centerId: string;
    patientId?: string | null;
    versionSelect?: string;
  },
) {
  if (!args.patientId) return null;

  const versionSelect = args.versionSelect || "id";
  const { data: linkedConsent, error: linkedConsentError } = await supabase
    .from("consents")
    .select(`
      cancellation_policy_version_id,
      signed_at,
      cancellation_policy_versions(${versionSelect})
    `)
    .eq("center_id", args.centerId)
    .eq("patient_id", args.patientId)
    .eq("status", "signed")
    .not("cancellation_policy_version_id", "is", null)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkedConsentError) throw linkedConsentError;

  const linkedVersion = Array.isArray(linkedConsent?.cancellation_policy_versions)
    ? linkedConsent.cancellation_policy_versions[0]
    : linkedConsent?.cancellation_policy_versions;
  if (linkedVersion) return linkedVersion;

  const { data: activePolicy, error: activePolicyError } = await supabase
    .from("cancellation_policy_versions")
    .select(versionSelect)
    .eq("center_id", args.centerId)
    .eq("is_active", true)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activePolicyError) throw activePolicyError;
  if (!activePolicy) return null;

  const { data: legacySignedConsents, error: legacyConsentError } = await supabase
    .from("consents")
    .select("id, content_snapshot, signed_at, template:consent_templates(name)")
    .eq("center_id", args.centerId)
    .eq("patient_id", args.patientId)
    .eq("status", "signed")
    .is("cancellation_policy_version_id", null)
    .order("signed_at", { ascending: false })
    .limit(20);

  if (legacyConsentError) throw legacyConsentError;

  const hasLegacyPolicyConsent = (legacySignedConsents || []).some(looksLikeCancellationPolicyConsent);
  return hasLegacyPolicyConsent ? activePolicy : null;
}

export async function resolveSignedCancellationPolicyVersionForSession(
  supabase: SupabaseClient,
  args: {
    centerId: string;
    patientId?: string | null;
    policyVersionId?: string | null;
    versionSelect?: string;
  },
) {
  if (!args.patientId) return null;

  if (args.policyVersionId) {
    const versionSelect = args.versionSelect || "id";
    const { data: exactConsent, error } = await supabase
      .from("consents")
      .select(`cancellation_policy_versions(${versionSelect})`)
      .eq("center_id", args.centerId)
      .eq("patient_id", args.patientId)
      .eq("cancellation_policy_version_id", args.policyVersionId)
      .eq("status", "signed")
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const version = Array.isArray(exactConsent?.cancellation_policy_versions)
      ? exactConsent.cancellation_policy_versions[0]
      : exactConsent?.cancellation_policy_versions;
    return version || null;
  }

  // Compatibility for sessions created before policy snapshots existed.
  return resolveSignedCancellationPolicyVersion(supabase, args);
}

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

  const signedPolicy = await resolveSignedCancellationPolicyVersion(supabase, {
    centerId: args.centerId,
    patientId: args.patientId,
    versionSelect: "id",
  });

  if (!signedPolicy?.id) {
    return {
      cancellation_policy_version_id: null,
      cancellation_policy_status: activePolicy?.id ? "not_signed" : null,
    };
  }

  return {
    cancellation_policy_version_id: signedPolicy.id,
    cancellation_policy_status:
      activePolicy?.id && signedPolicy.id !== activePolicy.id
        ? "outdated"
        : "signed",
  };
}
