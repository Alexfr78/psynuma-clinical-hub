import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';
import { useAuth } from './useAuth';

export interface IntakeRequest {
  id: string;
  center_id: string;
  request_type: 'waitlist' | 'referral';
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  modality: string | null;
  city: string | null;
  notes: string | null;
  status: 'pending' | 'contacted' | 'converted' | 'cancelled';
  handled_by: string | null;
  handled_at: string | null;
  internal_notes: string | null;
  privacy_accepted: boolean | null;
  privacy_accepted_at: string | null;
  privacy_policy_url: string | null;
  specialty: string | null;
  referral_context: Record<string, any> | null;
  selected_partner_id: string | null;
  recommended_partner_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export type IntakeRequestStatus = 'pending' | 'contacted' | 'converted' | 'cancelled';
export type IntakeRequestType = 'waitlist' | 'referral';

interface UseIntakeRequestsFilters {
  type?: IntakeRequestType | null;
  status?: IntakeRequestStatus | null;
  search?: string;
}

export function useIntakeRequests(filters: UseIntakeRequestsFilters = {}) {
  const { centerId } = useCenter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading, error } = useQuery({
    queryKey: ['intake-requests', centerId, filters],
    queryFn: async () => {
      if (!centerId) return [];

      let query = supabase
        .from('portal_intake_requests')
        .select('*')
        .eq('center_id', centerId)
        .order('created_at', { ascending: false });

      if (filters.type) {
        query = query.eq('request_type', filters.type);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.search) {
        const searchTerm = `%${filters.search}%`;
        query = query.or(`first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as IntakeRequest[];
    },
    enabled: !!centerId,
  });

  const updateRequest = useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<Pick<IntakeRequest, 'status' | 'internal_notes' | 'handled_by' | 'handled_at'>> 
    }) => {
      const { data, error } = await supabase
        .from('portal_intake_requests')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake-requests', centerId] });
      toast.success('Solicitud actualizada');
    },
    onError: (error) => {
      toast.error('Error al actualizar: ' + error.message);
    },
  });

  const markAsContacted = async (id: string) => {
    await updateRequest.mutateAsync({
      id,
      updates: {
        status: 'contacted',
        handled_by: user?.id || null,
        handled_at: new Date().toISOString(),
      },
    });
  };

  const markAsClosed = async (id: string) => {
    await updateRequest.mutateAsync({
      id,
      updates: {
        status: 'cancelled',
        handled_by: user?.id || null,
        handled_at: new Date().toISOString(),
      },
    });
  };

  const updateInternalNotes = async (id: string, notes: string) => {
    await updateRequest.mutateAsync({
      id,
      updates: {
        internal_notes: notes,
      },
    });
  };

  const updateStatus = async (id: string, status: IntakeRequestStatus) => {
    await updateRequest.mutateAsync({
      id,
      updates: {
        status,
        handled_by: user?.id || null,
        handled_at: new Date().toISOString(),
      },
    });
  };

  return {
    requests,
    isLoading,
    error,
    updateRequest,
    markAsContacted,
    markAsClosed,
    updateInternalNotes,
    updateStatus,
  };
}
