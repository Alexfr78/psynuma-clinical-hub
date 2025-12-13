import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface Center {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  invoice_prefix: string | null;
  invoice_next_number: number | null;
  // Billing fields
  country: string | null;
  province: string | null;
  address_details: string | null;
  default_tax_name: string | null;
  default_tax_rate: number | null;
  include_tax_in_price: boolean | null;
  retention_name: string | null;
  retention_rate: number | null;
  invoice_footer: string | null;
  invoice_logo_url: string | null;
  auto_invoicing_enabled: boolean | null;
  // WhatsApp configuration
  whatsapp_send_method: string | null;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_business_account_id: string | null;
  // Verifactu configuration
  verifactu_certificate_base64: string | null;
  verifactu_certificate_password: string | null;
  verifactu_environment: string | null;
  verifactu_software_name: string | null;
  verifactu_software_version: string | null;
  verifactu_software_nif: string | null;
  // Portal/Reschedule configuration
  reschedule_max_days: number | null;
  reschedule_slot_duration: number | null;
  reschedule_require_confirmation: boolean | null;
  // OAuth credentials - client_ids in plaintext, secrets encrypted
  oauth_google_client_id: string | null;
  oauth_google_credentials: string | null;
  oauth_zoom_client_id: string | null;
  oauth_zoom_credentials: string | null;
  oauth_stripe_publishable_key: string | null;
  oauth_stripe_credentials: string | null;
  // Payment settings
  default_payment_mode: string | null;
  default_scheduled_hours_before: number | null;
  payment_reminder_enabled: boolean | null;
  payment_reminder_hours_after: number | null;
  payment_reminder_max_count: number | null;
  payment_reminder_interval_hours: number | null;
  created_at: string;
  updated_at: string;
}

export function useCenter() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  const { data: center, isLoading } = useQuery({
    queryKey: ['center', centerId],
    queryFn: async () => {
      if (!centerId) return null;
      
      const { data, error } = await supabase
        .from('centers')
        .select('*')
        .eq('id', centerId)
        .maybeSingle();

      if (error) throw error;
      return data as Center | null;
    },
    enabled: !!centerId,
  });

  const updateCenter = useMutation({
    mutationFn: async (updates: Partial<Center>) => {
      if (!centerId) throw new Error('No center ID');
      
      const { data, error } = await supabase
        .from('centers')
        .update(updates)
        .eq('id', centerId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['center', centerId] });
      toast.success('Centro actualizado correctamente');
    },
    onError: (error) => {
      toast.error('Error al actualizar el centro: ' + error.message);
    },
  });

  return {
    center,
    isLoading,
    updateCenter,
    centerId,
  };
}
