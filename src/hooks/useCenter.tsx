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
  invoice_data_protection_text: string | null;
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
  default_advance_payment_limit_hours: number | null;
  auto_cancel_unpaid_advance_sessions: boolean | null;
  unpaid_advance_cancellation_alert_threshold: number | null;
  payment_reminder_enabled: boolean | null;
  payment_reminder_hours_after: number | null;
  payment_reminder_max_count: number | null;
  payment_reminder_interval_hours: number | null;
  // Consent settings
  consent_expiration_days: number | null;
  // Portal settings
  portal_enabled: boolean | null;
  portal_slug: string | null;
  portal_require_approval: boolean | null;
  portal_allow_professional_selection: boolean | null;
  portal_default_professional_id: string | null;
  // Public booking
  public_booking_enabled: boolean | null;
  // Agenda closed mode
  portal_agenda_closed: boolean | null;
  // Invoice automation settings
  invoice_on_payment_mode: string | null;
  invoice_send_channel: string | null;
  // Custom domain for notifications
  custom_domain: string | null;
  // Verifactu auto settings
  verifactu_auto_enabled: boolean | null;
  // Session reminder settings
  session_reminder_enabled: boolean | null;
  session_reminder_timing: string | null;
  session_reminder_hours_before: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session_reminder_channels: any;
  // Agenda settings
  agenda_show_weekends: boolean | null;
  // Admin alert settings
  admin_alerts_enabled: boolean | null;
  admin_alerts_emails: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin_alerts_events: any;
  admin_alerts_include_professional: boolean | null;
  // Public domain for payment links
  public_domain: string | null;
  // Bizum phone
  bizum_phone: string | null;
  // Bank transfer info (IBAN, holder, bank...)
  bank_transfer_info: string | null;
  // WasenderAPI settings
  wasender_enabled: boolean | null;
  wasender_reminder_24h: boolean | null;
  wasender_reminder_2h: boolean | null;
  wasender_confirm_booking: boolean | null;
  wasender_notify_cancellation: boolean | null;
  wasender_notify_reschedule: boolean | null;
  wasender_emergency_stop: boolean | null;
  wasender_auto_reminders: boolean | null;
  wasender_confirmation_reply: boolean | null;
  // AI settings
  ai_provider: string | null;
  openai_api_key_encrypted: string | null;
  openai_model: string | null;
  gemini_api_key_encrypted: string | null;
  gemini_model: string | null;
  ai_prompt_system: string | null;
  ai_prompt_layer1: string | null;
  ai_prompt_layer2: string | null;
  ai_prompt_layer3: string | null;
  ai_temperature: number | null;
  ai_analysis_mode: string | null;
  transcript_retention_days: number | null;
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
        .rpc('get_safe_center', { p_center_id: centerId });

      if (error) throw error;
      return (data as unknown as Center) ?? null;
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
        .select('id')
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
