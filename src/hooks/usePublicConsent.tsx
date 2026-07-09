import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PublicConsent {
  id: string;
  patient_id: string;
  status: 'pending' | 'signed' | 'revoked' | 'expired';
  access_token: string;
  content_snapshot: string;
  requires_guardian: boolean;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  expires_at: string;
  signed_at: string | null;
  verification_responses: Record<string, boolean> | null;
  patient: {
    first_name: string;
    last_name: string;
    guardian_name: string | null;
    guardian_relationship: string | null;
  };
  professional: {
    first_name: string | null;
    last_name: string | null;
  };
  template: {
    name: string;
    verification_checkboxes: string[] | null;
    requires_emergency_contact: boolean;
  };
  signatures: {
    id: string;
    signer_role: string;
    signature_order: number;
    signed_at: string;
  }[];
}

export function usePublicConsent(token: string | undefined) {
  const queryClient = useQueryClient();

  const { data: consent, isLoading, error } = useQuery({
    queryKey: ['public-consent', token],
    queryFn: async () => {
      if (!token) throw new Error('No token');
      
      const { data, error } = await supabase
        .from('consents')
        .select(`
          id,
          patient_id,
          status,
          access_token,
          content_snapshot,
          requires_guardian,
          emergency_contact_name,
          emergency_contact_phone,
          expires_at,
          signed_at,
          verification_responses,
          patient:patients(first_name, last_name, guardian_name, guardian_relationship),
          professional:profiles(first_name, last_name),
          template:consent_templates(name, verification_checkboxes, requires_emergency_contact),
          signatures:consent_signatures(id, signer_role, signature_order, signed_at)
        `)
        .eq('access_token', token)
        .setHeader('x-consent-token', token)
        .single();
      
      if (error) throw error;
      return data as unknown as PublicConsent;
    },
    enabled: !!token,
  });

  const addSignature = useMutation({
    mutationFn: async ({
      consentId,
      signerName,
      signerRole,
      signatureOrder,
      signatureData,
    }: {
      consentId: string;
      signerName: string;
      signerRole: 'patient' | 'guardian';
      signatureOrder: number;
      signatureData: string;
    }) => {
      if (!token) throw new Error('No token');
      
      // Use edge function to capture real IP address
      const { data, error } = await supabase.functions.invoke('submit-consent-signature', {
        body: {
          consent_id: consentId,
          signer_name: signerName,
          signer_role: signerRole,
          signature_order: signatureOrder,
          signature_data: signatureData,
        },
        headers: {
          'x-consent-token': token,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-consent', token] });
    },
    onError: (error) => {
      toast.error('Error al guardar la firma');
      console.error(error);
    },
  });

  const saveVerificationResponses = useMutation({
    mutationFn: async ({
      consentId,
      responses,
    }: {
      consentId: string;
      responses: Record<string, boolean>;
    }) => {
      if (!token) throw new Error('No token');
      
      const { data, error } = await supabase
        .from('consents')
        .update({
          verification_responses: responses,
        })
        .eq('id', consentId)
        .setHeader('x-consent-token', token)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-consent', token] });
    },
    onError: (error) => {
      toast.error('Error al guardar las autorizaciones');
      console.error(error);
    },
  });

  const updateEmergencyContact = useMutation({
    mutationFn: async ({
      consentId,
      emergencyContactName,
      emergencyContactPhone,
    }: {
      consentId: string;
      emergencyContactName: string;
      emergencyContactPhone: string;
    }) => {
      if (!token) throw new Error('No token');

      const { data, error } = await supabase.functions.invoke('update-consent-emergency-contact', {
        body: {
          consent_id: consentId,
          emergency_contact_name: emergencyContactName,
          emergency_contact_phone: emergencyContactPhone,
        },
        headers: {
          'x-consent-token': token,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-consent', token] });
    },
    onError: (error) => {
      toast.error('Error al guardar el contacto de emergencia');
      console.error(error);
    },
  });

  const markAsSigned = useMutation({
    mutationFn: async (consentId: string) => {
      if (!token) throw new Error('No token');
      
      const { data, error } = await supabase
        .from('consents')
        .update({
          status: 'signed',
          signed_at: new Date().toISOString(),
        })
        .eq('id', consentId)
        .setHeader('x-consent-token', token)
        .select()
        .single();
      
      if (error) throw error;
      
      // Generate PDF
      try {
        await supabase.functions.invoke('generate-consent-pdf', {
          body: { consent_id: consentId },
        });
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-consent', token] });
      toast.success('Documento firmado correctamente');
    },
    onError: (error) => {
      toast.error('Error al completar la firma');
      console.error(error);
    },
  });

  const isExpired = consent ? new Date(consent.expires_at) < new Date() : false;

  return {
    consent,
    isLoading,
    error,
    isExpired,
    addSignature,
    saveVerificationResponses,
    updateEmergencyContact,
    markAsSigned,
  };
}
