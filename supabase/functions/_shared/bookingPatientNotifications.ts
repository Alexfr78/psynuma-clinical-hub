// Shared helper for sending patient booking confirmation notifications
// Used by: public-booking, patient-portal-sessions, public-session-reschedule

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBookingTemplate } from "./bookingTemplates.ts";
import {
  buildAdvancePaymentBlock,
  markAdvancePaymentNotificationFailed,
  markAdvancePaymentNotificationSent,
} from "./advancePaymentNotifications.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export interface BookingNotificationArgs {
  supabase: SupabaseClient;
  centerId: string;
  patientId: string;
  sessionId: string;
  eventType: 'created' | 'rescheduled' | 'cancelled';
  // Session details (optional – fetched if not provided)
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
  // Manage URL (for public bookings)
  manageUrl?: string;
  includeAdvancePaymentBlock?: boolean;
  extraMessage?: string;
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

export async function queueAndSendPatientBookingNotification(args: BookingNotificationArgs): Promise<void> {
  const { supabase, centerId, patientId, sessionId, eventType } = args;

  try {
    console.log(`[patient-confirmation] Starting ${eventType} notification for session=${sessionId}`);

    // 1. Load center data
    const { data: center, error: centerError } = await supabase
      .from("centers")
      .select(`
        id, name, portal_slug, custom_domain, public_domain,
        wasender_enabled, wasender_emergency_stop,
        wasender_confirm_booking, wasender_notify_cancellation,
        wasender_notify_reschedule,
        whatsapp_send_method, whatsapp_access_token, whatsapp_phone_number_id
      `)
      .eq("id", centerId)
      .single();

    if (centerError || !center) {
      console.error(`[patient-confirmation] Center not found: ${centerId}`, centerError);
      return;
    }

    // 2. Load patient data
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("first_name, last_name, email, phone")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      console.error(`[patient-confirmation] Patient not found: ${patientId}`, patientError);
      return;
    }

    // 3. Load session data if not fully provided
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

    // 4. Determine channel
    // Check WhatsApp auto capability
    let canAutoWhatsApp = false;

    // Check Wasender (independent of whatsapp_send_method)
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

    // Check Meta API (only if Wasender didn't work and method is not 'web')
    if (!canAutoWhatsApp && center.whatsapp_send_method === 'api' &&
      center.whatsapp_access_token && center.whatsapp_phone_number_id) {
      canAutoWhatsApp = true;
    }

    // Determine which toggle to check
    let useWhatsApp = false;
    if (eventType === 'created') {
      useWhatsApp = canAutoWhatsApp && !!patient.phone && (center.wasender_confirm_booking === true);
    } else if (eventType === 'rescheduled') {
      useWhatsApp = canAutoWhatsApp && !!patient.phone && (center.wasender_notify_reschedule === true);
    } else if (eventType === 'cancelled') {
      useWhatsApp = canAutoWhatsApp && !!patient.phone && (center.wasender_notify_cancellation === true);
    }

    let channel: 'whatsapp' | 'email';
    let recipient: string;

    if (useWhatsApp && patient.phone) {
      channel = 'whatsapp';
      recipient = patient.phone;
    } else if (patient.email) {
      channel = 'email';
      recipient = patient.email;
    } else {
      console.log(`[patient-confirmation] No valid channel for patient=${patientId} (no phone or email)`);
      if (eventType === 'created' && args.includeAdvancePaymentBlock) {
        await markAdvancePaymentNotificationFailed(
          supabase,
          sessionId,
          'El paciente no tiene email ni telefono para enviar el aviso de pago anticipado',
        );
      }
      return;
    }

    console.log(`[patient-confirmation] Channel=${channel} patient=${patientId} eventType=${eventType}`);

    // 5. Build subject and message via template
    const dateFormatted = sessionDate ? formatDateSpanish(sessionDate) : '';
    const timeFormatted = startTime ? formatTime(startTime) : '';
    const modalityText = translateModality(sessionModality);

    let fullManageUrl = '';
    if (args.manageUrl) {
      const baseDomain = center.custom_domain || center.public_domain || '';
      if (baseDomain) {
        fullManageUrl = `https://${baseDomain}${args.manageUrl}`;
      }
    }

    const rendered = await renderBookingTemplate(
      supabase,
      centerId,
      eventType,
      'patient',
      channel,
      {
        nombre_paciente: patient.first_name || 'Paciente',
        centro_nombre: center.name || '',
        fecha: dateFormatted,
        hora: timeFormatted,
        fecha_anterior: args.oldDate ? formatDateSpanish(args.oldDate) : '',
        hora_anterior: args.oldTime ? formatTime(args.oldTime) : '',
        sesion_tipo: sessionType || '',
        modalidad: modalityText,
        ubicacion: locationName || '',
        motivo: args.reason || '',
        link_sesion: fullManageUrl,
      },
    );

    const subject = rendered.subject || '';
    let message = rendered.message;
    if (args.extraMessage) {
      message = [message, args.extraMessage].filter(Boolean).join('\n\n');
    }

    if (eventType === 'created' && args.includeAdvancePaymentBlock) {
      const baseUrl = center.custom_domain
        ? `https://${center.custom_domain}`
        : (center.public_domain ? `https://${center.public_domain}` : 'https://psycma.lovable.app');

      const paymentBlock = await buildAdvancePaymentBlock({
        supabase,
        centerId,
        sessionId,
        channel,
        baseUrl,
      });

      if (paymentBlock.hasPaymentInstructions && paymentBlock.block) {
        message = [message, paymentBlock.block].filter(Boolean).join('\n\n');
      } else {
        await markAdvancePaymentNotificationFailed(
          supabase,
          sessionId,
          paymentBlock.stripeError || 'No hay metodos de pago configurados para enviar al paciente',
        );
      }
    }

    // 6. Insert into notifications table
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        center_id: centerId,
        patient_id: patientId,
        session_id: sessionId,
        type: channel,
        recipient,
        subject: channel === 'email' ? subject : null,
        message,
        status: 'pending',
        scheduled_for: null,
      })
      .select("id")
      .single();

    if (insertError || !notification) {
      console.error(`[patient-confirmation] Error inserting notification:`, insertError);
      if (eventType === 'created' && args.includeAdvancePaymentBlock) {
        await markAdvancePaymentNotificationFailed(
          supabase,
          sessionId,
          insertError?.message || 'No se pudo crear la notificacion de pago anticipado',
        );
      }
      return;
    }

    console.log(`[patient-confirmation] Notification created id=${notification.id}`);

    if (eventType === 'created' && args.includeAdvancePaymentBlock && message !== rendered.message) {
      await markAdvancePaymentNotificationSent(supabase, sessionId);
    }

    // 7. Invoke send-notification
    try {
      const { error: invokeError } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
      });

      if (invokeError) {
        console.error(`[patient-confirmation] Error invoking send-notification:`, invokeError);
      } else {
        console.log(`[patient-confirmation] send-notification invoked successfully`);
      }
    } catch (sendError) {
      console.error(`[patient-confirmation] Exception invoking send-notification:`, sendError);
    }

  } catch (error) {
    console.error(`[patient-confirmation] Unexpected error:`, error);
    // Never throw - don't break the main operation
  }
}
