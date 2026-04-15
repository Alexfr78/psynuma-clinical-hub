// Shared helper for sending booking notifications (created / rescheduled / cancelled)
// to the assigned professional, respecting the center's configured channel
// (email and/or WhatsApp via Wasender or Meta API).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBookingTemplate } from "./bookingTemplates.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface ProfessionalNotificationArgs {
  supabase: SupabaseClient;
  centerId: string;
  professionalId: string;
  patientId: string;
  sessionId: string;
  eventType: 'created' | 'rescheduled' | 'cancelled';
  // Session details (optional — fetched if not provided)
  sessionDate?: string;
  startTime?: string;
  sessionType?: string;
  sessionModality?: string;
  locationName?: string;
  // Reschedule-specific
  oldDate?: string;
  oldTime?: string;
  // Cancel-specific
  reason?: string;
}

function formatDateSpanish(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatTime(time: string): string {
  return time?.substring(0, 5) || time;
}

function translateModality(modality: string | null | undefined): string {
  if (!modality) return '';
  const map: Record<string, string> = {
    'in_person': 'Presencial',
    'online': 'Online',
    'zoom': 'Videollamada (Zoom)',
    'google_meet': 'Videollamada (Google Meet)',
    'phone': 'Telefónica',
  };
  return map[modality] || modality;
}

export async function notifyProfessionalBooking(args: ProfessionalNotificationArgs): Promise<void> {
  const { supabase, centerId, professionalId, patientId, sessionId, eventType } = args;

  try {
    console.log(`[professional-notification] Starting ${eventType} for session=${sessionId} professional=${professionalId}`);

    // 1. Load center
    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select(`
        id, name,
        wasender_enabled, wasender_emergency_stop,
        wasender_confirm_booking, wasender_notify_cancellation, wasender_notify_reschedule,
        whatsapp_send_method, whatsapp_access_token, whatsapp_phone_number_id
      `)
      .eq("id", centerId)
      .single();

    if (centerError || !center) {
      console.error(`[professional-notification] Center not found: ${centerId}`, centerError);
      return;
    }

    // 2. Load professional
    const { data: professional, error: profError } = await supabase
      .from("profiles")
      .select("email, phone, first_name")
      .eq("id", professionalId)
      .single();

    if (profError || !professional) {
      console.error(`[professional-notification] Professional not found: ${professionalId}`, profError);
      return;
    }

    // 3. Load patient
    const { data: patient } = await supabase
      .from("patients")
      .select("first_name, last_name")
      .eq("id", patientId)
      .single();

    const patientName = patient
      ? `${patient.first_name ?? ''} ${patient.last_name ?? ''}`.trim() || 'Paciente'
      : 'Paciente';

    // 4. Resolve session details if not provided
    let sessionDate = args.sessionDate;
    let startTime = args.startTime;
    let sessionType = args.sessionType;
    let sessionModality = args.sessionModality;
    let locationName = args.locationName;

    if (!sessionDate || !startTime) {
      const { data: sessionData } = await supabase
        .from("sessions")
        .select("session_date, start_time, session_type, session_modality, location_id")
        .eq("id", sessionId)
        .single();

      if (sessionData) {
        sessionDate = sessionDate || sessionData.session_date;
        startTime = startTime || sessionData.start_time;
        sessionType = sessionType || sessionData.session_type;
        sessionModality = sessionModality || sessionData.session_modality;

        if (!locationName && sessionData.location_id) {
          const { data: loc } = await supabase
            .from("center_locations")
            .select("name")
            .eq("id", sessionData.location_id)
            .single();
          locationName = loc?.name || undefined;
        }
      }
    }

    // 5. Determine channel — same logic as patient notifications
    let canAutoWhatsApp = false;

    if (center.wasender_enabled && !center.wasender_emergency_stop) {
      const { data: wasenderSession } = await supabase
        .from("whatsapp_sessions")
        .select("status")
        .eq("center_id", centerId)
        .maybeSingle();

      if (wasenderSession?.status === 'connected') {
        canAutoWhatsApp = true;
      }
    }

    if (!canAutoWhatsApp && center.whatsapp_send_method === 'api' &&
        center.whatsapp_access_token && center.whatsapp_phone_number_id) {
      canAutoWhatsApp = true;
    }

    let useWhatsApp = false;
    if (eventType === 'created') {
      useWhatsApp = canAutoWhatsApp && !!professional.phone && (center.wasender_confirm_booking === true);
    } else if (eventType === 'rescheduled') {
      useWhatsApp = canAutoWhatsApp && !!professional.phone && (center.wasender_notify_reschedule === true);
    } else if (eventType === 'cancelled') {
      useWhatsApp = canAutoWhatsApp && !!professional.phone && (center.wasender_notify_cancellation === true);
    }

    let channel: 'whatsapp' | 'email';
    let recipient: string;

    if (useWhatsApp && professional.phone) {
      channel = 'whatsapp';
      recipient = professional.phone;
    } else if (professional.email) {
      const email = professional.email.trim().toLowerCase();
      if (!email.includes('@') || !email.includes('.')) {
        console.log(`[professional-notification] Invalid email format for professional ${professionalId}`);
        return;
      }
      channel = 'email';
      recipient = email;
    } else {
      console.log(`[professional-notification] No valid channel for professional=${professionalId}`);
      return;
    }

    console.log(`[professional-notification] Channel=${channel} eventType=${eventType}`);

    // 6. Build subject + message via template
    const dateFormatted = sessionDate ? formatDateSpanish(sessionDate) : '';
    const timeFormatted = startTime ? formatTime(startTime) : '';
    const modalityText = translateModality(sessionModality);

    const rendered = await renderBookingTemplate(
      supabase,
      centerId,
      eventType,
      'professional',
      channel,
      {
        nombre_paciente: patientName,
        profesional_nombre: professional.first_name || '',
        centro_nombre: center.name || '',
        fecha: dateFormatted,
        hora: timeFormatted,
        fecha_anterior: args.oldDate ? formatDateSpanish(args.oldDate) : '',
        hora_anterior: args.oldTime ? formatTime(args.oldTime) : '',
        sesion_tipo: sessionType || '',
        modalidad: modalityText,
        ubicacion: locationName || '',
        motivo: args.reason || '',
      },
    );

    const subject = rendered.subject || '';
    const message = rendered.message;

    // 7. Insert notification
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        center_id: centerId,
        patient_id: patientId,
        session_id: sessionId,
        type: channel,
        recipient,
        subject: channel === 'email' ? `[Psycma] ${subject}` : null,
        message,
        status: 'pending',
        scheduled_for: null,
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      console.error(`[professional-notification] Error inserting notification:`, insertError);
      return;
    }

    console.log(`[professional-notification] Notification created id=${notification.id}`);

    // 8. Invoke send-notification
    try {
      const { error: invokeError } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
      });

      if (invokeError) {
        console.error(`[professional-notification] Error invoking send-notification:`, invokeError);
      } else {
        console.log(`[professional-notification] send-notification invoked successfully`);
      }
    } catch (sendError) {
      console.error(`[professional-notification] Exception invoking send-notification:`, sendError);
    }

  } catch (error) {
    console.error(`[professional-notification] Unexpected error:`, error);
    // Never throw - don't break the main operation
  }
}
