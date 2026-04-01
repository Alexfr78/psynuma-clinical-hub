// Shared helper for sending direct email notifications to the assigned professional
// Independent of admin alerts configuration

import { formatDateSpanish, formatTime } from "./adminAlerts.ts";

interface NotifyProfessionalParams {
  supabase: any;
  centerId: string;
  professionalId: string;
  patientId: string;
  sessionId: string;
  subject: string;
  message: string;
}

export async function notifyProfessionalByEmail(params: NotifyProfessionalParams): Promise<void> {
  const { supabase, centerId, professionalId, patientId, sessionId, subject, message } = params;

  try {
    // 1. Get professional email
    const { data: professional, error: profError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", professionalId)
      .single();

    if (profError || !professional?.email) {
      console.log(`[professionalNotification] No email found for professional ${professionalId}, skipping`);
      return;
    }

    const email = professional.email.trim().toLowerCase();
    if (!email.includes("@") || !email.includes(".")) {
      console.log(`[professionalNotification] Invalid email format for professional ${professionalId}`);
      return;
    }

    console.log(`[professionalNotification] Sending notification for session ${sessionId}`);

    // 2. Insert notification
    const { data: notification, error: insertError } = await supabase
      .from("notifications")
      .insert({
        center_id: centerId,
        patient_id: patientId,
        session_id: sessionId,
        type: "email",
        recipient: email,
        subject: `[Psycma] ${subject}`,
        message,
        status: "pending",
        scheduled_for: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error(`[professionalNotification] Insert error:`, insertError);
      return;
    }

    // 3. Invoke send-notification immediately
    const { data: sendResult, error: invokeError } = await supabase.functions.invoke("send-notification", {
      body: { notificationId: notification.id },
    });

    if (invokeError) {
      console.error(`[professionalNotification] Invoke error:`, invokeError);
      return;
    }

    if (sendResult?.ok) {
      console.log(`[professionalNotification] Sent successfully for session ${sessionId}`);
    } else {
      console.error(`[professionalNotification] Send failed:`, sendResult);
    }
  } catch (err) {
    console.error(`[professionalNotification] Unexpected error:`, err);
    // Never throw - don't block the main operation
  }
}

// Build cancellation email for professional
export function buildProfessionalCancelMessage(params: {
  patientName: string;
  sessionDate: string;
  sessionTime: string;
  reason?: string;
}): string {
  const lines = [
    `El paciente ${params.patientName} ha cancelado su cita.`,
    "",
    `Fecha: ${formatDateSpanish(params.sessionDate)} a las ${formatTime(params.sessionTime)}`,
  ];
  if (params.reason) {
    lines.push(`Motivo: ${params.reason}`);
  }
  return lines.join("\n");
}

// Build reschedule email for professional
export function buildProfessionalRescheduleMessage(params: {
  patientName: string;
  oldDate: string;
  oldTime: string;
  newDate: string;
  newTime: string;
}): string {
  return [
    `El paciente ${params.patientName} ha reprogramado su cita.`,
    "",
    `Antes: ${formatDateSpanish(params.oldDate)} a las ${formatTime(params.oldTime)}`,
    `Ahora: ${formatDateSpanish(params.newDate)} a las ${formatTime(params.newTime)}`,
  ].join("\n");
}
