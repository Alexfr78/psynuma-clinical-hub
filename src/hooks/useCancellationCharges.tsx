import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { resolveSignedCancellationPolicyVersion } from './useCancellationPolicy';

export interface CancellationCharge {
  id: string;
  center_id: string;
  patient_id: string;
  session_id: string | null;
  policy_version_id: string | null;
  status: 'pending_review' | 'confirmed' | 'forgiven' | 'paid' | 'cancelled';
  amount: number;
  original_amount: number;
  percentage: number;
  base_session_price: number;
  concept: string;
  review_note: string | null;
  debt_id: string | null;
  invoice_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  patients?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  sessions?: {
    id: string;
    session_date: string;
    start_time: string;
    session_type: string | null;
  } | null;
}

function evaluateCancellationCharge(input: {
  rules: Record<string, unknown> | null;
  sessionStartsAt: Date;
  cancelledAt?: Date;
  basePrice: number | string | null | undefined;
}) {
  const rules = input.rules || {};
  const basePrice = Math.max(Number(input.basePrice ?? 0) || 0, 0);
  const cancelledAt = input.cancelledAt || new Date();
  const hoursBefore = (input.sessionStartsAt.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);
  const cancellationWindowHours = Number(rules.cancellation_window_hours ?? 24);
  const percentage = Number(rules.late_cancel_penalty_percentage ?? 0);

  if (hoursBefore >= cancellationWindowHours || percentage <= 0) {
    return {
      applies: false,
      amount: 0,
      percentage,
      basePrice,
    };
  }

  return {
    applies: true,
    amount: Math.round((basePrice * percentage)) / 100,
    percentage,
    basePrice,
  };
}

async function resolveCancellationBasePrice(input: {
  centerId: string;
  patientId: string;
  sessionTypeId?: string | null;
  sessionTypeName?: string | null;
  sessionDate?: string | null;
  sessionPrice?: number | string | null;
}) {
  const savedPrice = Number(input.sessionPrice ?? 0) || 0;
  if (savedPrice > 0) return savedPrice;

  let sessionTypeId = input.sessionTypeId || null;

  if (!sessionTypeId && input.sessionTypeName) {
    const { data: sessionType } = await supabase
      .from('session_types')
      .select('id, default_price')
      .eq('center_id', input.centerId)
      .ilike('name', input.sessionTypeName)
      .maybeSingle();

    sessionTypeId = sessionType?.id || null;
    const fallbackPrice = Number(sessionType?.default_price ?? 0) || 0;
    if (!sessionTypeId && fallbackPrice > 0) return fallbackPrice;
  }

  if (!sessionTypeId) return 0;

  const { data: resolvedPrice } = await supabase.rpc('resolve_effective_price', {
    p_patient_id: input.patientId,
    p_target_type: 'session_type',
    p_target_id: sessionTypeId,
    p_reference_date: input.sessionDate || new Date().toISOString().slice(0, 10),
  });

  const appliedPrice = Number((resolvedPrice as { applied_price?: number } | null)?.applied_price ?? 0) || 0;
  if (appliedPrice > 0) return appliedPrice;

  const { data: sessionType } = await supabase
    .from('session_types')
    .select('default_price')
    .eq('id', sessionTypeId)
    .maybeSingle();

  return Number(sessionType?.default_price ?? 0) || 0;
}

export async function createCancellationChargeForSessionCancellation(sessionId: string, note?: string) {
  const { data: existingCharge, error: existingError } = await supabase
    .from('cancellation_charges')
    .select('id')
    .eq('session_id', sessionId)
    .in('status', ['pending_review', 'confirmed', 'paid'])
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingCharge) return null;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, center_id, patient_id, session_date, start_time, session_type, session_type_id, price')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session?.patient_id || !session.center_id) return null;

  const signedPolicyVersionId = await resolveSignedCancellationPolicyVersion(session.center_id, session.patient_id);
  if (!signedPolicyVersionId) return null;

  const { data: signedPolicy, error: policyError } = await supabase
    .from('cancellation_policy_versions')
    .select('id, rules, penalty_invoice_concept')
    .eq('id', signedPolicyVersionId)
    .maybeSingle();

  if (policyError) throw policyError;
  if (!signedPolicy) return null;

  const evaluation = evaluateCancellationCharge({
    rules: signedPolicy.rules as Record<string, unknown>,
    sessionStartsAt: new Date(`${session.session_date}T${session.start_time}`),
    basePrice: await resolveCancellationBasePrice({
      centerId: session.center_id,
      patientId: session.patient_id,
      sessionTypeId: session.session_type_id,
      sessionTypeName: session.session_type,
      sessionDate: session.session_date,
      sessionPrice: session.price,
    }),
  });

  if (!evaluation.applies) return null;

  const { data: charge, error: chargeError } = await supabase
    .from('cancellation_charges')
    .insert({
      center_id: session.center_id,
      patient_id: session.patient_id,
      session_id: session.id,
      policy_version_id: signedPolicy.id,
      status: 'pending_review',
      amount: evaluation.amount,
      original_amount: evaluation.amount,
      percentage: evaluation.percentage,
      base_session_price: evaluation.basePrice,
      concept: signedPolicy.penalty_invoice_concept || 'Cancelacion fuera de plazo segun politica aceptada',
      review_note: note || 'Cancelacion registrada por el profesional desde agenda',
    })
    .select()
    .single();

  if (chargeError) throw chargeError;
  return charge;
}

export function useCancellationCharges(status: CancellationCharge['status'] = 'pending_review') {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['cancellation-charges', profile?.center_id, status],
    queryFn: async () => {
      if (!profile?.center_id) return [];

      const { data, error } = await supabase
        .from('cancellation_charges')
        .select(`
          *,
          patients(id, first_name, last_name, email, phone),
          sessions(id, session_date, start_time, session_type)
        `)
        .eq('center_id', profile.center_id)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as CancellationCharge[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useConfirmCancellationCharge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      charge,
      amount,
      reviewNote,
    }: {
      charge: CancellationCharge;
      amount?: number;
      reviewNote?: string;
    }) => {
      const finalAmount = Math.max(Number(amount ?? charge.amount) || 0, 0);
      if (finalAmount <= 0) {
        throw new Error('El importe debe ser mayor que 0 para generar una deuda');
      }

      const debtNotes = [
        charge.concept,
        `Origen: cancelación fuera de plazo según política aceptada.`,
        `Importe revisado: ${finalAmount.toFixed(2)} EUR. Importe estimado inicial: ${Number(charge.original_amount || charge.amount).toFixed(2)} EUR.`,
        `Cálculo inicial: ${charge.percentage}% de ${Number(charge.base_session_price || 0).toFixed(2)} EUR.`,
        reviewNote?.trim() ? `Resolución profesional: ${reviewNote.trim()}` : null,
      ].filter(Boolean).join('\n');

      const { data: debt, error: debtError } = await supabase
        .from('debts')
        .insert({
          center_id: charge.center_id,
          patient_id: charge.patient_id,
          session_id: charge.session_id,
          amount: finalAmount,
          paid_amount: 0,
          status: 'pending',
          notes: debtNotes,
        })
        .select('id')
        .single();

      if (debtError) throw debtError;

      const { error: chargeError } = await supabase
        .from('cancellation_charges')
        .update({
          status: 'confirmed',
          amount: finalAmount,
          debt_id: debt.id,
          review_note: reviewNote?.trim() || charge.review_note,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', charge.id);

      if (chargeError) throw chargeError;
      return debt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancellation-charges'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      toast.success('Deuda generada desde la cancelación');
    },
    onError: (error) => {
      toast.error('No se pudo generar la deuda', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}

export function useForgiveCancellationCharge() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      chargeId,
      reviewNote,
    }: {
      chargeId: string;
      reviewNote?: string;
    }) => {
      const { error } = await supabase
        .from('cancellation_charges')
        .update({
          status: 'forgiven',
          review_note: reviewNote?.trim() || null,
          reviewed_by: profile?.id || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', chargeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cancellation-charges'] });
      toast.success('Cargo perdonado');
    },
    onError: (error) => {
      toast.error('No se pudo perdonar el cargo', {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });
}
