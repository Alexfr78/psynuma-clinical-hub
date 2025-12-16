import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SendInvoiceNotificationParams {
  invoiceId: string;
  patientId: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  channel: 'email' | 'whatsapp' | 'both';
}

interface SendInvoiceNotificationResult {
  success: boolean;
  emailSent?: boolean;
  whatsappSent?: boolean;
  whatsappLink?: string | null;
  whatsappSendMethod?: string;
  error?: string;
}

export function useSendInvoiceNotification() {
  return useMutation({
    mutationFn: async (params: SendInvoiceNotificationParams): Promise<SendInvoiceNotificationResult> => {
      const { data, error } = await supabase.functions.invoke('send-invoice-notification', {
        body: params,
      });

      if (error) throw error;
      return data as SendInvoiceNotificationResult;
    },
    onSuccess: (data) => {
      const isWhatsAppWeb = data?.whatsappSendMethod === 'web' && data?.whatsappLink;
      
      if (data?.emailSent && data?.whatsappSent && !isWhatsAppWeb) {
        // Both sent automatically via API
        toast.success('Factura enviada por email y WhatsApp');
      } else if (data?.emailSent && isWhatsAppWeb) {
        // Email sent, WhatsApp is web mode
        toast.success('Email enviado', {
          description: 'Abre WhatsApp para enviar el mensaje.',
        });
        // Open WhatsApp link in new tab
        if (data.whatsappLink) {
          window.open(data.whatsappLink, '_blank');
        }
      } else if (data?.emailSent) {
        toast.success('Factura enviada por email');
      } else if (isWhatsAppWeb) {
        // Only WhatsApp web mode
        toast.success('WhatsApp listo', {
          description: 'Se abrirá WhatsApp para enviar el mensaje.',
        });
        // Open WhatsApp link in new tab
        if (data.whatsappLink) {
          window.open(data.whatsappLink, '_blank');
        }
      } else if (data?.whatsappSent) {
        // WhatsApp sent via API
        toast.success('Factura enviada por WhatsApp');
      }
    },
    onError: (error) => {
      console.error('Error sending invoice notification:', error);
      toast.error('Error al enviar la factura');
    },
  });
}
