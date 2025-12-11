import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { generateWhatsAppUniversalLink } from '@/lib/whatsapp';
import { useCommunicationTemplate, DEFAULT_TEMPLATES, TEMPLATE_VARIABLES } from './useCommunicationTemplates';
import { toast } from 'sonner';

interface SendNotificationParams {
  patientId: string;
  patientName: string;
  patientPhone?: string | null;
  patientEmail?: string | null;
  sessionId: string;
  sessionDate: string;
  sessionTime: string;
  professionalName?: string;
  sessionType?: string;
  type: 'notification' | 'reminder';
  channels: {
    whatsapp: boolean;
    email: boolean;
    sms: boolean;
  };
}

function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

export interface WhatsAppDialogData {
  phone: string;
  message: string;
  patientName: string;
}

export function useSendSessionNotification() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendNotificationParams): Promise<{ 
      results: { channel: string; success: boolean }[];
      whatsappData?: WhatsAppDialogData;
    }> => {
      if (!profile?.center_id || !center) {
        throw new Error('No center configured');
      }

      const results: { channel: string; success: boolean }[] = [];
      let whatsappData: WhatsAppDialogData | undefined;

      // Build template variables
      const templateVars: Record<string, string> = {
        '{nombre_paciente}': params.patientName.split(' ')[0],
        '{profesional_nombre}': params.professionalName || '',
        '{fecha}': params.sessionDate,
        '{zona_horaria}': params.sessionTime,
        '{sesion_tipo}': params.sessionType || 'Individual',
        '{centro_nombre}': center.name || '',
        '{link_sesion}': `${window.location.origin}/sesiones`,
        '{link_confirmar}': `${window.location.origin}/confirmar`,
      };

      // Handle WhatsApp
      if (params.channels.whatsapp && params.patientPhone) {
        const whatsappMethod = center.whatsapp_send_method || 'web';
        
        // Get template message
        const { data: templateData } = await supabase
          .from('communication_templates')
          .select('whatsapp_message')
          .eq('center_id', profile.center_id)
          .eq('channel', 'whatsapp')
          .eq('template_type', params.type)
          .maybeSingle();

        const defaultTemplate = DEFAULT_TEMPLATES.whatsapp[params.type].whatsapp_message || '';
        const messageTemplate = templateData?.whatsapp_message || defaultTemplate;
        const message = replaceTemplateVariables(messageTemplate, templateVars);

        if (whatsappMethod === 'web') {
          // Save notification as pending (manual)
          await supabase.from('notifications').insert({
            center_id: profile.center_id,
            patient_id: params.patientId,
            session_id: params.sessionId,
            type: 'whatsapp',
            recipient: params.patientPhone,
            message,
            status: 'pending',
          });

          whatsappData = {
            phone: params.patientPhone,
            message,
            patientName: params.patientName,
          };

          results.push({ channel: 'whatsapp', success: true });
        } else if (whatsappMethod === 'api') {
          // Use Meta API via edge function
          const notification = await supabase.from('notifications').insert({
            center_id: profile.center_id,
            patient_id: params.patientId,
            session_id: params.sessionId,
            type: 'whatsapp',
            recipient: params.patientPhone,
            message,
            status: 'pending',
          }).select().single();

          if (notification.data) {
            const { error } = await supabase.functions.invoke('send-notification', {
              body: { notificationId: notification.data.id },
            });
            results.push({ channel: 'whatsapp', success: !error });
          }
        }
      }

      // Handle Email (create pending notification)
      if (params.channels.email && params.patientEmail) {
        await supabase.from('notifications').insert({
          center_id: profile.center_id,
          patient_id: params.patientId,
          session_id: params.sessionId,
          type: 'email',
          recipient: params.patientEmail,
          subject: `${params.type === 'notification' ? 'Nueva cita' : 'Recordatorio'} - ${params.sessionDate}`,
          message: `Tienes una cita programada para el ${params.sessionDate} a las ${params.sessionTime}.`,
          status: 'pending',
        });
        results.push({ channel: 'email', success: true });
      }

      // Handle SMS (create pending notification)
      if (params.channels.sms && params.patientPhone) {
        await supabase.from('notifications').insert({
          center_id: profile.center_id,
          patient_id: params.patientId,
          session_id: params.sessionId,
          type: 'sms',
          recipient: params.patientPhone,
          message: `Cita: ${params.sessionDate} a las ${params.sessionTime}.`,
          status: 'pending',
        });
        results.push({ channel: 'sms', success: true });
      }

      return { results, whatsappData };
    },
    onSuccess: ({ results, whatsappData }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      
      // Don't show toast for WhatsApp web - the dialog will handle it
      if (!whatsappData && results.some(r => r.success)) {
        toast.success('Notificación procesada', {
          description: 'La notificación se ha registrado correctamente.',
        });
      }
    },
    onError: (error) => {
      console.error('Error sending notification:', error);
      toast.error('Error', {
        description: 'No se pudo enviar la notificación.',
      });
    },
  });
}

// Hook for sending a single WhatsApp message immediately (from direct user clicks)
export function useSendWhatsAppNow() {
  const { profile } = useAuth();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async ({
      phone,
      message,
      patientId,
      sessionId,
    }: {
      phone: string;
      message: string;
      patientId?: string;
      sessionId?: string;
    }) => {
      if (!profile?.center_id || !center) {
        throw new Error('No center configured');
      }

      const whatsappMethod = center.whatsapp_send_method || 'web';

      if (whatsappMethod === 'web') {
        const universalLink = generateWhatsAppUniversalLink(phone, message);
        
        // Log notification
        if (patientId) {
          await supabase.from('notifications').insert({
            center_id: profile.center_id,
            patient_id: patientId,
            session_id: sessionId || null,
            type: 'whatsapp',
            recipient: phone,
            message,
            status: 'pending',
          });
        }

        // This is called from direct user click, so window.open works
        window.open(universalLink, '_blank');
        return { method: 'web', universalLink };
      } else {
        // API mode
        const notification = await supabase.from('notifications').insert({
          center_id: profile.center_id,
          patient_id: patientId || null,
          session_id: sessionId || null,
          type: 'whatsapp',
          recipient: phone,
          message,
          status: 'pending',
        }).select().single();

        if (notification.data) {
          await supabase.functions.invoke('send-notification', {
            body: { notificationId: notification.data.id },
          });
        }
        return { method: 'api' };
      }
    },
    onSuccess: (result) => {
      if (result.method === 'web') {
        toast.success('WhatsApp abierto', {
          description: 'Envía el mensaje desde WhatsApp Web.',
        });
      } else {
        toast.success('Mensaje enviado', {
          description: 'El mensaje de WhatsApp se ha enviado.',
        });
      }
    },
    onError: () => {
      toast.error('Error', {
        description: 'No se pudo enviar el mensaje.',
      });
    },
  });
}
