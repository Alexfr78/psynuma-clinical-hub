// Helpers for patient-portal clickwrap acceptance of an exact cancellation-policy version.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type PublicCancellationPolicy = {
  id: string;
  name: string;
  versionNumber: number;
  policyText: string | null;
  cancellationWindowHours: number;
  lateCancellationPercentage: number;
  noShowPercentage: number;
};

export async function getPublicCancellationPolicy(
  supabase: SupabaseClient,
  centerId: string,
): Promise<PublicCancellationPolicy | null> {
  const { data, error } = await supabase
    .from('cancellation_policy_versions')
    .select('id, name, version_number, policy_text, rules')
    .eq('center_id', centerId)
    .eq('is_active', true)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rules = data.rules && typeof data.rules === 'object'
    ? data.rules as Record<string, unknown>
    : {};
  return {
    id: data.id,
    name: data.name,
    versionNumber: data.version_number,
    policyText: data.policy_text,
    cancellationWindowHours: Number(rules.cancellation_window_hours ?? 24),
    lateCancellationPercentage: Number(rules.late_cancel_penalty_percentage ?? 100),
    noShowPercentage: Number(rules.no_show_percentage ?? 100),
  };
}

export async function hasAcceptedCancellationPolicy(
  supabase: SupabaseClient,
  args: { centerId: string; patientId: string; policyVersionId: string },
): Promise<boolean> {
  const { data, error } = await supabase
    .from('consents')
    .select('id')
    .eq('center_id', args.centerId)
    .eq('patient_id', args.patientId)
    .eq('cancellation_policy_version_id', args.policyVersionId)
    .eq('status', 'signed')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function recordPortalCancellationPolicyClickwrap(
  supabase: SupabaseClient,
  args: {
    centerId: string;
    patientId: string;
    professionalId: string;
    policy: PublicCancellationPolicy;
    patientName: string;
    clientIp: string;
    userAgent: string | null;
  },
) {
  if (await hasAcceptedCancellationPolicy(supabase, {
    centerId: args.centerId,
    patientId: args.patientId,
    policyVersionId: args.policy.id,
  })) return null;

  const templateName = `${args.policy.name} v${args.policy.versionNumber}`;
  const summary = `Cancelación sin coste hasta ${args.policy.cancellationWindowHours} horas antes. Después podría aplicarse un cargo del ${args.policy.lateCancellationPercentage}%.`;
  const contentSnapshot = [
    `<h1>${escapeHtml(args.policy.name)}</h1>`,
    `<p><strong>${escapeHtml(summary)}</strong></p>`,
    args.policy.noShowPercentage > 0
      ? `<p>La no asistencia sin aviso podría suponer un cargo del ${args.policy.noShowPercentage}%.</p>`
      : '',
    args.policy.policyText ? `<p>${escapeHtml(args.policy.policyText).replaceAll('\n', '<br>')}</p>` : '',
  ].join('');

  const { data: existingTemplate, error: templateError } = await supabase
    .from('consent_templates')
    .select('id')
    .eq('center_id', args.centerId)
    .eq('name', templateName)
    .limit(1)
    .maybeSingle();
  if (templateError) throw templateError;

  let templateId = existingTemplate?.id;
  if (!templateId) {
    const { data: createdTemplate, error: createTemplateError } = await supabase
      .from('consent_templates')
      .insert({
        center_id: args.centerId,
        name: templateName,
        content_html: contentSnapshot,
        requires_guardian_signature: false,
        is_active: true,
        verification_checkboxes: ['He leído y acepto la política de cancelación'],
      })
      .select('id')
      .single();
    if (createTemplateError) throw createTemplateError;
    templateId = createdTemplate.id;
  }

  const acceptedAt = new Date();
  const expiresAt = new Date(acceptedAt);
  expiresAt.setDate(expiresAt.getDate() + 7);
  const { data: consent, error: consentError } = await supabase
    .from('consents')
    .insert({
      center_id: args.centerId,
      patient_id: args.patientId,
      professional_id: args.professionalId,
      template_id: templateId,
      content_snapshot: contentSnapshot,
      cancellation_policy_version_id: args.policy.id,
      status: 'signed',
      signed_at: acceptedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      source: 'portal_booking_checkbox',
      requires_guardian: false,
      verification_responses: {
        '0': true,
        accepted: true,
        acceptance_method: 'checkbox',
        accepted_at: acceptedAt.toISOString(),
        policy_version_id: args.policy.id,
        policy_version_number: args.policy.versionNumber,
        patient_name: args.patientName,
        ip_address: args.clientIp,
        user_agent: args.userAgent,
      },
    })
    .select('id')
    .single();
  if (consentError) throw consentError;
  return consent.id;
}
