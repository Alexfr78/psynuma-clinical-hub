import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { createCancellationChargeForSessionCancellation } from './useCancellationCharges';
import { resolvePatientCancellationPolicyForSession } from './useCancellationPolicy';
import { useCenter } from './useCenter';

export type Session = Tables<'sessions'>;
export type SessionInsert = TablesInsert<'sessions'>;
export type SessionUpdate = TablesUpdate<'sessions'>;

export interface SessionWithRelations extends Session {
  patient?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    auto_invoice_on_complete: boolean;
  } | null;
  professional?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

export function useSessions(startDate?: string, endDate?: string, professionalId?: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sessions', startDate, endDate, professionalId],
    queryFn: async () => {
      let query = supabase
        .from('sessions')
        .select(`
          *,
          patient:patients!sessions_patient_id_fkey(
            id, first_name, last_name, email, phone, auto_invoice_on_complete
          ),
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          )
        `)
        .neq('status', 'cancelled') // Exclude cancelled sessions from agenda
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (startDate) {
        query = query.gte('session_date', startDate);
      }
      if (endDate) {
        query = query.lte('session_date', endDate);
      }
      if (professionalId && professionalId !== 'all') {
        query = query.eq('professional_id', professionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SessionWithRelations[];
    },
    enabled: !!profile?.center_id,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async (session: Omit<SessionInsert, 'center_id'>) => {
      if (!profile?.center_id) throw new Error('No center assigned');

      const { data: activePolicy } = await supabase
        .from('cancellation_policy_versions')
        .select('id')
        .eq('center_id', profile.center_id)
        .eq('is_active', true)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const policyState = await resolvePatientCancellationPolicyForSession(
        profile.center_id,
        session.patient_id,
        activePolicy?.id,
        center?.cancellation_policy_enabled ?? undefined,
      );

      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...session, ...policyState, center_id: profile.center_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useUpdateSession() {
  const queryClient = useQueryClient();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async ({ id, ...updates }: SessionUpdate & { id: string }) => {
      let updatesWithPolicy = updates;
      if (updates.status === 'cancelled' && updates.cancellation_origin == null) {
        updatesWithPolicy = {
          ...updates,
          cancellation_origin: 'professional',
        };
      }
      if (updates.patient_id !== undefined) {
        const { data: currentSession, error: currentSessionError } = await supabase
          .from('sessions')
          .select('center_id')
          .eq('id', id)
          .single();

        if (currentSessionError) throw currentSessionError;

        const { data: activePolicy } = await supabase
          .from('cancellation_policy_versions')
          .select('id')
          .eq('center_id', currentSession.center_id)
          .eq('is_active', true)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const policyState = await resolvePatientCancellationPolicyForSession(
          currentSession.center_id,
          updates.patient_id,
          activePolicy?.id,
          center?.cancellation_policy_enabled ?? undefined,
        );
        updatesWithPolicy = { ...updates, ...policyState };
      }

      const { data, error } = await supabase
        .from('sessions')
        .update(updatesWithPolicy)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (
        updatesWithPolicy.status === 'cancelled'
        && updatesWithPolicy.cancellation_origin === 'patient'
      ) {
        await createCancellationChargeForSessionCancellation(
          id,
          typeof updatesWithPolicy.cancellation_reason === 'string'
            ? updatesWithPolicy.cancellation_reason
            : 'Cancelacion registrada por el profesional desde agenda',
          center?.cancellation_policy_enabled ?? undefined,
        );
      }

      // If price changed, update the associated debt amount
      if (updatesWithPolicy.price !== undefined) {
        const { data: debt, error: debtError } = await supabase
          .from('debts')
          .select('id, paid_amount, status')
          .eq('session_id', id)
          .maybeSingle();

        if (debtError) {
          console.error('Error fetching debt for session:', debtError);
        }

        if (debt) {
          const newAmount = Number(updatesWithPolicy.price);
          const paidAmount = Number(debt.paid_amount) || 0;
          
          // If the new amount is 0 and no payments have been made, delete the debt
          if (newAmount === 0 && paidAmount === 0) {
            const { error: deleteError } = await supabase
              .from('debts')
              .delete()
              .eq('id', debt.id);
            
            if (deleteError) {
              console.error('Error deleting zero-amount debt:', deleteError);
            }
          } else {
            // Determine new status based on payment
            let newStatus: 'pending' | 'partial' | 'paid' = 'pending';
            if (newAmount > 0 && paidAmount >= newAmount) {
              newStatus = 'paid';
            } else if (paidAmount > 0) {
              newStatus = 'partial';
            }

            const { error: updateError } = await supabase
              .from('debts')
              .update({ 
                amount: newAmount,
                status: newStatus 
              })
              .eq('id', debt.id);

            if (updateError) {
              console.error('Error updating debt:', updateError);
            }
          }
        }

        // Also update billable_events if exists
        await supabase
          .from('billable_events')
          .update({ amount: updatesWithPolicy.price })
          .eq('session_id', id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
      queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['session-invoice-status'] });
      queryClient.invalidateQueries({ queryKey: ['cancellation-charges'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First, remove bono from session (returns used session to bono)
      await supabase.rpc('remove_bono_from_session', { p_session_id: id });

      // If there's a debt linked to the session, remove it (or detach it if it has invoice/payments)
      const { data: debts, error: debtsError } = await supabase
        .from('debts')
        .select('id, invoice_id, paid_amount, notes')
        .eq('session_id', id);

      if (debtsError) throw debtsError;

      const deletableDebtIds = (debts ?? [])
        .filter((d) => !d.invoice_id && (Number(d.paid_amount) || 0) === 0)
        .map((d) => d.id);

      if (deletableDebtIds.length > 0) {
        const { error: deleteDebtError } = await supabase
          .from('debts')
          .delete()
          .in('id', deletableDebtIds);
        if (deleteDebtError) throw deleteDebtError;
      }

      const debtsToDetach = (debts ?? []).filter(
        (d) => d.invoice_id || (Number(d.paid_amount) || 0) > 0
      );

      if (debtsToDetach.length > 0) {
        // Keep financial history, but detach from the deleted session
        const updates = debtsToDetach.map((d) =>
          supabase
            .from('debts')
            .update({
              session_id: null,
              notes: `${d.notes ? `${d.notes} | ` : ''}Sesión eliminada`,
            })
            .eq('id', d.id)
        );

        const results = await Promise.all(updates);
        const firstError = results.find((r) => r.error)?.error;
        if (firstError) throw firstError;
      }

      // Then delete the session
      const { error } = await supabase.from('sessions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
    },
  });
}

export function useAvailability(professionalId?: string) {
  return useQuery({
    queryKey: ['availability', professionalId],
    queryFn: async () => {
      let query = supabase
        .from('availability')
        .select('*')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (professionalId) {
        query = query.eq('professional_id', professionalId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!professionalId,
  });
}
