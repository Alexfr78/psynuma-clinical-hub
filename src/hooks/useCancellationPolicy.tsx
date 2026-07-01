import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { Patient } from './usePatients';

type RefundMode = 'automatic' | 'review';
type RefundOption = 'refund' | 'voucher';

export interface CancellationPolicyRules {
  cancellation_window_hours: number;
  late_cancel_penalty_percentage: number;
  no_show_percentage: number;
  unjustified_free_cancellations: number;
  allow_justified_cancellations: boolean;
  refund_mode: RefundMode;
  refund_options: RefundOption[];
}

export interface CancellationPolicyVersion {
  id: string;
  center_id: string;
  name: string;
  version_number: number;
  is_active: boolean;
  rules: CancellationPolicyRules | Record<string, unknown>;
  valid_reasons: string[] | unknown;
  penalty_invoice_concept: string;
  policy_text?: string | null;
  rectification_reason: string;
  voucher_validity_days: number;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function policyTextToHtml(text: string) {
  const lines = text.split('\n');
  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    if (line.startsWith('# ')) {
      closeList();
      html.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
    } else if (line.startsWith('## ')) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(3))}</h3>`);
    } else if (line.startsWith('* ')) {
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
    } else {
      closeList();
      html.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  closeList();
  return html.join('\n');
}

const DEFAULT_RULES: CancellationPolicyRules = {
  cancellation_window_hours: 24,
  late_cancel_penalty_percentage: 100,
  no_show_percentage: 100,
  unjustified_free_cancellations: 0,
  allow_justified_cancellations: true,
  refund_mode: 'review',
  refund_options: ['refund', 'voucher'],
};

export function normalizeCancellationPolicyRules(value: CancellationPolicyVersion['rules'] | null | undefined): CancellationPolicyRules {
  const raw = (value || {}) as Partial<CancellationPolicyRules>;
  const refundOptions = Array.isArray(raw.refund_options)
    ? raw.refund_options.filter((option): option is RefundOption => option === 'refund' || option === 'voucher')
    : [];

  return {
    cancellation_window_hours: Number(raw.cancellation_window_hours ?? DEFAULT_RULES.cancellation_window_hours),
    late_cancel_penalty_percentage: Number(raw.late_cancel_penalty_percentage ?? DEFAULT_RULES.late_cancel_penalty_percentage),
    no_show_percentage: Number(raw.no_show_percentage ?? DEFAULT_RULES.no_show_percentage),
    unjustified_free_cancellations: Number(raw.unjustified_free_cancellations ?? DEFAULT_RULES.unjustified_free_cancellations),
    allow_justified_cancellations: raw.allow_justified_cancellations ?? DEFAULT_RULES.allow_justified_cancellations,
    refund_mode: raw.refund_mode === 'automatic' ? 'automatic' : 'review',
    refund_options: refundOptions.length > 0 ? refundOptions : DEFAULT_RULES.refund_options,
  };
}

export function cancellationPolicyReasonsToLines(value: unknown): string {
  return Array.isArray(value) ? value.filter(Boolean).join('\n') : '';
}

export function cancellationPolicyLinesToList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildPolicyHtml({
  policy,
  patient,
  centerName,
  professionalName,
}: {
  policy: CancellationPolicyVersion;
  patient: Patient;
  centerName: string;
  professionalName: string;
}) {
  if (policy.policy_text?.trim()) {
    return policyTextToHtml(
      policy.policy_text
        .replace(/\[nombre y apellidos\]/gi, `${patient.first_name} ${patient.last_name}`.trim())
        .replace(/\[fecha\]/gi, format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es }))
        .replace(/\[profesional\]/gi, professionalName)
        .replace(/\[centro\]/gi, centerName),
    );
  }

  const rules = normalizeCancellationPolicyRules(policy.rules);
  const validReasons = Array.isArray(policy.valid_reasons) ? policy.valid_reasons.filter(Boolean) : [];
  const refundOptions = rules.refund_options.includes('refund') && rules.refund_options.includes('voucher')
    ? 'devolución o vale'
    : rules.refund_options.includes('refund')
      ? 'devolución'
      : 'vale';

  const reasonsHtml = validReasons.length > 0
    ? `<ul>${validReasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>`
    : '<p>No hay motivos justificados predefinidos. El profesional valorará cada caso.</p>';

  return `
    <h2>${policy.name}</h2>
    <p>
      Yo, <strong>${patient.first_name} ${patient.last_name}</strong>, declaro haber sido informado/a
      de la política de cancelación del centro <strong>${centerName}</strong>.
    </p>
    <h3>Condiciones principales</h3>
    <ol>
      <li>La cita puede cancelarse sin penalización hasta <strong>${rules.cancellation_window_hours} horas</strong> antes de la sesión.</li>
      <li>Si la cancelación se realiza fuera de plazo, podrá aplicarse un cargo del <strong>${rules.late_cancel_penalty_percentage}%</strong> del importe de la sesión.</li>
      <li>La inasistencia sin aviso podrá aplicar un cargo del <strong>${rules.no_show_percentage}%</strong> del importe de la sesión.</li>
      <li>Cancelaciones sin justificar permitidas: <strong>${rules.unjustified_free_cancellations}</strong>.</li>
      <li>${rules.allow_justified_cancellations ? 'Las cancelaciones justificadas podrán revisarse por el profesional.' : 'No se contemplan excepciones justificadas de forma automática.'}</li>
      <li>Si la sesión ya estaba pagada y procede compensación, el centro podrá ofrecer <strong>${refundOptions}</strong>.</li>
      <li>Los vales generados tendrán una caducidad de <strong>${policy.voucher_validity_days} días</strong>.</li>
    </ol>
    <h3>Motivos que pueden considerarse válidos</h3>
    ${reasonsHtml}
    <p>
      La aplicación final de esta política queda sujeta a la revisión del profesional cuando corresponda.
      Concepto de cargo: <strong>${policy.penalty_invoice_concept}</strong>.
    </p>
    <p>Profesional: <strong>${professionalName}</strong></p>
    <p>Fecha: ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: es })}</p>
  `;
}

export function useActiveCancellationPolicy() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['active-cancellation-policy', centerId],
    queryFn: async () => {
      if (!centerId) return null;
      const { data, error } = await supabase
        .from('cancellation_policy_versions')
        .select('*')
        .eq('center_id', centerId)
        .eq('is_active', true)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CancellationPolicyVersion | null;
    },
    enabled: !!centerId,
  });
}

function normalizePolicyText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function looksLikeCancellationPolicyConsent(consent: {
  content_snapshot?: string | null;
  template?: { name?: string | null } | null;
}) {
  const text = normalizePolicyText([
    consent.content_snapshot,
    consent.template?.name,
  ].filter(Boolean).join(' '));

  return text.includes('politica de cancelacion')
    || text.includes('politica cancelacion')
    || (text.includes('cancelacion') && text.includes('fuera de plazo'));
}

export async function resolveSignedCancellationPolicyVersion(
  centerId: string,
  patientId: string | null | undefined,
  activePolicyId?: string | null,
) {
  if (!patientId) return null;

  const { data: linkedConsent, error: linkedError } = await supabase
    .from('consents')
    .select('cancellation_policy_version_id, signed_at')
    .eq('center_id', centerId)
    .eq('patient_id', patientId)
    .eq('status', 'signed')
    .not('cancellation_policy_version_id', 'is', null)
    .order('signed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkedError) throw linkedError;
  if (linkedConsent?.cancellation_policy_version_id) {
    return linkedConsent.cancellation_policy_version_id;
  }

  const policyId = activePolicyId ?? (await supabase
    .from('cancellation_policy_versions')
    .select('id')
    .eq('center_id', centerId)
    .eq('is_active', true)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()).data?.id ?? null;

  if (!policyId) return null;

  const { data: legacyConsents, error: legacyError } = await supabase
    .from('consents')
    .select('id, content_snapshot, signed_at, template:consent_templates(name)')
    .eq('center_id', centerId)
    .eq('patient_id', patientId)
    .eq('status', 'signed')
    .is('cancellation_policy_version_id', null)
    .order('signed_at', { ascending: false })
    .limit(20);

  if (legacyError) throw legacyError;
  return (legacyConsents || []).some((consent) => looksLikeCancellationPolicyConsent(consent))
    ? policyId
    : null;
}

export async function resolvePatientCancellationPolicyForSession(
  centerId: string,
  patientId: string | null | undefined,
  activePolicyId?: string | null,
) {
  if (!patientId) {
    return {
      cancellation_policy_version_id: null,
      cancellation_policy_status: activePolicyId ? 'not_signed' : null,
    };
  }

  const signedPolicyVersionId = await resolveSignedCancellationPolicyVersion(centerId, patientId, activePolicyId);

  if (!signedPolicyVersionId) {
    return {
      cancellation_policy_version_id: null,
      cancellation_policy_status: activePolicyId ? 'not_signed' : null,
    };
  }

  return {
    cancellation_policy_version_id: signedPolicyVersionId,
    cancellation_policy_status: activePolicyId && signedPolicyVersionId !== activePolicyId
      ? 'outdated'
      : 'signed',
  };
}

export function useCreateCancellationPolicyConsent(patient: Patient) {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();
  const { data: activePolicy } = useActiveCancellationPolicy();

  return useMutation({
    mutationFn: async () => {
      if (!profile?.center_id || !profile?.id) throw new Error('No hay centro o profesional configurado');
      if (!activePolicy) throw new Error('No hay una política de cancelación activa');

      const templateName = `${activePolicy.name} v${activePolicy.version_number}`;
      const { data: existingTemplate, error: templateSearchError } = await supabase
        .from('consent_templates')
        .select('*')
        .eq('center_id', profile.center_id)
        .eq('name', templateName)
        .maybeSingle();

      if (templateSearchError) throw templateSearchError;

      let template = existingTemplate;
      if (!template) {
        const { data: createdTemplate, error: createTemplateError } = await supabase
          .from('consent_templates')
          .insert({
            center_id: profile.center_id,
            name: templateName,
            content_html: buildPolicyHtml({
              policy: activePolicy,
              patient,
              centerName: center?.name || 'Centro',
              professionalName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Profesional',
            }),
            requires_guardian_signature: false,
            is_active: true,
            verification_checkboxes: ['He leído y acepto la política de cancelación'],
          })
          .select()
          .single();

        if (createTemplateError) throw createTemplateError;
        template = createdTemplate;
      }

      const contentSnapshot = buildPolicyHtml({
        policy: activePolicy,
        patient,
        centerName: center?.name || 'Centro',
        professionalName: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Profesional',
      });
      const expiresAt = addDays(new Date(), center?.consent_expiration_days || 7).toISOString();

      const { data: consent, error: createConsentError } = await supabase
        .from('consents')
        .insert({
          center_id: profile.center_id,
          patient_id: patient.id,
          template_id: template.id,
          professional_id: profile.id,
          content_snapshot: contentSnapshot,
          requires_guardian: patient.is_minor || false,
          expires_at: expiresAt,
          cancellation_policy_version_id: activePolicy.id,
        })
        .select(`
          *,
          template:consent_templates(name),
          patient:patients(first_name, last_name, phone),
          professional:profiles(first_name, last_name)
        `)
        .single();

      if (createConsentError) throw createConsentError;
      return consent;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      queryClient.invalidateQueries({ queryKey: ['consent-templates'] });
      toast.success('Política de cancelación preparada para firma');
    },
    onError: (error) => {
      toast.error('No se pudo crear la política para firma', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}
