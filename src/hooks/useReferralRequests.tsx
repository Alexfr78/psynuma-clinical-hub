import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface ReferralPartnerRequest {
  id: string;
  center_id: string;
  name: string;
  surname: string | null;
  email: string;
  phone: string | null;
  website: string | null;
  description: string | null;
  public_name: string | null;
  modality: string[];
  provinces: string[] | null;
  cities: string[] | null;
  specialties: string[] | null;
  status: string;
  privacy_accepted: boolean;
  privacy_accepted_at: string | null;
  privacy_policy_url: string | null;
  handled_by: string | null;
  handled_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function useReferralRequests() {
  const { centerId } = useCenter();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['referral-requests', centerId],
    queryFn: async () => {
      if (!centerId) return [];
      const { data, error } = await supabase
        .from('referral_partner_requests')
        .select('*')
        .eq('center_id', centerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReferralPartnerRequest[];
    },
    enabled: !!centerId,
  });

  const approveRequest = useMutation({
    mutationFn: async (request: ReferralPartnerRequest) => {
      if (!centerId || !profile?.id) throw new Error('No center or user');

      // Create partner from request
      const { error: partnerError } = await supabase
        .from('referral_partners')
        .insert({
          center_id: centerId,
          name: request.name,
          surname: request.surname,
          public_name: request.public_name,
          email: request.email,
          phone: request.phone,
          website: request.website,
          description: request.description,
          modality: request.modality,
          provinces: request.provinces,
          cities: request.cities,
          specialties: request.specialties,
          active: true,
          priority: 100,
        });
      if (partnerError) throw partnerError;

      // Mark request as approved
      const { error: updateError } = await supabase
        .from('referral_partner_requests')
        .update({
          status: 'approved',
          handled_by: profile.id,
          handled_at: new Date().toISOString(),
        })
        .eq('id', request.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-requests', centerId] });
      queryClient.invalidateQueries({ queryKey: ['referral-partners', centerId] });
      toast.success('Solicitud aprobada. Profesional añadido al catálogo.');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  const rejectRequest = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      if (!profile?.id) throw new Error('No user');
      const { error } = await supabase
        .from('referral_partner_requests')
        .update({
          status: 'rejected',
          handled_by: profile.id,
          handled_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-requests', centerId] });
      toast.success('Solicitud rechazada');
    },
    onError: (e) => toast.error('Error: ' + e.message),
  });

  return { requests, isLoading, approveRequest, rejectRequest };
}
