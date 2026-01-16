import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';

export type TemplateChannel = 'email' | 'whatsapp' | 'sms';
export type TemplateType = 'notification' | 'reminder' | 'payment_reminder';

export interface CommunicationTemplate {
  id: string;
  center_id: string;
  channel: TemplateChannel;
  template_type: TemplateType;
  email_initial_text: string | null;
  email_confirmation_text: string | null;
  email_videocall_text: string | null;
  email_payment_text: string | null;
  email_subject: string | null;
  email_footer: string | null;
  sms_message: string | null;
  whatsapp_message: string | null;
  payment_option_stripe: string | null;
  payment_option_bizum: string | null;
  payment_option_bono: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertTemplateData {
  channel: TemplateChannel;
  template_type: TemplateType;
  email_initial_text?: string | null;
  email_confirmation_text?: string | null;
  email_videocall_text?: string | null;
  email_payment_text?: string | null;
  email_subject?: string | null;
  email_footer?: string | null;
  sms_message?: string | null;
  whatsapp_message?: string | null;
  payment_option_stripe?: string | null;
  payment_option_bizum?: string | null;
  payment_option_bono?: string | null;
  is_active?: boolean;
}

// Default templates
export const DEFAULT_TEMPLATES: Record<TemplateChannel, Record<TemplateType, Partial<UpsertTemplateData>>> = {
  email: {
    notification: {
      email_subject: 'Nueva cita programada - {fecha}',
      email_initial_text: 'Hola {nombre_paciente},\n\nTienes una nueva sesión {sesion_tipo} con {profesional_nombre} el {fecha} a las {zona_horaria}.',
      email_confirmation_text: 'Si necesitas confirmar tu asistencia, puedes hacerlo en el siguiente enlace: {link_confirmar}',
      email_videocall_text: 'Tu sesión será online. Puedes unirte a la videollamada desde: {link_videollamada}',
      email_payment_text: 'Para realizar el pago de tu sesión, accede a: {link_sesion}',
      email_footer: 'Un saludo,\n{centro_nombre}',
    },
    reminder: {
      email_subject: 'Recordatorio de tu cita - {fecha}',
      email_initial_text: 'Hola {nombre_paciente},\n\nRecordatorio: Tu sesión {sesion_tipo} con {profesional_nombre} es mañana {fecha} a las {zona_horaria}.',
      email_confirmation_text: 'Si aún no has confirmado tu asistencia, hazlo aquí: {link_confirmar}',
      email_videocall_text: 'Recuerda que tu sesión será online. Enlace de videollamada: {link_videollamada}',
      email_payment_text: 'Si tienes pagos pendientes, puedes realizarlos en: {link_sesion}',
      email_footer: 'Un saludo,\n{centro_nombre}',
    },
    payment_reminder: {
      email_subject: 'Recordatorio de pago pendiente - {centro_nombre}',
      email_initial_text: 'Hola {nombre_paciente},\n\nTe recordamos que tienes un pago pendiente de {importe_pendiente}€ correspondiente a tu sesión del {fecha_sesion}.',
      email_confirmation_text: '',
      email_videocall_text: '',
      email_payment_text: 'Puedes realizar el pago por las siguientes opciones:',
      email_footer: 'Gracias por tu confianza,\n{centro_nombre}',
      payment_option_stripe: '💳 Pagar con tarjeta: {link_pago_stripe}',
      payment_option_bizum: '📱 Bizum al número {bizum_numero}',
      payment_option_bono: '🎫 Adquirir un bono: {link_comprar_bono}',
    },
  },
  whatsapp: {
    notification: {
      whatsapp_message: 'Hola {nombre_paciente}, tienes una nueva sesión con {profesional_nombre} el día {fecha} a las {zona_horaria}. Para ver más información puedes acceder a este link: {link_sesion}. Este es un mensaje automático.',
    },
    reminder: {
      whatsapp_message: 'Hola {nombre_paciente}, te recordamos tu sesión con {profesional_nombre} mañana {fecha} a las {zona_horaria}. Confirma tu asistencia en: {link_confirmar}. Este es un mensaje automático.',
    },
    payment_reminder: {
      whatsapp_message: 'Hola {nombre_paciente}, te recordamos un pago pendiente de {importe_pendiente}€ de tu sesión del {fecha_sesion}.\n\nGracias, {centro_nombre}',
      payment_option_stripe: '💳 Pagar por tarjeta: {link_pago_stripe}',
      payment_option_bizum: '📱 Bizum al {bizum_numero}',
      payment_option_bono: '🎫 ¿Prefieres un bono? {link_comprar_bono}',
    },
  },
  sms: {
    notification: {
      sms_message: 'Nueva sesión {sesion_tipo} con {profesional_nombre} el {fecha} a las {zona_horaria}. Info: {link_sesion}',
    },
    reminder: {
      sms_message: 'Recordatorio: Cita con {profesional_nombre} mañana {fecha} a las {zona_horaria}. Confirmar: {link_confirmar}',
    },
    payment_reminder: {
      sms_message: 'Pago pendiente de {importe_pendiente}€. {centro_nombre}',
      payment_option_stripe: 'Pagar: {link_pago_stripe}',
      payment_option_bizum: 'Bizum: {bizum_numero}',
      payment_option_bono: 'Bono: {link_comprar_bono}',
    },
  },
};

// Template variables
export const TEMPLATE_VARIABLES = [
  { key: '{sesion_tipo}', label: 'Tipo de sesión', example: 'Individual' },
  { key: '{profesional_nombre}', label: 'Nombre del profesional', example: 'María' },
  { key: '{profesional_apellidos}', label: 'Apellidos del profesional', example: 'García López' },
  { key: '{fecha}', label: 'Fecha de la sesión', example: '15 de enero' },
  { key: '{zona_horaria}', label: 'Hora de la sesión', example: '10:00' },
  { key: '{nombre_paciente}', label: 'Nombre del paciente', example: 'Juan' },
  { key: '{direccion}', label: 'Dirección', example: 'Calle Mayor 1, Madrid' },
  { key: '{centro_nombre}', label: 'Nombre del centro', example: 'Centro Psynuma' },
  { key: '{link_sesion}', label: 'Link de la sesión', example: 'https://...' },
  { key: '{link_confirmar}', label: 'Link para confirmar', example: 'https://...' },
  { key: '{link_videollamada}', label: 'Link de videollamada', example: 'https://meet.google.com/...' },
];

// Payment reminder specific variables
export const PAYMENT_REMINDER_VARIABLES = [
  { key: '{nombre_paciente}', label: 'Nombre del paciente', example: 'Juan' },
  { key: '{centro_nombre}', label: 'Nombre del centro', example: 'Centro Psynuma' },
  { key: '{importe_pendiente}', label: 'Importe pendiente', example: '75.00' },
  { key: '{importe_total}', label: 'Importe total', example: '75.00' },
  { key: '{fecha_sesion}', label: 'Fecha de la sesión', example: '15 de enero de 2025' },
  { key: '{bizum_numero}', label: 'Número de Bizum', example: '609555514' },
  { key: '{link_pago_stripe}', label: 'Link de pago con tarjeta', example: 'https://...' },
  { key: '{link_comprar_bono}', label: 'Link para comprar bono', example: 'https://...' },
];

export function useCommunicationTemplates() {
  const { center } = useCenter();

  return useQuery({
    queryKey: ['communication-templates', center?.id],
    queryFn: async () => {
      if (!center?.id) return [];

      const { data, error } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('center_id', center.id);

      if (error) throw error;
      return data as CommunicationTemplate[];
    },
    enabled: !!center?.id,
  });
}

export function useCommunicationTemplate(channel: TemplateChannel, templateType: TemplateType) {
  const { center } = useCenter();

  return useQuery({
    queryKey: ['communication-template', center?.id, channel, templateType],
    queryFn: async () => {
      if (!center?.id) return null;

      const { data, error } = await supabase
        .from('communication_templates')
        .select('*')
        .eq('center_id', center.id)
        .eq('channel', channel)
        .eq('template_type', templateType)
        .maybeSingle();

      if (error) throw error;
      return data as CommunicationTemplate | null;
    },
    enabled: !!center?.id,
  });
}

export function useUpsertCommunicationTemplate() {
  const queryClient = useQueryClient();
  const { center } = useCenter();

  return useMutation({
    mutationFn: async (data: UpsertTemplateData) => {
      if (!center?.id) throw new Error('No center selected');

      const { data: result, error } = await supabase
        .from('communication_templates')
        .upsert(
          {
            center_id: center.id,
            channel: data.channel,
            template_type: data.template_type,
            email_initial_text: data.email_initial_text,
            email_confirmation_text: data.email_confirmation_text,
            email_videocall_text: data.email_videocall_text,
            email_payment_text: data.email_payment_text,
            email_subject: data.email_subject,
            email_footer: data.email_footer,
            sms_message: data.sms_message,
            whatsapp_message: data.whatsapp_message,
            payment_option_stripe: data.payment_option_stripe,
            payment_option_bizum: data.payment_option_bizum,
            payment_option_bono: data.payment_option_bono,
            is_active: data.is_active ?? true,
          },
          {
            onConflict: 'center_id,channel,template_type',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication-templates'] });
      queryClient.invalidateQueries({ queryKey: ['communication-template'] });
      toast.success('Plantilla guardada correctamente');
    },
    onError: (error) => {
      console.error('Error saving template:', error);
      toast.error('Error al guardar la plantilla');
    },
  });
}
