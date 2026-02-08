import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { generateWhatsAppUniversalLink } from '@/lib/whatsapp';
import { DEFAULT_TEMPLATES } from './useCommunicationTemplates';
import { toast } from 'sonner';

// Check for duplicate notifications to prevent spam
async function checkDuplicateNotification(
  centerId: string,
  sessionId: string,
  type: 'whatsapp' | 'email' | 'sms',
  templateType: string
): Promise<boolean> {
  // Check if a similar notification was sent in the last hour
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
    return false; // Allow sending on error
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
    return { allowed: true, shouldQueue: false }; // Allow on error
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

export function useSendSessionNotification() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendNotificationParams & { sessionAccessToken?: string }): Promise<NotificationMutationResult> => {
      if (!profile?.center_id || !center) {
        throw new Error('No center configured');
      }

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

      // Build appointment management link
      const appointmentLink = accessToken 
        ? `${window.location.origin}/cita/${accessToken}`
        : `${window.location.origin}`;

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

      // Build template variables - ALL available variables
      const templateVars: Record<string, string> = {
        // Patient variables
        '{nombre_paciente}': params.patientName.split(' ')[0],
        '{apellidos_paciente}': params.patientName.split(' ').slice(1).join(' ') || '',
        '{paciente_nombre_completo}': params.patientName,
        
        // Professional variables
        '{profesional_nombre}': professionalFirstName,
        '{profesional_apellidos}': professionalLastName,
        '{profesional_nombre_completo}': params.professionalName || '',
        
        // Session variables
        '{fecha}': params.sessionDate,
        '{hora}': params.sessionTime,
        '{zona_horaria}': params.sessionTime,
        '{sesion_tipo}': params.sessionType || 'Individual',
        '{tipo_sesion}': params.sessionType || 'Individual',
        
        // Center variables
        '{centro_nombre}': center.name || '',
        '{direccion}': centerAddress,
        '{direccion_centro}': centerAddress,
        '{telefono_centro}': center.phone || '',
        '{email_centro}': center.email || '',
        
        // Links
        '{link_sesion}': appointmentLink,
        '{link_confirmar}': appointmentLink,
        '{link_cita}': appointmentLink,
      };

      console.log('[Notification] Template variables built:', templateVars);

      // Handle WhatsApp
      if (params.channels.whatsapp && params.patientPhone) {
        // Check for duplicate notifications (anti-spam)
        const isDuplicate = await checkDuplicateNotification(
          profile.center_id,
          params.sessionId,
          'whatsapp',
          params.type
        );
        
        if (isDuplicate) {
          console.log('[Notification] Duplicate WhatsApp notification detected, skipping');
          results.push({ channel: 'whatsapp', success: false });
        } else {
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

          // Check WasenderAPI availability first (Priority 1)
          if (center.wasender_enabled && !center.wasender_emergency_stop) {
            // Check if session is connected
            const { data: wasenderSession } = await supabase
              .from('whatsapp_sessions')
              .select('status')
              .eq('center_id', profile.center_id)
              .maybeSingle();
            
            if (wasenderSession?.status === 'connected') {
              console.log('[Notification] Sending via WasenderAPI (auto)');
              
              // Send via WasenderAPI
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
                console.warn('[Notification] WasenderAPI failed, falling back to manual');
                // Fall back to manual link
                whatsappData = {
                  phone: params.patientPhone,
                  message,
                  patientName: params.patientName,
                  manualLink: generateWhatsAppUniversalLink(params.patientPhone, message),
                };
                results.push({ channel: 'whatsapp', success: true });
              }
            } else {
              console.log('[Notification] WasenderAPI not connected, falling back');
              // WasenderAPI enabled but not connected - fallback to next method
              whatsappData = {
                phone: params.patientPhone,
                message,
                patientName: params.patientName,
                manualLink: generateWhatsAppUniversalLink(params.patientPhone, message),
              };
              results.push({ channel: 'whatsapp', success: true });
            }
          } else {
            // Check Meta API (Priority 2)
            const whatsappMethod = center.whatsapp_send_method || 'web';
            
            if (whatsappMethod === 'api') {
              // Check rate limit
              const rateLimit = await checkRateLimit(profile.center_id);
              
              // If rate limited, schedule for later
              const scheduledFor = rateLimit.shouldQueue 
                ? new Date(Date.now() + 60 * 1000).toISOString() // 1 minute later
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
                center_id: profile.center_id,
                patient_id: params.patientId,
                session_id: params.sessionId,
                type: 'whatsapp',
                recipient: params.patientPhone,
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
                whatsappAutoSent = true; // Queued counts as auto
                results.push({ channel: 'whatsapp', success: true });
              }
            } else {
              // Manual mode (Priority 3 - Fallback)
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
                manualLink: generateWhatsAppUniversalLink(params.patientPhone, message),
              };

              results.push({ channel: 'whatsapp', success: true });
            }
          }
        }
      }

      // Handle Email - read templates and send via edge function
      if (params.channels.email && params.patientEmail) {
        // Get email template from database
        const { data: emailTemplate } = await supabase
          .from('communication_templates')
          .select('email_subject, email_initial_text, email_confirmation_text, email_videocall_text, email_payment_text, email_footer')
          .eq('center_id', profile.center_id)
          .eq('channel', 'email')
          .eq('template_type', params.type)
          .maybeSingle();

        const defaults = DEFAULT_TEMPLATES.email[params.type];
        
        console.log('[Email] Template from DB:', emailTemplate);
        console.log('[Email] Using defaults:', defaults);
        
        // Build subject
        const subjectTemplate = emailTemplate?.email_subject || defaults.email_subject || 'Nueva cita - {fecha}';
        const emailSubject = replaceTemplateVariables(subjectTemplate, templateVars);
        console.log('[Email] Subject:', emailSubject);

        // Build message body from template parts
        let emailBody = '';
        
        // Initial text (always included)
        const initialText = emailTemplate?.email_initial_text || defaults.email_initial_text || '';
        if (initialText) {
          emailBody += replaceTemplateVariables(initialText, templateVars);
        }
        console.log('[Email] Initial text applied:', !!initialText);

        // Confirmation text (if link available)
        const confirmationText = emailTemplate?.email_confirmation_text || defaults.email_confirmation_text || '';
        if (confirmationText && accessToken) {
          emailBody += '\n\n' + replaceTemplateVariables(confirmationText, templateVars);
        }

        // Videocall text (TODO: could check if session has video link)
        // For now, skip this section unless explicitly needed

        // Payment text (TODO: could check payment status)
        // For now, skip this section unless explicitly needed

        // Footer (always included if present)
        const footerText = emailTemplate?.email_footer || defaults.email_footer || '';
        if (footerText) {
          emailBody += '\n\n---\n' + replaceTemplateVariables(footerText, templateVars);
        }
        console.log('[Email] Footer applied:', !!footerText);
        console.log('[Email] Final body length:', emailBody.length);
        console.log('[Email] Final body preview:', emailBody.substring(0, 200) + '...');

        const notification = await supabase.from('notifications').insert({
          center_id: profile.center_id,
          patient_id: params.patientId,
          session_id: params.sessionId,
          type: 'email',
          recipient: params.patientEmail,
          subject: emailSubject,
          message: emailBody,
          status: 'pending',
        }).select().single();

        // Send email via edge function
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

      return { results, whatsappData, whatsappAutoSent };
    },
    onSuccess: ({ results, whatsappData, whatsappAutoSent }) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      
      // Show appropriate toast based on what happened
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
