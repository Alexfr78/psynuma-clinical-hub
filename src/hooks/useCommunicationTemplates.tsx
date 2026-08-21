import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from './useCenter';
import { toast } from 'sonner';

export type TemplateChannel = 'email' | 'whatsapp' | 'sms';
export type TemplateType =
  | 'notification'
  | 'reminder'
  | 'payment_reminder'
  | 'booking_created_patient'
  | 'booking_created_professional'
  | 'booking_rescheduled_patient'
  | 'booking_rescheduled_professional'
  | 'booking_cancelled_patient'
  | 'booking_cancelled_professional';

export type BookingAudience = 'patient' | 'professional';
export type BookingEvent = 'created' | 'rescheduled' | 'cancelled';

export function bookingTemplateType(event: BookingEvent, audience: BookingAudience): TemplateType {
  return `booking_${event}_${audience}` as TemplateType;
}

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
  payment_option_transfer: string | null;
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
  payment_option_transfer?: string | null;
  is_active?: boolean;
}

// Booking default subjects/messages — email uses email_subject + email_initial_text as body
const BOOKING_EMAIL_DEFAULTS: Record<BookingEvent, Record<BookingAudience, { email_subject: string; email_initial_text: string; email_footer: string }>> = {
  created: {
    patient: {
      email_subject: 'Confirmación de cita — {fecha} {hora}',
      email_initial_text:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} ha quedado registrada.\n📅 Fecha: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}\n\nPuedes gestionar tu cita aquí: {link_sesion}',
      email_footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      email_subject: 'Nueva cita — {nombre_paciente} — {fecha} {hora}',
      email_initial_text:
        'Hola {profesional_nombre},\n\nSe ha registrado una nueva cita con {nombre_paciente}.\n📅 Fecha: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}',
      email_footer: '{centro_nombre}',
    },
  },
  rescheduled: {
    patient: {
      email_subject: 'Cita reprogramada — {fecha} {hora}',
      email_initial_text:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} ha sido reprogramada.\n\n❌ Antes: {fecha_anterior} a las {hora_anterior}\n✅ Ahora: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}\n\nPuedes gestionar tu cita aquí: {link_sesion}',
      email_footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      email_subject: 'Cita reprogramada — {nombre_paciente} — {fecha} {hora}',
      email_initial_text:
        'Hola {profesional_nombre},\n\n{nombre_paciente} ha reprogramado su cita.\n\n❌ Antes: {fecha_anterior} a las {hora_anterior}\n✅ Ahora: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}',
      email_footer: '{centro_nombre}',
    },
  },
  cancelled: {
    patient: {
      email_subject: 'Cita cancelada — {fecha} {hora}',
      email_initial_text:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} del {fecha} a las {hora} ha sido cancelada.\nMotivo: {motivo}',
      email_footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      email_subject: 'Cita cancelada — {nombre_paciente} — {fecha} {hora}',
      email_initial_text:
        'Hola {profesional_nombre},\n\n{nombre_paciente} ha cancelado su cita del {fecha} a las {hora}.\nMotivo: {motivo}',
      email_footer: '{centro_nombre}',
    },
  },
};

const BOOKING_WHATSAPP_DEFAULTS: Record<BookingEvent, Record<BookingAudience, string>> = {
  created: {
    patient:
      'Hola {nombre_paciente}, tu cita en {centro_nombre} ha quedado registrada para el {fecha} a las {hora} ({modalidad}). Puedes gestionarla aquí: {link_sesion}',
    professional:
      'Hola {profesional_nombre}, se ha registrado una nueva cita con {nombre_paciente} el {fecha} a las {hora} ({modalidad}).',
  },
  rescheduled: {
    patient:
      'Hola {nombre_paciente}, tu cita en {centro_nombre} se ha reprogramado.\n❌ Antes: {fecha_anterior} {hora_anterior}\n✅ Ahora: {fecha} {hora}\nGestionar: {link_sesion}',
    professional:
      'Hola {profesional_nombre}, {nombre_paciente} ha reprogramado su cita.\n❌ Antes: {fecha_anterior} {hora_anterior}\n✅ Ahora: {fecha} {hora}',
  },
  cancelled: {
    patient:
      'Hola {nombre_paciente}, tu cita en {centro_nombre} del {fecha} a las {hora} ha sido cancelada. Motivo: {motivo}',
    professional:
      'Hola {profesional_nombre}, {nombre_paciente} ha cancelado su cita del {fecha} a las {hora}. Motivo: {motivo}',
  },
};

function buildBookingDefaults(channel: 'email' | 'whatsapp' | 'sms'): Record<TemplateType, Partial<UpsertTemplateData>> {
  const out: Partial<Record<TemplateType, Partial<UpsertTemplateData>>> = {};
  (['created', 'rescheduled', 'cancelled'] as BookingEvent[]).forEach((event) => {
    (['patient', 'professional'] as BookingAudience[]).forEach((audience) => {
      const key = bookingTemplateType(event, audience);
      if (channel === 'email') {
        out[key] = BOOKING_EMAIL_DEFAULTS[event][audience];
      } else if (channel === 'whatsapp') {
        out[key] = { whatsapp_message: BOOKING_WHATSAPP_DEFAULTS[event][audience] };
      } else {
        out[key] = { sms_message: BOOKING_WHATSAPP_DEFAULTS[event][audience] };
      }
    });
  });
  return out as Record<TemplateType, Partial<UpsertTemplateData>>;
}

// Default templates
export const DEFAULT_TEMPLATES: Record<TemplateChannel, Record<TemplateType, Partial<UpsertTemplateData>>> = {
  email: {
    ...buildBookingDefaults('email'),
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
      payment_option_transfer: '🏦 Transferencia bancaria:\n{datos_transferencia}',
    },
  },
  whatsapp: {
    ...buildBookingDefaults('whatsapp'),
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
      payment_option_transfer: '🏦 Transferencia:\n{datos_transferencia}',
    },
  },
  sms: {
    ...buildBookingDefaults('sms'),
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
      payment_option_transfer: 'Transf: {datos_transferencia}',
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
  { key: '{link_google_maps}', label: 'Link a Google Maps (solo presencial)', example: 'https://www.google.com/maps/...' },
];

// Booking-specific variables (creation / reschedule / cancellation)
export const BOOKING_TEMPLATE_VARIABLES = [
  { key: '{nombre_paciente}', label: 'Nombre del paciente', example: 'Juan' },
  { key: '{profesional_nombre}', label: 'Nombre del profesional', example: 'María' },
  { key: '{fecha}', label: 'Fecha de la cita', example: 'lunes, 15 de enero de 2026' },
  { key: '{hora}', label: 'Hora de la cita', example: '10:00' },
  { key: '{fecha_anterior}', label: 'Fecha anterior (reprogramación)', example: 'lunes, 8 de enero de 2026' },
  { key: '{hora_anterior}', label: 'Hora anterior (reprogramación)', example: '09:30' },
  { key: '{sesion_tipo}', label: 'Tipo de sesión', example: 'Individual' },
  { key: '{modalidad}', label: 'Modalidad', example: 'Presencial' },
  { key: '{ubicacion}', label: 'Ubicación', example: 'Consulta Madrid Centro' },
  { key: '{motivo}', label: 'Motivo (cancelación)', example: 'Imprevisto del paciente' },
  { key: '{centro_nombre}', label: 'Nombre del centro', example: 'Centro Psynuma' },
  { key: '{link_sesion}', label: 'Link para gestionar la cita', example: 'https://...' },
  { key: '{link_videollamada}', label: 'Enlace de videollamada', example: 'https://zoom.us/j/...' },
  { key: '{zoom_meeting_id}', label: 'ID de reunión Zoom', example: '84608877756' },
  { key: '{zoom_password}', label: 'Contraseña de reunión Zoom', example: 'abc123' },
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
  { key: '{datos_transferencia}', label: 'Datos de transferencia bancaria', example: 'IBAN: ES00 0000 ...' },
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
            payment_option_transfer: data.payment_option_transfer,
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
