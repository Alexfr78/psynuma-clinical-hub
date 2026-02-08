import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface WhatsAppSession {
  id: string;
  center_id: string;
  wasender_session_id: string | null;
  status: 'connected' | 'disconnected' | 'need_scan' | 'expired';
  qr_code: string | null;
  phone_number: string | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppMessage {
  id: string;
  center_id: string;
  phone: string;
  content: string;
  type: string;
  message_type?: string | null;
  status: string;
  wasender_message_id: string | null;
  patient_id?: string | null;
  session_id?: string | null;
  media_url: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  direction?: string | null;
  caption?: string | null;
  template_name?: string | null;
  template_variables?: unknown;
  metadata?: unknown;
  created_at: string;
}

export function useWasender() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const centerId = profile?.center_id;

  // Fetch WhatsApp session status
  const { data: session, isLoading: isLoadingSession, refetch: refetchSession } = useQuery({
    queryKey: ['whatsapp-session', centerId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('wasender-get-session');
      
      if (error) throw error;
      return data?.session as WhatsAppSession | null;
    },
    enabled: !!centerId,
    refetchInterval: (query) => {
      // Poll more frequently when waiting for QR scan
      if (query.state.data?.status === 'need_scan') return 5000;
      return 30000;
    },
  });

  // Fetch message history
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['whatsapp-messages', centerId],
    queryFn: async () => {
      if (!centerId) return [];
      
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('center_id', centerId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as WhatsAppMessage[];
    },
    enabled: !!centerId,
  });

  // Connect WhatsApp (request QR)
  const connectWhatsApp = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('wasender-connect');
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-session', centerId] });
      if (data?.qr_code) {
        toast.info('Escanea el código QR con tu WhatsApp');
      } else if (data?.status === 'connected') {
        toast.success('WhatsApp ya está conectado');
      }
    },
    onError: (error: Error) => {
      console.error('Error connecting WhatsApp:', error);
      if (error.message.includes('CREDENTIALS_MISSING')) {
        toast.error('Las credenciales de WasenderAPI no están configuradas');
      } else {
        toast.error('Error al conectar WhatsApp');
      }
    },
  });

  // Send a test message
  const sendMessage = useMutation({
    mutationFn: async (params: {
      phone: string;
      message: string;
      type?: 'text' | 'image';
      image_url?: string;
      patient_id?: string;
      session_id?: string;
      message_type?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('wasender-send-message', {
        body: params,
      });
      
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error sending message');
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages', centerId] });
      toast.success('Mensaje enviado correctamente');
    },
    onError: (error: Error) => {
      console.error('Error sending message:', error);
      if (error.message.includes('SESSION_NOT_CONNECTED')) {
        toast.error('WhatsApp no está conectado');
      } else if (error.message.includes('CREDENTIALS_MISSING')) {
        toast.error('Las credenciales de WasenderAPI no están configuradas');
      } else {
        toast.error('Error al enviar el mensaje');
      }
    },
  });

  // Get message statistics
  const stats = {
    total: messages?.length || 0,
    sent: messages?.filter(m => m.status === 'sent' || m.status === 'delivered').length || 0,
    failed: messages?.filter(m => m.status === 'failed').length || 0,
    queued: messages?.filter(m => m.status === 'queued').length || 0,
  };

  return {
    session,
    messages,
    stats,
    isLoading: isLoadingSession || isLoadingMessages,
    isConnected: session?.status === 'connected',
    qrCode: session?.qr_code,
    connectWhatsApp,
    sendMessage,
    refetchSession,
  };
}
