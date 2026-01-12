import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

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
            id, first_name, last_name, email, phone
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

  return useMutation({
    mutationFn: async (session: Omit<SessionInsert, 'center_id'>) => {
      if (!profile?.center_id) throw new Error('No center assigned');

      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...session, center_id: profile.center_id })
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

  return useMutation({
    mutationFn: async ({ id, ...updates }: SessionUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('sessions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If price changed, update the associated debt amount
      if (updates.price !== undefined) {
        const { data: debt, error: debtError } = await supabase
          .from('debts')
          .select('id, paid_amount, status')
          .eq('session_id', id)
          .maybeSingle();

        if (debtError) {
          console.error('Error fetching debt for session:', debtError);
        }

        if (debt) {
          const newAmount = Number(updates.price);
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
          .update({ amount: updates.price })
          .eq('session_id', id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['billable-events'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First, remove bono from session (returns used session to bono)
      await supabase.rpc('remove_bono_from_session', { p_session_id: id });
      
      // Then delete the session
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['bonos'] });
      queryClient.invalidateQueries({ queryKey: ['patient-active-bonos'] });
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
