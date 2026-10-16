import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { qk } from '@/lib/query-keys';
import { buildPublicUrl, getPublicBaseUrl } from '@/lib/public-base-url';
import { openWhatsAppSmart } from '@/lib/whatsapp';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';
import { useAuth } from './useAuth';
import { useCenter } from './useCenter';
import { useIsMobile } from './use-mobile';
import { useWhatsAppDelivery } from './useWhatsAppDelivery';
import { DEFAULT_TEMPLATES } from './useCommunicationTemplates';
import { sendSingleSessionNotification } from './useSendSessionNotification';

/** Persona que recibe el aviso: el titular o el otro miembro de la pareja. */
export interface SessionNoticeMember {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
}

export interface SessionNoticeSession {
  id: string;
  session_date: string;
  start_time: string;
  session_type?: string | null;
  access_token?: string | null;
  professional?: { first_name?: string | null; last_name?: string | null } | null;
}

/** Fecha/hora recién guardadas que aún no han llegado a `session`. */
export interface SessionNoticeOverride {
  date?: string;
  startTime?: string;
}

const fullName = (m: SessionNoticeMember) => `${m.first_name} ${m.last_name}`.trim() || m.first_name;

/**
 * Aviso de la cita a UNA persona concreta (WhatsApp o email). Lo usan los
 * botones "Enviar ahora" del detalle y la confirmación a la pareja recién añadida.
 */
export function useSessionMemberNotice() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const whatsappDelivery = useWhatsAppDelivery();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const professionalName = (session: SessionNoticeSession) =>
    session.professional
      ? `${session.professional.first_name || ''} ${session.professional.last_name || ''}`.trim()
      : '';

  /** Devuelve true si se envió solo o se abrió WhatsApp para enviarlo a mano. */
  const sendWhatsApp = useCallback(
    async (session: SessionNoticeSession, member: SessionNoticeMember, override?: SessionNoticeOverride) => {
      if (!member.phone || !center?.id) return false;

      const sessionDate = format(new Date(override?.date || session.session_date), "d 'de' MMMM", { locale: es });
      const sessionTime = (override?.startTime || session.start_time)?.slice(0, 5) || '';

      let appointmentLink = getPublicBaseUrl();
      if (session.access_token) {
        const { data, error } = await supabase.functions.invoke('create-public-session-short-link', {
          body: { session_id: session.id },
        });
        if (error || !data?.path) {
          toast.error('No se pudo crear el enlace de la cita', {
            description: error ? await describeEdgeFunctionError(error, 'Inténtalo de nuevo.') : data?.error,
          });
          return false;
        }
        appointmentLink = buildPublicUrl(data.path);
      }

      const message = (DEFAULT_TEMPLATES.whatsapp.notification.whatsapp_message || '')
        .replace('{nombre_paciente}', member.first_name)
        .replace('{profesional_nombre}', professionalName(session))
        .replace('{fecha}', sessionDate)
        .replace('{zona_horaria}', sessionTime)
        .replace('{sesion_tipo}', session.session_type || 'Individual')
        .replace('{link_sesion}', appointmentLink)
        .replace('{link_confirmar}', appointmentLink);

      try {
        const { result, manualLink } = await whatsappDelivery.sendWhatsApp({
          phone: member.phone,
          message,
          patientId: member.id,
          patientName: fullName(member),
          sessionId: session.id,
          centerId: center.id,
          messageType: 'notification',
          templateParams: {
            templateName: 'recordatorio_cita_psycma',
            bodyParams: [member.first_name, center.name || '', sessionDate, sessionTime],
            // The template's button URL is "https://psycma.psicologosexual.com/cita/{{1}}",
            // the session's own access_token route — not the /enlace/ short-link.
            buttonParam: session.access_token || undefined,
          },
        });
        if (!result.autoSent && manualLink) {
          await openWhatsAppSmart(member.phone, message, !isMobile ? 'web' : undefined);
        }
        queryClient.invalidateQueries({ queryKey: qk.whatsappMessages.all });
        return true;
      } catch (e) {
        console.error('Error sending WhatsApp now:', e);
        toast.error(`No se pudo enviar el WhatsApp a ${member.first_name}`);
        return false;
      }
    },
    [center, whatsappDelivery, isMobile, queryClient],
  );

  const sendEmail = useCallback(
    async (session: SessionNoticeSession, member: SessionNoticeMember, override?: SessionNoticeOverride) => {
      if (!member.email || !center || !profile?.center_id) return false;
      try {
        await sendSingleSessionNotification(
          {
            patientId: member.id,
            patientName: fullName(member),
            patientEmail: member.email,
            sessionId: session.id,
            sessionDate: format(new Date(override?.date || session.session_date), 'dd/MM/yyyy', { locale: es }),
            sessionTime: (override?.startTime || session.start_time)?.slice(0, 5) || '',
            professionalName: professionalName(session),
            sessionType: session.session_type || 'Individual',
            type: 'notification',
            channels: { whatsapp: false, email: true, sms: false },
            sessionAccessToken: session.access_token || undefined,
          },
          profile.center_id,
          center,
        );
        queryClient.invalidateQueries({ queryKey: qk.notifications.all });
        return true;
      } catch (e) {
        console.error('Error sending email now:', e);
        toast.error(`No se pudo enviar el email a ${member.first_name}`);
        return false;
      }
    },
    [center, profile?.center_id, queryClient],
  );

  return { sendWhatsApp, sendEmail };
}
