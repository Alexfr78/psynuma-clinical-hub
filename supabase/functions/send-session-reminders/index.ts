import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";
import {
  buildAdvancePaymentBlock,
  markAdvancePaymentNotificationFailed,
  markAdvancePaymentNotificationSent,
} from "../_shared/advancePaymentNotifications.ts";
import { getOrCreatePublicShortLink } from "../_shared/publicShortLinks.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const WASENDER_API_URL = "https://www.wasenderapi.com/api";

// Send WhatsApp via WasenderAPI
async function sendWhatsAppViaWasender(
  phone: string,
  message: string,
  wasenderToken: string,
  _wasenderSessionId: string,
  sessionApiKey?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
      cleanPhone = '34' + cleanPhone;
    }

    const sendToken = sessionApiKey || wasenderToken;
    const response = await fetch(
      `${WASENDER_API_URL}/send-message`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: `+${cleanPhone}`,
          text: message,
        }),
      }
    );

    // Validate JSON response before parsing
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const textResponse = await response.text();
      console.error("WasenderAPI returned non-JSON response:", textResponse.substring(0, 500));
      return { success: false, error: `WasenderAPI error: ${response.status} - Invalid response format` };
    }

    const data = await response.json();

    if (response.ok && data.success !== false) {
      return { success: true };
    }

    return { success: false, error: data.message || data.error || `API Error: ${response.status}` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CenterConfig {
  id: string;
  name: string;
  logo_url: string | null;
  invoice_logo_url: string | null;
  address: string | null;
  address_details: string | null;
  city: string | null;
  postal_code: string | null;
  session_reminder_enabled: boolean;
  session_reminder_timing: string;
  session_reminder_hours_before: number;
  session_reminder_channels: {
    email: boolean;
    whatsapp: boolean;
    sms: boolean;
  };
  whatsapp_send_method: string | null;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  wasender_enabled: boolean | null;
  wasender_auto_reminders: boolean | null;
  wasender_emergency_stop: boolean | null;
  custom_domain: string | null;
  public_domain: string | null;
}

interface SessionToRemind {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  price: number;
  payment_status: string | null;
  advance_payment_due_at: string | null;
  advance_payment_notification_sent_at: string | null;
  notes: string | null;
  session_type: string | null;
  session_modality: string | null;
  video_call_link: string | null;
  zoom_meeting_id: string | null;
  zoom_password: string | null;
  access_token: string | null;
  center_id: string;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  };
  professional: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  };
  location: {
    name: string;
    street: string;
    number_details: string | null;
    city: string;
    postal_code: string | null;
  } | null;
}

// Build Google Maps URL from location data
function buildGoogleMapsUrl(location: SessionToRemind['location']): string {
  if (!location) return '';
  const parts = [
    location.street,
    location.number_details,
    location.postal_code,
    location.city,
  ].filter(Boolean).join(', ');
  if (!parts) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts)}`;
}

// Convert plain text URLs to clickable hyperlinks
function linkifyUrls(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => 
    `<a href="${url}" style="color: #1d4ed8; text-decoration: underline; word-break: break-all;">${url}</a>`
  );
}

// Send email via Resend API
async function sendEmailViaResend(
  to: string,
  subject: string,
  message: string,
  centerName?: string,
  logoUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const headerContent = logoUrl
      ? `<img src="${logoUrl}" alt="${centerName || 'Centro'}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto;">`
      : (centerName ? `<span style="margin: 0; font-size: 20px; font-weight: bold; color: #1d4ed8;">${centerName}</span>` : '');
    
    const processedMessage = linkifyUrls(message.replace(/\n/g, '<br>'));
    
    const htmlContent = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 20px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; max-width: 600px;">
          <tr>
            <td align="center" style="padding: 24px 24px 20px 24px; border-bottom: 1px solid #e2e8f0;">
              ${headerContent}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #333333;">
              ${processedMessage}
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px; border-top: 1px solid #e2e8f0; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #64748b; text-align: center;">
              Este es un mensaje automático enviado por ${centerName || 'Psycma'}.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${centerName || 'Psycma'} <${(() => {
    const v = Deno.env.get('RESEND_FROM_EMAIL');
    if (!v) throw new Error('RESEND_FROM_EMAIL not configured');
    return v;
  })()}>`,
        to: [to],
        subject: subject,
        html: htmlContent,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", data);
      return { success: false, error: data.message || `API Error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    console.error("Error sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Send WhatsApp appointment reminder via Meta's pre-approved "recordatorio_cita_psycma"
// template. Required because business-initiated messages outside the 24h customer
// service window are silently dropped by WhatsApp when sent as free-form text.
async function sendWhatsAppReminderTemplateViaMetaAPI(
  phone: string,
  patientFirstName: string,
  centerName: string,
  formattedDate: string,
  formattedTime: string,
  accessToken: string,
  phoneNumberId: string,
  shortLinkCode?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
      cleanPhone = '34' + cleanPhone;
    }

    type TemplateComponent =
      | { type: 'body'; parameters: { type: 'text'; text: string }[] }
      | { type: 'button'; sub_type: 'url'; index: string; parameters: { type: 'text'; text: string }[] };

    const components: TemplateComponent[] = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: patientFirstName },
          { type: 'text', text: centerName },
          { type: 'text', text: formattedDate },
          { type: 'text', text: formattedTime },
        ],
      },
    ];

    // The template's "Ver detalles" button uses a dynamic URL (fixed base +
    // this suffix) so the link opens the patient's actual session management page
    // instead of the generic marketing site.
    if (shortLinkCode) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: shortLinkCode }],
      });
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanPhone,
          type: 'template',
          template: {
            name: 'recordatorio_cita_psycma',
            language: { code: 'es' },
            components,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error?.message || `API Error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// Format time for display
function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

// Build center address string
function buildCenterAddress(center: CenterConfig): string | null {
  if (!center.address) return null;
  const parts = [center.address];
  if (center.address_details) parts[0] += ` ${center.address_details}`;
  if (center.city) parts.push(center.city);
  if (center.postal_code) parts.push(center.postal_code);
  return parts.join(', ');
}

// Build reminder message from template or fallback
function buildReminderMessage(
  session: SessionToRemind,
  center: CenterConfig,
  template: string | null,
  baseUrl: string,
  sessionLinkOverride?: string,
): string {
  const professionalName = session.professional.first_name 
    ? `${session.professional.first_name} ${session.professional.last_name || ''}`.trim()
    : 'el profesional';
  const professionalFirstName = session.professional.first_name || 'el profesional';
  const professionalLastName = session.professional.last_name || '';
  
  const sessionLink = sessionLinkOverride || (session.access_token
    ? `${baseUrl}/cita/${session.access_token}`
    : '');
  const videoCallLink = session.video_call_link || '';
  const zoomMeetingId = session.zoom_meeting_id || '';
  const zoomPassword = session.zoom_password || '';
  
  // Build location/address string + Google Maps link (only for presencial)
  let direccion = '';
  let mapsUrl = '';
  const isInPerson = (session.session_modality || 'in_person') === 'in_person';
  if (session.location) {
    direccion = `${session.location.name}, ${session.location.street}, ${session.location.city}`;
    if (isInPerson) {
      mapsUrl = buildGoogleMapsUrl(session.location);
    }
  }
  // If no location is assigned, leave direccion empty — don't fallback to center address

  // For presencial sessions with a maps URL, replace {direccion} with a string
  // that includes the maps URL so it becomes clickable (email: linkifyUrls; WhatsApp: auto-detect)
  const direccionWithMaps = direccion && mapsUrl
    ? `${direccion} (${mapsUrl})`
    : direccion;

  // If we have a template, use it with variable replacement
  if (template) {
    const rendered = template
      .replace(/\{nombre_paciente\}/g, session.patient.first_name)
      .replace(/\{profesional_nombre\}/g, professionalFirstName)
      .replace(/\{profesional_apellidos\}/g, professionalLastName)
      .replace(/\{fecha\}/g, formatDate(session.session_date))
      .replace(/\{zona_horaria\}/g, formatTime(session.start_time))
      .replace(/\{sesion_tipo\}/g, session.session_type || '')
      .replace(/\{direccion\}/g, direccionWithMaps)
      .replace(/\{link_google_maps\}/g, mapsUrl)
      .replace(/\{centro_nombre\}/g, center.name)
      .replace(/\{link_sesion\}/g, sessionLink)
      .replace(/\{link_confirmar\}/g, sessionLink ? `${sessionLink}?action=confirm` : '')
      .replace(/\{link_videollamada\}/g, videoCallLink)
      .replace(/\{zoom_meeting_id\}/g, zoomMeetingId)
      .replace(/\{zoom_password\}/g, zoomPassword);
    if (zoomPassword && !rendered.includes(zoomPassword)) {
      return `${rendered}\n\nAcceso Zoom:\nID de reunión: ${zoomMeetingId}\nContraseña: ${zoomPassword}`;
    }
    return rendered;
  }

  // Fallback hardcoded message
  let message = `Hola ${session.patient.first_name},\n\n`;
  message += `Te recordamos que tienes una cita programada:\n\n`;
  message += `📅 Fecha: ${formatDate(session.session_date)}\n`;
  message += `🕐 Hora: ${formatTime(session.start_time)}\n`;
  message += `👤 Profesional: ${professionalName}\n`;
  if (session.session_type) message += `📋 Tipo: ${session.session_type}\n`;
  if (direccion) {
    message += `📍 Lugar: ${direccion}\n`;
    if (mapsUrl) message += `🗺️ Ver en Google Maps: ${mapsUrl}\n`;
  }
  if (videoCallLink) message += `\n🔗 Enlace de videollamada: ${videoCallLink}\n`;
  if (zoomMeetingId) message += `🆔 ID de reunión: ${zoomMeetingId}\n`;
  if (zoomPassword) message += `🔑 Contraseña: ${zoomPassword}\n`;
  if (sessionLink) message += `\n🔗 Ver cita: ${sessionLink}\n`;
  message += `\nSi necesitas cancelar o reprogramar tu cita, por favor contáctanos con la mayor antelación posible.\n`;
  message += `\n✅ Responde *SÍ* a este mensaje para confirmar tu asistencia.\n`;
  message += `\nUn saludo,\n${center.name}`;
  return message;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const cronSecret = req.headers.get('x-cron-secret');
  const expectedSecret = Deno.env.get('CRON_SECRET');
  if (!expectedSecret) {
    console.error('[send-session-reminders] CRON_SECRET not configured');
    return new Response(
      JSON.stringify({ error: 'Function not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Support force mode to skip time window checks (for manual testing)
    let forceMode = false;
    try {
      const body = await req.json();
      forceMode = body?.force === true;
    } catch { /* no body or invalid JSON, ignore */ }

    console.log(`Starting session reminders processing...${forceMode ? ' (FORCE MODE)' : ''}`);

    // Get all centers with reminders enabled
    const { data: centers, error: centersError } = await supabase
      .from("centers")
      .select(`
        id,
        name,
        logo_url,
        invoice_logo_url,
        address,
        address_details,
        city,
        postal_code,
        session_reminder_enabled,
        session_reminder_timing,
        session_reminder_hours_before,
        session_reminder_channels,
        whatsapp_send_method,
        whatsapp_access_token,
        whatsapp_phone_number_id,
        wasender_enabled,
        wasender_auto_reminders,
        wasender_emergency_stop,
        custom_domain,
        public_domain
      `)
      .eq("session_reminder_enabled", true);

    if (centersError) {
      console.error("Error fetching centers:", centersError);
      throw centersError;
    }

    console.log(`Found ${centers?.length || 0} centers with reminders enabled`);

    const results: Array<{ centerId: string; sent: number; errors: number }> = [];

    for (const center of (centers as CenterConfig[]) || []) {
      console.log(`Processing center: ${center.name} (${center.id})`);
      
      const channels = center.session_reminder_channels || { email: true, whatsapp: false, sms: false };

      // Fetch WhatsApp reminder template for this center
      const { data: whatsappTemplate } = await supabase
        .from("communication_templates")
        .select("whatsapp_message")
        .eq("center_id", center.id)
        .eq("template_type", "reminder")
        .eq("channel", "whatsapp")
        .maybeSingle();

      const templateMessage = whatsappTemplate?.whatsapp_message || null;

      // Fetch Email reminder template for this center
      const { data: emailTemplate } = await supabase
        .from("communication_templates")
        .select("email_initial_text, email_subject")
        .eq("center_id", center.id)
        .eq("template_type", "reminder")
        .eq("channel", "email")
        .maybeSingle();

      const emailTemplateMessage = emailTemplate?.email_initial_text || null;
      const emailTemplateSubject = emailTemplate?.email_subject || null;

      // Determine base URL for session links
      const baseUrl = center.custom_domain 
        ? `https://${center.custom_domain}` 
        : (center.public_domain ? `https://${center.public_domain}` : 'https://psycma.lovable.app');

      // Calculate the time window for reminders
      const now = new Date();
      let targetTime: Date;
      
      if (center.session_reminder_timing === 'day_before_10am') {
        // Use Europe/Madrid timezone for the 10am window check
        const madridFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Europe/Madrid',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        });
        const madridParts = madridFormatter.formatToParts(now);
        const madridHour = parseInt(madridParts.find(p => p.type === 'hour')?.value || '0');
        const madridMinute = parseInt(madridParts.find(p => p.type === 'minute')?.value || '0');
        const totalMinutes = madridHour * 60 + madridMinute;
        
        // Only process if Madrid time is between 09:30 and 10:30 (unless force mode)
        if (!forceMode && (totalMinutes < 570 || totalMinutes > 630)) {
          console.log(`Skipping center ${center.name}: Madrid time is ${madridHour}:${String(madridMinute).padStart(2, '0')}, not within 10am window`);
          continue;
        }
        
        // Target = tomorrow's date in Madrid timezone
        const madridDateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Madrid',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const todayMadrid = new Date(madridDateFormatter.format(now));
        targetTime = new Date(todayMadrid);
        targetTime.setDate(targetTime.getDate() + 1);
      } else {
        // Hours-based timing
        const hoursBeforeMap: Record<string, number> = {
          '12_hours': 12,
          '24_hours': 24,
          '48_hours': 48,
          'custom_hours': center.session_reminder_hours_before || 24
        };
        
        const hoursBefore = hoursBeforeMap[center.session_reminder_timing] || 24;
        targetTime = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
      }

      // Get sessions within the reminder window (sessions happening in next X hours that haven't been reminded)
      const targetDateStr = targetTime.toISOString().split('T')[0];
      const windowStart = new Date(now.getTime() + (center.session_reminder_hours_before || 24) * 60 * 60 * 1000 - 30 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + (center.session_reminder_hours_before || 24) * 60 * 60 * 1000 + 30 * 60 * 1000);

      console.log(`Looking for sessions on ${targetDateStr} for center ${center.name}`);

      const { data: sessions, error: sessionsError } = await supabase
        .from("sessions")
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          price,
          payment_status,
          advance_payment_due_at,
          advance_payment_notification_sent_at,
          notes,
          session_type,
          session_modality,
          video_call_link,
          zoom_meeting_id,
          zoom_password,
          access_token,
          center_id,
          patient:patients!sessions_patient_id_fkey(
            id, first_name, last_name, email, phone
          ),
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          ),
          location:center_locations!sessions_location_id_fkey(
            name, street, number_details, city, postal_code
          )
        `)
        .eq("center_id", center.id)
        .eq("session_date", targetDateStr)
        .is("reminder_sent_at", null)
        .not("status", "in", '("cancelled","no_show","blocked")');

      if (sessionsError) {
        console.error(`Error fetching sessions for center ${center.id}:`, sessionsError);
        continue;
      }

      console.log(`Found ${sessions?.length || 0} sessions to remind for center ${center.name}`);

      let sent = 0;
      let errors = 0;
      let lastWasenderSendAt = 0;

      for (const sessionData of sessions || []) {
        // Extract single objects from arrays (Supabase returns arrays for joins)
        const session = {
          ...sessionData,
          patient: Array.isArray(sessionData.patient) ? sessionData.patient[0] : sessionData.patient,
          professional: Array.isArray(sessionData.professional) ? sessionData.professional[0] : sessionData.professional,
          location: Array.isArray(sessionData.location) ? sessionData.location[0] : sessionData.location,
        } as SessionToRemind;
        const patient = session.patient;
        if (!patient) {
          console.log(`Skipping session ${session.id}: no patient data`);
          continue;
        }

        const shouldIncludeAdvancePayment = Number(session.price ?? 0) > 0
          && !!session.advance_payment_due_at
          && !session.advance_payment_notification_sent_at
          && !["paid", "bono", "refunded"].includes((session.payment_status || "").toLowerCase());

        const shortSessionPath = session.access_token
          ? await getOrCreatePublicShortLink({
              supabase,
              centerId: center.id,
              targetType: "session",
              targetToken: session.access_token,
              expiresAt: null,
            })
          : null;
        const sessionLink = shortSessionPath ? `${baseUrl}${shortSessionPath}` : undefined;
        let whatsappMessage = buildReminderMessage(session, center, templateMessage, baseUrl, sessionLink);
        let emailMessage = buildReminderMessage(session, center, emailTemplateMessage || templateMessage, baseUrl, sessionLink);
        let advancePaymentBlockIncluded = false;
        let advancePaymentBlockError: string | null = null;

        if (shouldIncludeAdvancePayment) {
          const paymentChannel: "whatsapp" | "email" | null =
            channels.whatsapp && patient.phone
              ? "whatsapp"
              : (channels.email && patient.email ? "email" : null);

          if (paymentChannel) {
            const paymentBlock = await buildAdvancePaymentBlock({
              supabase,
              centerId: center.id,
              sessionId: session.id,
              channel: paymentChannel,
              baseUrl,
            });

            if (paymentBlock.hasPaymentInstructions && paymentBlock.block) {
              if (channels.whatsapp && patient.phone) {
                whatsappMessage = [whatsappMessage, paymentBlock.block].filter(Boolean).join("\n\n");
              }
              if (channels.email && patient.email) {
                emailMessage = [emailMessage, paymentBlock.block].filter(Boolean).join("\n\n");
              }
              advancePaymentBlockIncluded = true;
            } else {
              advancePaymentBlockError = paymentBlock.stripeError || advancePaymentBlockError;
            }
          }

          if (!advancePaymentBlockIncluded) {
            await markAdvancePaymentNotificationFailed(
              supabase,
              session.id,
              advancePaymentBlockError || "No hay metodos de pago configurados para enviar al paciente",
            );
          }
        }

        const logoUrl = center.invoice_logo_url || center.logo_url;
        let reminderSent = false;

        // Send email reminder
        if (channels.email && patient.email) {
          const emailSubject = emailTemplateSubject 
            ? emailTemplateSubject
                .replace(/\{nombre_paciente\}/g, patient.first_name)
                .replace(/\{fecha\}/g, formatDate(session.session_date))
            : `Recordatorio de cita - ${formatDate(session.session_date)}`;
          console.log(`Sending email reminder to patient ${patient.id} for session ${session.id}`);
          const emailResult = await sendEmailViaResend(
            patient.email,
            emailSubject,
            emailMessage,
            center.name,
            logoUrl
          );
          
          if (emailResult.success) {
            reminderSent = true;
            console.log(`Email sent successfully for patient ${patient.id}`);
          } else {
            console.error(`Email failed for patient ${patient.id}:`, emailResult.error);
            errors++;
          }

          // Create notification record for email
          await supabase.from("notifications").insert({
            center_id: center.id,
            patient_id: patient.id,
            session_id: session.id,
            type: 'email',
            recipient: patient.email,
            subject: emailSubject,
            message: emailMessage,
            status: emailResult.success ? 'sent' : 'failed',
            sent_at: emailResult.success ? new Date().toISOString() : null,
            error_message: emailResult.error || null
          });
        }

        // Send WhatsApp reminder
        if (channels.whatsapp && patient.phone) {
          let whatsappSentVia: string | null = null;
          let whatsappError: string | null = null;

          // Priority 1: WasenderAPI (automatic via personal number)
          if (!whatsappSentVia && center.wasender_enabled && center.wasender_auto_reminders && !center.wasender_emergency_stop) {
            const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");
            
            if (wasenderToken) {
              const { data: whatsappSession } = await supabase
                .from("whatsapp_sessions")
                .select("wasender_session_id, status, api_key")
                .eq("center_id", center.id)
                .single();

              if (whatsappSession?.wasender_session_id && whatsappSession.status === 'connected') {
                // Rate limit: wait 6s between WasenderAPI calls (account protection = 1 msg / 5s)
                if (lastWasenderSendAt > 0) {
                  const elapsed = Date.now() - lastWasenderSendAt;
                  if (elapsed < 6000) {
                    await new Promise(r => setTimeout(r, 6000 - elapsed));
                  }
                }

                console.log(`Sending WhatsApp reminder via WasenderAPI to patient ${patient.id} for session ${session.id}`);
                let wasenderResult = await sendWhatsAppViaWasender(
                  patient.phone,
                  whatsappMessage,
                  wasenderToken,
                  whatsappSession.wasender_session_id,
                  whatsappSession.api_key || undefined
                );
                lastWasenderSendAt = Date.now();

                // Retry once after 3 seconds if first attempt fails
                if (!wasenderResult.success) {
                  console.warn(`WasenderAPI attempt 1 failed for patient ${patient.id}: ${wasenderResult.error}. Retrying in 3s...`);
                  await new Promise(r => setTimeout(r, 3000));
                  wasenderResult = await sendWhatsAppViaWasender(
                    patient.phone,
                    whatsappMessage,
                    wasenderToken,
                    whatsappSession.wasender_session_id,
                    whatsappSession.api_key || undefined
                  );
                  lastWasenderSendAt = Date.now();
                }

                if (wasenderResult.success) {
                  whatsappSentVia = 'wasender';
                  reminderSent = true;
                  console.log(`WhatsApp sent via WasenderAPI for patient ${patient.id}`);
                } else {
                  console.error(`WasenderAPI failed definitively for patient ${patient.id}: ${wasenderResult.error}`);
                  whatsappError = `WasenderAPI: ${wasenderResult.error}`;
                  // Mark as failed - do NOT fall through to web mode
                  whatsappSentVia = 'wasender_failed';
                }
              } else {
                console.log(`WasenderAPI session not connected for center ${center.id}, falling back`);
              }
            }
          }
          
          // Priority 2: Meta Business API
          if (!whatsappSentVia) {
            const sendMethod = center.whatsapp_send_method || 'web';
            
            if (sendMethod === 'api' && center.whatsapp_access_token && center.whatsapp_phone_number_id) {
              console.log(`Sending WhatsApp reminder via Meta API (template) to patient ${patient.id} for session ${session.id}`);
              const decryptedToken = await decryptSecret(center.whatsapp_access_token);
              // Reminders are business-initiated and usually happen outside any open
              // 24h conversation window, so they must go through an approved template
              // rather than free-form text (see sendWhatsAppReminderTemplateViaMetaAPI).
              const metaResult = await sendWhatsAppReminderTemplateViaMetaAPI(
                patient.phone,
                patient.first_name,
                center.name,
                formatDate(session.session_date),
                formatTime(session.start_time),
                decryptedToken,
                center.whatsapp_phone_number_id,
                shortSessionPath ? shortSessionPath.replace(/^\/enlace\//, '') : undefined
              );
              
              if (metaResult.success) {
                whatsappSentVia = 'meta_api';
                reminderSent = true;
                console.log(`WhatsApp sent via Meta API for patient ${patient.id}`);
              } else {
                console.error(`Meta API failed for patient ${patient.id}: ${metaResult.error}, falling back to web`);
                whatsappError = metaResult.error || null;
              }
            }
          }

          // Priority 3: Web mode (manual fallback) - only if no API method was attempted
          if (!whatsappSentVia) {
            whatsappSentVia = 'web';
            reminderSent = true;
            console.log(`Creating pending WhatsApp reminder for patient ${patient.id} (web mode) for session ${session.id}`);
          }

          // Create ONE notification record based on the final result
          const isFailed = whatsappSentVia === 'wasender_failed';
          const finalStatus = isFailed ? 'failed' : (whatsappSentVia === 'web' ? 'pending' : (whatsappSentVia ? 'sent' : 'failed'));
          
          if (isFailed) {
            errors++;
          }

          await supabase.from("notifications").insert({
            center_id: center.id,
            patient_id: patient.id,
            session_id: session.id,
            type: 'whatsapp',
            recipient: patient.phone,
            message: whatsappMessage,
            status: finalStatus,
            sent_at: finalStatus === 'sent' ? new Date().toISOString() : null,
            scheduled_for: finalStatus === 'pending' ? new Date().toISOString() : null,
            error_message: whatsappError || null,
          });

          // Also record in whatsapp_messages for tracking (only if actually sent via API)
          if (whatsappSentVia === 'wasender' || whatsappSentVia === 'meta_api') {
            await supabase.from("whatsapp_messages").insert({
              center_id: center.id,
              phone: patient.phone.replace(/\D/g, ''),
              content: whatsappMessage,
              type: 'text',
              message_type: 'reminder',
              patient_id: patient.id,
              session_id: session.id,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
          }
        }

        // Mark session as reminded if at least one channel succeeded
        if (reminderSent) {
          const updatePayload: Record<string, string | null> = { reminder_sent_at: new Date().toISOString() };
          await supabase
            .from("sessions")
            .update(updatePayload)
            .eq("id", session.id);

          if (advancePaymentBlockIncluded) {
            await markAdvancePaymentNotificationSent(supabase, session.id);
          }
          
          sent++;
        }
      }

      results.push({ centerId: center.id, sent, errors });
    }

    console.log("Session reminders processing complete:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[send-session-reminders] Unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
