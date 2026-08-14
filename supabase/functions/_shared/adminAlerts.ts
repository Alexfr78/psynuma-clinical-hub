// Shared helper for sending admin alerts via email
// This helper sends immediate email notifications to admins/professionals for key events
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AdminAlertParams {
  supabase: SupabaseClient;
  centerId: string;
  eventKey: string;
  subject: string;
  message: string;
  patientId?: string;
  sessionId?: string;
  professionalId?: string;
}

interface AdminAlertResult {
  sentTo: string[];
  skippedReason?: string;
}

interface CenterConfig {
  id: string;
  name: string;
  admin_alerts_enabled: boolean | null;
  admin_alerts_emails: string | null;
  admin_alerts_events: Record<string, boolean> | null;
  admin_alerts_include_professional: boolean | null;
}

// Validates if a string looks like an email
function isValidEmail(email: string): boolean {
  return email.includes('@') && email.includes('.');
}

// Parse emails from comma or semicolon separated string
function parseEmails(emailString: string | null): string[] {
  if (!emailString) return [];
  
  return emailString
    .split(/[,;]/)
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0 && isValidEmail(e));
}

export async function sendAdminAlert(params: AdminAlertParams): Promise<AdminAlertResult> {
  const { supabase, centerId, eventKey, subject, message, patientId, sessionId, professionalId } = params;
  
  console.log(`[adminAlerts] Processing event=${eventKey} center=${centerId}`);
  
  // 1. Load center configuration
  const { data: center, error: centerError } = await supabase
    .from('centers')
    .select('id, name, admin_alerts_enabled, admin_alerts_emails, admin_alerts_events, admin_alerts_include_professional')
    .eq('id', centerId)
    .single();

  if (centerError || !center) {
    console.error('[adminAlerts] Center not found:', centerError);
    return { sentTo: [], skippedReason: 'Center not found' };
  }

  const config = center as CenterConfig;

  // 2. Check if alerts are globally enabled
  if (config.admin_alerts_enabled === false) {
    console.log('[adminAlerts] Alerts disabled for this center');
    return { sentTo: [], skippedReason: 'Alerts disabled' };
  }

  // 3. Check if this specific event is enabled
  const events = config.admin_alerts_events || {};
  if (events[eventKey] !== true) {
    console.log(`[adminAlerts] Event ${eventKey} not enabled`);
    return { sentTo: [], skippedReason: `Event ${eventKey} not enabled` };
  }

  // 4. Build recipients list
  const recipients = new Set<string>();

  // Add admin emails
  const adminEmails = parseEmails(config.admin_alerts_emails);
  adminEmails.forEach(email => recipients.add(email));

  // Optionally add professional email
  if (config.admin_alerts_include_professional && professionalId) {
    const { data: professional } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', professionalId)
      .single();

    if (professional?.email && isValidEmail(professional.email)) {
      recipients.add(professional.email.toLowerCase());
    }
  }

  // 5. Check if we have any recipients
  if (recipients.size === 0) {
    console.log('[adminAlerts] No valid recipients');
    return { sentTo: [], skippedReason: 'No valid recipients configured' };
  }

  console.log(`[adminAlerts] Sending to ${recipients.size} recipients:`, Array.from(recipients));

  // 6. Create notifications and send immediately
  const sentTo: string[] = [];
  const fullSubject = `[Psycma] ${subject}`;

  for (const recipient of recipients) {
    try {
      // Insert notification
      const { data: notification, error: insertError } = await supabase
        .from('notifications')
        .insert({
          center_id: centerId,
          patient_id: patientId || null,
          session_id: sessionId || null,
          type: 'email',
          recipient,
          subject: fullSubject,
          message,
          status: 'pending',
          scheduled_for: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`[adminAlerts] Failed to create notification for ${recipient}:`, insertError);
        continue;
      }

      // Invoke send-notification immediately
      const { data: sendResult, error: invokeError } = await supabase.functions.invoke('send-notification', {
        body: { notificationId: notification.id },
      });

      if (invokeError) {
        console.error(`[adminAlerts] Failed to invoke send-notification for ${notification.id}:`, invokeError);
        continue;
      }

      // Check the actual result from send-notification
      if (sendResult?.ok === true) {
        const providerMsgId = sendResult.results?.[0]?.providerMessageId || 'unknown';
        console.log(`[adminAlerts] Successfully sent notification ${notification.id} to ${recipient}. Provider ID: ${providerMsgId}`);
        sentTo.push(recipient);
      } else {
        const errorDetail = sendResult?.results?.[0]?.error || sendResult?.error || 'Unknown error';
        console.error(`[adminAlerts] send-notification returned failure for ${notification.id}: ${errorDetail}`);
      }
    } catch (err) {
      console.error(`[adminAlerts] Error processing recipient ${recipient}:`, err);
    }
  }

  return { sentTo };
}

// Helper to format date in Spanish
export function formatDateSpanish(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString('es-ES', options);
}

// Helper to format time (HH:MM)
export function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

// Build a standardized alert message
export function buildAlertMessage(params: {
  eventType: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  sessionDate?: string;
  sessionTime?: string;
  professionalName?: string;
  modality?: string;
  locationName?: string;
  status?: string;
  details?: string;
  oldDate?: string;
  oldTime?: string;
  newDate?: string;
  newTime?: string;
  amount?: number;
  reference?: string;
  testName?: string;
}): string {
  const lines: string[] = [];
  
  lines.push(`Evento: ${params.eventType}`);
  lines.push(`Paciente: ${params.patientName}`);
  
  if (params.patientEmail) {
    lines.push(`Email: ${params.patientEmail}`);
  }
  if (params.patientPhone) {
    lines.push(`Teléfono: ${params.patientPhone}`);
  }
  
  if (params.sessionDate && params.sessionTime) {
    lines.push(`Fecha/Hora: ${formatDateSpanish(params.sessionDate)} a las ${formatTime(params.sessionTime)}`);
  }
  
  if (params.professionalName) {
    lines.push(`Profesional: ${params.professionalName}`);
  }
  
  if (params.modality) {
    const modalityText = params.modality === 'online' ? 'Online' : 'Presencial';
    lines.push(`Modalidad: ${modalityText}`);
  }
  
  if (params.locationName) {
    lines.push(`Ubicación: ${params.locationName}`);
  }
  
  if (params.status) {
    lines.push(`Estado: ${params.status}`);
  }
  
  // For rescheduling
  if (params.oldDate && params.oldTime && params.newDate && params.newTime) {
    lines.push('');
    lines.push(`Antes: ${formatDateSpanish(params.oldDate)} a las ${formatTime(params.oldTime)}`);
    lines.push(`Ahora: ${formatDateSpanish(params.newDate)} a las ${formatTime(params.newTime)}`);
  }
  
  // For payments
  if (params.amount !== undefined) {
    lines.push(`Importe: ${params.amount.toFixed(2)} €`);
  }
  if (params.reference) {
    lines.push(`Referencia: ${params.reference}`);
  }
  
  // For assessments
  if (params.testName) {
    lines.push(`Test completado: ${params.testName}`);
  }
  
  if (params.details) {
    lines.push('');
    lines.push(`Detalles: ${params.details}`);
  }
  
  return lines.join('\n');
}
