import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

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
}

interface SessionToRemind {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  price: number;
  notes: string | null;
  session_type: string | null;
  video_call_link: string | null;
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
    city: string;
  } | null;
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
        from: `${centerName || 'Psycma'} <onboarding@resend.dev>`,
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

// Send WhatsApp via Meta API
async function sendWhatsAppViaMetaAPI(
  phone: string,
  message: string,
  accessToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
      cleanPhone = '34' + cleanPhone;
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
          type: 'text',
          text: { preview_url: false, body: message }
        })
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

// Build reminder message
function buildReminderMessage(session: SessionToRemind, center: CenterConfig): string {
  const professionalName = session.professional.first_name 
    ? `${session.professional.first_name} ${session.professional.last_name || ''}`.trim()
    : 'el profesional';
  
  let message = `Hola ${session.patient.first_name},\n\n`;
  message += `Te recordamos que tienes una cita programada:\n\n`;
  message += `📅 Fecha: ${formatDate(session.session_date)}\n`;
  message += `🕐 Hora: ${formatTime(session.start_time)}\n`;
  message += `👤 Profesional: ${professionalName}\n`;
  
  if (session.session_type) {
    message += `📋 Tipo: ${session.session_type}\n`;
  }
  
  // Show location if available, otherwise fallback to center address
  if (session.location) {
    message += `📍 Lugar: ${session.location.name}, ${session.location.street}, ${session.location.city}\n`;
  } else {
    const centerAddress = buildCenterAddress(center);
    if (centerAddress) {
      message += `📍 Lugar: ${center.name}, ${centerAddress}\n`;
    }
  }
  
  if (session.video_call_link) {
    message += `\n🔗 Enlace de videollamada: ${session.video_call_link}\n`;
  }
  
  message += `\nSi necesitas cancelar o reprogramar tu cita, por favor contáctanos con la mayor antelación posible.\n\n`;
  message += `Un saludo,\n${center.name}`;
  
  return message;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting session reminders processing...");

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
        whatsapp_phone_number_id
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
      
      // Calculate the time window for reminders
      const now = new Date();
      let targetTime: Date;
      
      if (center.session_reminder_timing === 'day_before_10am') {
        // Sessions for tomorrow, send at 10am today
        const today10am = new Date(now);
        today10am.setHours(10, 0, 0, 0);
        
        // Only process if it's around 10am (within 30 min window)
        const timeDiff = Math.abs(now.getTime() - today10am.getTime());
        if (timeDiff > 30 * 60 * 1000) {
          console.log(`Skipping center ${center.name}: not within 10am window`);
          continue;
        }
        
        targetTime = new Date(now);
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
          notes,
          session_type,
          video_call_link,
          center_id,
          patient:patients!sessions_patient_id_fkey(
            id, first_name, last_name, email, phone
          ),
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          ),
          location:center_locations!sessions_location_id_fkey(
            name, street, city
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

        const message = buildReminderMessage(session, center);
        const logoUrl = center.invoice_logo_url || center.logo_url;
        let reminderSent = false;

        // Send email reminder
        if (channels.email && patient.email) {
          console.log(`Sending email reminder to ${patient.email} for session ${session.id}`);
          const emailResult = await sendEmailViaResend(
            patient.email,
            `Recordatorio de cita - ${formatDate(session.session_date)}`,
            message,
            center.name,
            logoUrl
          );
          
          if (emailResult.success) {
            reminderSent = true;
            console.log(`Email sent successfully to ${patient.email}`);
          } else {
            console.error(`Email failed for ${patient.email}:`, emailResult.error);
            errors++;
          }

          // Create notification record for email
          await supabase.from("notifications").insert({
            center_id: center.id,
            patient_id: patient.id,
            session_id: session.id,
            type: 'email',
            recipient: patient.email,
            subject: `Recordatorio de cita - ${formatDate(session.session_date)}`,
            message: message,
            status: emailResult.success ? 'sent' : 'failed',
            sent_at: emailResult.success ? new Date().toISOString() : null,
            error_message: emailResult.error || null
          });
        }

        // Send WhatsApp reminder
        if (channels.whatsapp && patient.phone) {
          const sendMethod = center.whatsapp_send_method || 'web';
          
          if (sendMethod === 'api' && center.whatsapp_access_token && center.whatsapp_phone_number_id) {
            // Send via Meta API
            console.log(`Sending WhatsApp reminder via API to ${patient.phone} for session ${session.id}`);
            // Decrypt the access token
            const decryptedToken = await decryptSecret(center.whatsapp_access_token);
            const whatsappResult = await sendWhatsAppViaMetaAPI(
              patient.phone,
              message,
              decryptedToken,
              center.whatsapp_phone_number_id
            );
            
            if (whatsappResult.success) {
              reminderSent = true;
              console.log(`WhatsApp sent successfully to ${patient.phone}`);
            } else {
              console.error(`WhatsApp failed for ${patient.phone}:`, whatsappResult.error);
              errors++;
            }

            // Create notification record for WhatsApp API
            await supabase.from("notifications").insert({
              center_id: center.id,
              patient_id: patient.id,
              session_id: session.id,
              type: 'whatsapp',
              recipient: patient.phone,
              message: message,
              status: whatsappResult.success ? 'sent' : 'failed',
              sent_at: whatsappResult.success ? new Date().toISOString() : null,
              error_message: whatsappResult.error || null
            });
          } else {
            // Web mode - create pending notification for manual sending
            console.log(`Creating pending WhatsApp reminder for ${patient.phone} (web mode) for session ${session.id}`);
            
            await supabase.from("notifications").insert({
              center_id: center.id,
              patient_id: patient.id,
              session_id: session.id,
              type: 'whatsapp',
              recipient: patient.phone,
              message: message,
              status: 'pending', // Pending for manual send via WhatsApp Web
              scheduled_for: new Date().toISOString(),
            });
            
            // Mark as processed even though it's pending manual action
            reminderSent = true;
          }
        }

        // Mark session as reminded if at least one channel succeeded
        if (reminderSent) {
          await supabase
            .from("sessions")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", session.id);
          
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
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error processing session reminders:", error);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
