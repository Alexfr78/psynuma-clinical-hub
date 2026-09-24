import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type PatientRelationship = Tables<'patient_relationships'>;

export interface PartnerSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface CoupleLink {
  relationship: PatientRelationship;
  partner: PartnerSummary;
  /** Miembro que paga por defecto las sesiones conjuntas (null = sin definir). */
  defaultPayerId: string | null;
}

const PARTNER_FIELDS = 'id, first_name, last_name, email, phone';

/** Pareja vinculada a un contacto. */
export function usePatientPartner(patientId: string | undefined) {
  return useQuery({
    queryKey: ['patient-partner', patientId],
    queryFn: async (): Promise<CoupleLink | null> => {
      if (!patientId) return null;
      const { data, error } = await supabase
        .from('patient_relationships')
        .select(`
          *,
          patient_a:patients!patient_relationships_patient_a_id_fkey(${PARTNER_FIELDS}),
          patient_b:patients!patient_relationships_patient_b_id_fkey(${PARTNER_FIELDS})
        `)
        .eq('relationship_type', 'couple')
        .or(`patient_a_id.eq.${patientId},patient_b_id.eq.${patientId}`)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as PatientRelationship & {
        patient_a: PartnerSummary;
        patient_b: PartnerSummary;
      };
      const partner = row.patient_a_id === patientId ? row.patient_b : row.patient_a;
      const { patient_a: _a, patient_b: _b, ...relationship } = row;
      return {
        relationship,
        partner,
        defaultPayerId: row.default_payer_patient_id,
      };
    },
    enabled: !!patientId,
  });
}

function invalidateCouple(queryClient: ReturnType<typeof useQueryClient>, ids: string[]) {
  for (const id of ids) {
    queryClient.invalidateQueries({ queryKey: ['patient-partner', id] });
  }
  queryClient.invalidateQueries({ queryKey: ['patient-sessions'] });
}

export function useLinkPartner() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async ({
      patientId,
      partnerId,
      defaultPayerId,
    }: {
      patientId: string;
      partnerId: string;
      defaultPayerId: string | null;
    }) => {
      if (!profile?.center_id) throw new Error('Sin centro asignado');
      // El trigger ordena la pareja; aquí se manda ya ordenada para que el CHECK
      // también se cumpla si algún día se desactiva el trigger.
      const [a, b] = [patientId, partnerId].sort();
      const { error } = await supabase.from('patient_relationships').insert({
        center_id: profile.center_id,
        patient_a_id: a,
        patient_b_id: b,
        relationship_type: 'couple',
        default_payer_patient_id: defaultPayerId,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateCouple(queryClient, [v.patientId, v.partnerId]),
  });
}

export function useUpdateCoupleLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      relationship,
      defaultPayerId,
    }: {
      relationship: PatientRelationship;
      defaultPayerId: string | null;
    }) => {
      const { error } = await supabase
        .from('patient_relationships')
        .update({ default_payer_patient_id: defaultPayerId })
        .eq('id', relationship.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      invalidateCouple(queryClient, [v.relationship.patient_a_id, v.relationship.patient_b_id]),
  });
}

export function useUnlinkPartner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (relationship: PatientRelationship) => {
      const { error } = await supabase
        .from('patient_relationships')
        .delete()
        .eq('id', relationship.id);
      if (error) throw error;
    },
    onSuccess: (_d, r) => invalidateCouple(queryClient, [r.patient_a_id, r.patient_b_id]),
  });
}

/** Participantes extra (no titulares) de una sesión. */
export function useSessionParticipants(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-participants', sessionId],
    queryFn: async (): Promise<PartnerSummary[]> => {
      if (!sessionId) return [];
      const { data, error } = await supabase
        .from('session_participants')
        .select(`patient:patients!session_participants_patient_id_fkey(${PARTNER_FIELDS})`)
        .eq('session_id', sessionId);
      if (error) throw error;
      return (data ?? []).map((r) => (r as unknown as { patient: PartnerSummary }).patient);
    },
    enabled: !!sessionId,
  });
}

/** Añade o quita al segundo miembro de una sesión ya creada. */
export function useSetSessionPartner() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ sessionId, partnerId }: { sessionId: string; partnerId: string | null }) => {
      if (!profile?.center_id) throw new Error('Sin centro asignado');
      const { error: delError } = await supabase
        .from('session_participants')
        .delete()
        .eq('session_id', sessionId);
      if (delError) throw delError;
      if (!partnerId) return;
      const { error } = await supabase.from('session_participants').insert({
        session_id: sessionId,
        patient_id: partnerId,
        center_id: profile.center_id,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ['session-participants', v.sessionId] });
      queryClient.invalidateQueries({ queryKey: ['patient-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export interface PendingCoupleCancellation {
  id: string;
  requested_by_patient_id: string;
  other_patient_id: string;
  deadline_at: string;
  cancellation_reason: string | null;
  charge_applies: boolean;
  charge_amount: number | null;
}

/** Cancelación de pareja pendiente de que el otro miembro responda. */
export function usePendingCoupleCancellation(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['couple-cancellation-pending', sessionId],
    queryFn: async (): Promise<PendingCoupleCancellation | null> => {
      const { data, error } = await supabase
        .from('couple_cancellation_requests')
        .select('id, requested_by_patient_id, other_patient_id, deadline_at, cancellation_reason, charge_applies, charge_amount')
        .eq('session_id', sessionId!)
        .eq('status', 'pending')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!sessionId,
  });
}

/** El profesional resuelve la solicitud (tras hablar con la pareja, por ejemplo). */
export function useResolveCoupleCancellation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, decision }: { requestId: string; decision: 'cancel_both' | 'attend_alone' }) => {
      const { data, error } = await supabase.functions.invoke('couple-cancellation', {
        body: { action: 'professional_resolve', request_id: requestId, decision },
      });
      if (error) throw error;
      return data as { status: string; message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['couple-cancellation-pending'] });
      queryClient.invalidateQueries({ queryKey: ['session-participants'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['patient-sessions'] });
    },
  });
}
