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

export function useSendInvoiceNotification() {
  return useMutation({
    mutationFn: async (params: SendInvoiceNotificationParams) => {
      const { data, error } = await supabase.functions.invoke('send-invoice-notification', {
        body: params,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data?.emailSent && data?.whatsappSent) {
        toast.success('Factura enviada por email y WhatsApp');
      } else if (data?.emailSent) {
        toast.success('Factura enviada por email');
      } else if (data?.whatsappSent) {
        toast.success('Enlace de factura generado para WhatsApp');
      }
    },
    onError: (error) => {
      console.error('Error sending invoice notification:', error);
      toast.error('Error al enviar la factura');
    },
  });
}
