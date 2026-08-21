// Shared helper for resolving and rendering booking confirmation templates
// (created / rescheduled / cancelled) stored in `communication_templates`.
// Falls back to built-in defaults if no template row exists for the center.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type BookingAudience = 'patient' | 'professional';
export type BookingEvent = 'created' | 'rescheduled' | 'cancelled';
export type BookingChannel = 'email' | 'whatsapp';

export function bookingTemplateType(event: BookingEvent, audience: BookingAudience): string {
  return `booking_${event}_${audience}`;
}

export interface BookingTemplateVars {
  nombre_paciente?: string;
  profesional_nombre?: string;
  fecha?: string;
  hora?: string;
  fecha_anterior?: string;
  hora_anterior?: string;
  sesion_tipo?: string;
  modalidad?: string;
  ubicacion?: string;
  motivo?: string;
  centro_nombre?: string;
  link_sesion?: string;
  link_videollamada?: string;
  zoom_meeting_id?: string;
  zoom_password?: string;
}

export interface RenderedTemplate {
  subject: string | null;
  message: string;
}

const EMAIL_DEFAULTS: Record<BookingEvent, Record<BookingAudience, { subject: string; body: string; footer: string }>> = {
  created: {
    patient: {
      subject: 'Confirmación de cita — {fecha} {hora}',
      body:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} ha quedado registrada.\n📅 Fecha: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}\n\nPuedes gestionar tu cita aquí: {link_sesion}',
      footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      subject: 'Nueva cita — {nombre_paciente} — {fecha} {hora}',
      body:
        'Hola {profesional_nombre},\n\nSe ha registrado una nueva cita con {nombre_paciente}.\n📅 Fecha: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}',
      footer: '{centro_nombre}',
    },
  },
  rescheduled: {
    patient: {
      subject: 'Cita reprogramada — {fecha} {hora}',
      body:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} ha sido reprogramada.\n\n❌ Antes: {fecha_anterior} a las {hora_anterior}\n✅ Ahora: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}\n\nPuedes gestionar tu cita aquí: {link_sesion}',
      footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      subject: 'Cita reprogramada — {nombre_paciente} — {fecha} {hora}',
      body:
        'Hola {profesional_nombre},\n\n{nombre_paciente} ha reprogramado su cita.\n\n❌ Antes: {fecha_anterior} a las {hora_anterior}\n✅ Ahora: {fecha} a las {hora}\n📋 Tipo: {sesion_tipo}\n📍 Modalidad: {modalidad}\n🏢 Ubicación: {ubicacion}',
      footer: '{centro_nombre}',
    },
  },
  cancelled: {
    patient: {
      subject: 'Cita cancelada — {fecha} {hora}',
      body:
        'Hola {nombre_paciente},\n\nTu cita en {centro_nombre} del {fecha} a las {hora} ha sido cancelada.\nMotivo: {motivo}',
      footer: 'Gracias,\n{centro_nombre}',
    },
    professional: {
      subject: 'Cita cancelada — {nombre_paciente} — {fecha} {hora}',
      body:
        'Hola {profesional_nombre},\n\n{nombre_paciente} ha cancelado su cita del {fecha} a las {hora}.\nMotivo: {motivo}',
      footer: '{centro_nombre}',
    },
  },
};

const WHATSAPP_DEFAULTS: Record<BookingEvent, Record<BookingAudience, string>> = {
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

function replaceVars(text: string, vars: BookingTemplateVars): string {
  if (!text) return '';
  return text.replace(/\{([a-z_]+)\}/g, (_match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value ?? '';
  });
}

function collapseBlankLines(text: string): string {
  // Remove lines that contain only whitespace AFTER variable replacement,
  // so empty optional fields don't leave awkward "Ubicación: " lines.
  return text
    .split('\n')
    .filter((line) => {
      // Drop lines that are labels with empty values (e.g. "📍 Modalidad: ")
      const trimmed = line.trim();
      if (!trimmed) return true; // keep intentional blanks
      // Matches a label pattern like "Xxxx: " with nothing after colon
      if (/^[^\w]*\w[\wáéíóúüñ\s()]*:\s*$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    // Collapse 3+ consecutive blank lines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function renderBookingTemplate(
  supabase: SupabaseClient,
  centerId: string,
  event: BookingEvent,
  audience: BookingAudience,
  channel: BookingChannel,
  vars: BookingTemplateVars,
): Promise<RenderedTemplate> {
  const templateType = bookingTemplateType(event, audience);

  const { data: template } = await supabase
    .from('communication_templates')
    .select('email_subject, email_initial_text, email_footer, whatsapp_message, is_active')
    .eq('center_id', centerId)
    .eq('channel', channel)
    .eq('template_type', templateType)
    .maybeSingle();

  if (channel === 'email') {
    const defaults = EMAIL_DEFAULTS[event][audience];
    const subjectSrc = (template?.email_subject ?? defaults.subject) || defaults.subject;
    const bodySrc = (template?.email_initial_text ?? defaults.body) || defaults.body;
    const footerSrc = (template?.email_footer ?? defaults.footer) || defaults.footer;

    const subject = replaceVars(subjectSrc, vars).trim();
    const body = replaceVars(bodySrc, vars);
    const footer = replaceVars(footerSrc, vars);
    const message = collapseBlankLines([body, '', footer].join('\n'));
    return { subject, message };
  } else {
    const defaults = WHATSAPP_DEFAULTS[event][audience];
    const src = (template?.whatsapp_message ?? defaults) || defaults;
    const message = collapseBlankLines(replaceVars(src, vars));
    return { subject: null, message };
  }
}
