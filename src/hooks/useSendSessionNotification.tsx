import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { buildPublicUrl, getPublicBaseUrl } from '@/lib/public-base-url';
import { useAuth } from './useAuth';
import { useCenter, type Center } from './useCenter';
import { generateWhatsAppUniversalLink, generateWhatsAppWebLink } from '@/lib/whatsapp';
import { DEFAULT_TEMPLATES } from './useCommunicationTemplates';
import { toast } from 'sonner';

// Check for duplicate notifications to prevent spam
async function checkDuplicateNotification(
  centerId: string,
  sessionId: string,
  type: 'whatsapp' | 'email' | 'sms',
  templateType: string
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('center_id', centerId)
    .eq('session_id', sessionId)
    .eq('type', type)
    .in('status', ['sent', 'pending'])
    .gte('created_at', oneHourAgo)
    .limit(1);
  
  if (error) {
    console.error('[Notification] Error checking duplicates:', error);
    return false;
  }
  
  return (data?.length || 0) > 0;
}

// Check rate limit for center (max N notifications per minute)
async function checkRateLimit(centerId: string, maxPerMinute: number = 10): Promise<{
  allowed: boolean;
  shouldQueue: boolean;
}> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('center_id', centerId)
    .gte('created_at', oneMinuteAgo);
  
  if (error) {
    console.error('[Notification] Error checking rate limit:', error);
    return { allowed: true, shouldQueue: false };
  }
  
  const currentCount = count || 0;
  if (currentCount >= maxPerMinute) {
    return { allowed: false, shouldQueue: true };
  }
  
  return { allowed: true, shouldQueue: false };
}

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
  manualLink?: string;
}

export interface NotificationMutationResult {
  results: { channel: string; success: boolean }[];
  whatsappData?: WhatsAppDialogData;
  whatsappAutoSent?: boolean;
}

/**
 * Standalone async function for sending session notifications.
 * Can be called directly without React Query, avoiding nested mutation issues.
 */
export async function sendSessionNotificationDirect(
  params: SendNotificationParams & { sessionAccessToken?: string },
  centerId: string,
  center: Center
): Promise<NotificationMutationResult> {
  const results: { channel: string; success: boolean }[] = [];
  let whatsappData: WhatsAppDialogData | undefined;
  let whatsappAutoSent = false;

  // Get session access token if not provided
  let accessToken = params.sessionAccessToken;
  if (!accessToken) {
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('access_token')
      .eq('id', params.sessionId)
      .maybeSingle();
    accessToken = sessionData?.access_token || '';
  }

  // Resolve the public link through the short-link service so manually sent
  // notifications use the same patient-facing URL as automated messages.
  let appointmentLink = getPublicBaseUrl();
  if (accessToken) {
    const { data: shortLinkData, error: shortLinkError } = await supabase.functions.invoke(
      'create-public-session-short-link',
      { body: { session_id: params.sessionId } },
    );
    if (shortLinkError || !shortLinkData?.path) {
      throw new Error(shortLinkError?.message || shortLinkData?.error || 'No se pudo crear el enlace corto de la cita');
    }
    appointmentLink = buildPublicUrl(shortLinkData.path);
  }

  // Get professional details for template variables
  const professionalParts = (params.professionalName || '').split(' ');
  const professionalFirstName = professionalParts[0] || '';
  const professionalLastName = professionalParts.slice(1).join(' ') || '';

  // Build full address
  const centerAddress = [
    center.address,
    center.address_details,
    center.city,
    center.postal_code,
    center.province,
  ].filter(Boolean).join(', ');

  // Build template variables
  const templateVars: Record<string, string> = {
    '{nombre_paciente}': params.patientName.split(' ')[0],
    '{apellidos_paciente}': params.patientName.split(' ').slice(1).join(' ') || '',
    '{paciente_nombre_completo}': params.patientName,
    '{profesional_nombre}': professionalFirstName,
    '{profesional_apellidos}': professionalLastName,
    '{profesional_nombre_completo}': params.professionalName || '',
    '{fecha}': params.sessionDate,
    '{hora}': params.sessionTime,
    '{zona_horaria}': params.sessionTime,
    '{sesion_tipo}': params.sessionType || 'Individual',
    '{tipo_sesion}': params.sessionType || 'Individual',
    '{centro_nombre}': center.name || '',
    '{direccion}': centerAddress,
    '{direccion_centro}': centerAddress,
    '{telefono_centro}': center.phone || '',
    '{email_centro}': center.email || '',
    '{link_sesion}': appointmentLink,
    '{link_confirmar}': appointmentLink,
    '{link_cita}': appointmentLink,
  };

  console.log('[Notification] Template variables built:', templateVars);

  // Handle WhatsApp
  if (params.channels.whatsapp && params.patientPhone) {
    const isDuplicate = await checkDuplicateNotification(
      centerId,
      params.sessionId,
      'whatsapp',
      params.type
    );

    if (isDuplicate) {
      console.log('[Notification] Duplicate WhatsApp notification detected, skipping');
      results.push({ channel: 'whatsapp', success: false });
    } else {
      const { data: templateData } = await supabase
        .from('communication_templates')
        .select('whatsapp_message')
        .eq('center_id', centerId)
        .eq('channel', 'whatsapp')
        .eq('template_type', params.type)
        .maybeSingle();

      const defaultTemplate = DEFAULT_TEMPLATES.whatsapp[params.type].whatsapp_message || '';
      const messageTemplate = templateData?.whatsapp_message || defaultTemplate;
      const message = replaceTemplateVariables(messageTemplate, templateVars);

      const metaConfigured =
        (center.whatsapp_send_method || 'web') === 'api' && !!center.whatsapp_access_token;

      const deliverManual = async () => {
        await supabase.from('notifications').insert({
          center_id: centerId,
          patient_id: params.patientId,
          session_id: params.sessionId,
          type: 'whatsapp',
          recipient: params.patientPhone,
          message,
          status: 'pending',
        });

        whatsappData = {
          phone: params.patientPhone!,
          message,
          patientName: params.patientName,
          manualLink: generateWhatsAppUniversalLink(params.patientPhone!, message),
        };

        results.push({ channel: 'whatsapp', success: true });
      };

      const deliverMetaApi = async () => {
        const rateLimit = await checkRateLimit(centerId);
        const scheduledFor = rateLimit.shouldQueue
          ? new Date(Date.now() + 60 * 1000).toISOString()
          : null;

        const notificationData: {
          center_id: string;
          patient_id: string;
          session_id: string;
          type: 'whatsapp';
          recipient: string;
          message: string;
          status: 'pending';
          scheduled_for?: string;
        } = {
          center_id: centerId,
          patient_id: params.patientId,
          session_id: params.sessionId,
          type: 'whatsapp',
          recipient: params.patientPhone!,
          message,
          status: 'pending',
        };

        if (scheduledFor) {
          notificationData.scheduled_for = scheduledFor;
        }

        const notification = await supabase.from('notifications')
          .insert(notificationData)
          .select()
          .single();

        if (notification.data && !rateLimit.shouldQueue) {
          const { error } = await supabase.functions.invoke('send-notification', {
            body: { notificationId: notification.data.id },
          });
          whatsappAutoSent = !error;
          results.push({ channel: 'whatsapp', success: !error });
        } else if (rateLimit.shouldQueue) {
          console.log('[Notification] Rate limited, queued for later');
          whatsappAutoSent = true;
          results.push({ channel: 'whatsapp', success: true });
        } else {
          results.push({ channel: 'whatsapp', success: false });
        }
      };

      // Priority 1: WasenderAPI if enabled and connected
      if (center.wasender_enabled && !center.wasender_emergency_stop) {
        const { data: wasenderSession } = await supabase
          .from('whatsapp_sessions')
          .select('status')
          .eq('center_id', centerId)
          .maybeSingle();

        if (wasenderSession?.status === 'connected') {
          console.log('[Notification] Sending via WasenderAPI (auto)');

          const { data, error } = await supabase.functions.invoke('wasender-send-message', {
            body: {
              phone: params.patientPhone,
              message,
              patient_id: params.patientId,
              session_id: params.sessionId,
              message_type: params.type,
            },
          });

          if (!error && data?.success) {
            whatsappAutoSent = true;
            results.push({ channel: 'whatsapp', success: true });
          } else {
            console.warn('[Notification] WasenderAPI failed:', { error: error?.message, data });
            if (metaConfigured) {
              await deliverMetaApi();
            } else {
              await deliverManual();
            }
          }
        } else {
          console.log('[Notification] WasenderAPI enabled but not connected');
          if (metaConfigured) {
            await deliverMetaApi();
          } else {
            await deliverManual();
          }
        }
      } else {
        if (metaConfigured) {
          await deliverMetaApi();
        } else {
          await deliverManual();
        }
      }
    }
  }

  // Handle Email
  if (params.channels.email && params.patientEmail) {
    const { data: emailTemplate } = await supabase
      .from('communication_templates')
      .select('email_subject, email_initial_text, email_confirmation_text, email_videocall_text, email_payment_text, email_footer')
      .eq('center_id', centerId)
      .eq('channel', 'email')
      .eq('template_type', params.type)
      .maybeSingle();

    const defaults = DEFAULT_TEMPLATES.email[params.type];
    
    const subjectTemplate = emailTemplate?.email_subject || defaults.email_subject || 'Nueva cita - {fecha}';
    const emailSubject = replaceTemplateVariables(subjectTemplate, templateVars);

    let emailBody = '';
    
    const initialText = emailTemplate?.email_initial_text || defaults.email_initial_text || '';
    if (initialText) {
      emailBody += replaceTemplateVariables(initialText, templateVars);
    }

    const confirmationText = emailTemplate?.email_confirmation_text || defaults.email_confirmation_text || '';
    if (confirmationText && accessToken) {
      emailBody += '\n\n' + replaceTemplateVariables(confirmationText, templateVars);
    }

    const footerText = emailTemplate?.email_footer || defaults.email_footer || '';
    if (footerText) {
      emailBody += '\n\n---\n' + replaceTemplateVariables(footerText, templateVars);
    }

    const notification = await supabase.from('notifications').insert({
      center_id: centerId,
      patient_id: params.patientId,
      session_id: params.sessionId,
      type: 'email',
      recipient: params.patientEmail,
      subject: emailSubject,
      message: emailBody,
      status: 'pending',
    }).select().single();

    if (notification.data) {
      const { error } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.data.id },
      });
      results.push({ channel: 'email', success: !error });
      if (error) {
        console.error('Error sending email notification:', error);
      }
    } else {
      results.push({ channel: 'email', success: false });
    }
  }

  // Handle SMS
  if (params.channels.sms && params.patientPhone) {
    await supabase.from('notifications').insert({
      center_id: centerId,
      patient_id: params.patientId,
      session_id: params.sessionId,
      type: 'sms',
      recipient: params.patientPhone,
      message: `Cita: ${params.sessionDate} a las ${params.sessionTime}.`,
      status: 'pending',
    });
    results.push({ channel: 'sms', success: true });
  }

  return { results, whatsappData, whatsappAutoSent };
}

/**
 * React Query hook wrapper (backward compatible).
 * For use in contexts where nested mutations are NOT an issue.
 */
export function useSendSessionNotification() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendNotificationParams & { sessionAccessToken?: string }): Promise<NotificationMutationResult> => {
      if (!profile?.center_id || !center) {
        throw new Error('No center configured');
      }
      return sendSessionNotificationDirect(params, profile.center_id, center);
    },
    onSuccess: ({ results, whatsappData, whatsappAutoSent }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      
      if (whatsappAutoSent) {
        toast.success('WhatsApp enviado automáticamente', {
          description: 'El mensaje se envió correctamente.',
        });
      } else if (!whatsappData && results.some(r => r.success)) {
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
        const webLink = generateWhatsAppWebLink(phone, message);

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

        window.open(webLink, '_blank');
        return { method: 'web', webLink };
      } else {
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
