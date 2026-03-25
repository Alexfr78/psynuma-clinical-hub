import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { addDays } from 'date-fns';
import { useCenter } from './useCenter';

export interface Consent {
  id: string;
  center_id: string;
  patient_id: string;
  template_id: string;
  professional_id: string;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  access_token: string;
  content_snapshot: string;
  requires_guardian: boolean;
  expires_at: string;
  signed_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  signed_pdf_url: string | null;
  uploaded_file_url: string | null;
  source: 'digital' | 'uploaded' | null;
  created_at: string;
  updated_at: string;
  template?: {
    name: string;
  };
  patient?: {
    first_name: string;
    last_name: string;
  };
  professional?: {
    first_name: string | null;
    last_name: string | null;
  };
}

export interface ConsentSignature {
  id: string;
  consent_id: string;
  signer_name: string;
  signer_role: 'patient' | 'guardian';
  signature_order: number;
  signature_data: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

export function useConsents(patientId?: string) {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();

  const { data: consents = [], isLoading } = useQuery({
    queryKey: ['consents', profile?.center_id, patientId],
    queryFn: async () => {
      if (!profile?.center_id) return [];
      
      let query = supabase
        .from('consents')
        .select(`
          *,
          template:consent_templates(name),
          patient:patients(first_name, last_name),
          professional:profiles(first_name, last_name)
        `)
        .eq('center_id', profile.center_id)
        .order('created_at', { ascending: false });
      
      if (patientId) {
        query = query.eq('patient_id', patientId);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as Consent[];
    },
    enabled: !!profile?.center_id,
  });

  const createConsent = useMutation({
    mutationFn: async ({
      patient_id,
      template_id,
      content_snapshot,
      requires_guardian,
    }: {
      patient_id: string;
      template_id: string;
      content_snapshot: string;
      requires_guardian: boolean;
    }) => {
      if (!profile?.center_id || !profile?.id) throw new Error('No center or profile');
      
      const expirationDays = center?.consent_expiration_days || 7;
      const expires_at = addDays(new Date(), expirationDays).toISOString();
      
      const { data, error } = await supabase
        .from('consents')
        .insert({
          center_id: profile.center_id,
          patient_id,
          template_id,
          professional_id: profile.id,
          content_snapshot,
          requires_guardian,
          expires_at,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      toast.success('Consentimiento creado correctamente');
    },
    onError: (error) => {
      toast.error('Error al crear el consentimiento');
      console.error(error);
    },
  });

  const revokeConsent = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await supabase
        .from('consents')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          revocation_reason: reason,
        })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consents'] });
      toast.success('Consentimiento revocado');
    },
    onError: (error) => {
      toast.error('Error al revocar el consentimiento');
      console.error(error);
    },
  });

  return {
    consents,
    isLoading,
    createConsent,
    revokeConsent,
  };
}

export function useConsentSignatures(consentId: string) {
  const { data: signatures = [], isLoading } = useQuery({
    queryKey: ['consent-signatures', consentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consent_signatures')
        .select('*')
        .eq('consent_id', consentId)
        .order('signature_order', { ascending: true });
      
      if (error) throw error;
      return data as ConsentSignature[];
    },
    enabled: !!consentId,
  });

  return { signatures, isLoading };
}
