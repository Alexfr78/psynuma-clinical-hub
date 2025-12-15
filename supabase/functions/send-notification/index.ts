import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// Send email via Resend API directly
async function sendEmailViaResendAPI(
  to: string,
  subject: string,
  htmlContent: string,
  fromName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <onboarding@resend.dev>`,
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

    console.log("Email sent successfully via Resend:", data);
    return { success: true };
  } catch (error) {
    console.error("Error calling Resend API:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  notificationId?: string;
  processScheduled?: boolean;
}

interface CenterWhatsAppConfig {
  whatsapp_send_method: string | null;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
}

// Convert plain text URLs to clickable hyperlinks
function linkifyUrls(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => 
    `<a href="${url}" style="color: #1d4ed8; text-decoration: underline; word-break: break-all;">${url}</a>`
  );
}

// Send email via Resend with Outlook-compatible HTML
async function sendEmailViaResend(
  to: string,
  subject: string,
  message: string,
  centerName?: string,
  logoUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  console.log(`Sending email via Resend to ${to}: ${subject}`);
  
  // Build header content - logo centered or subtle text
  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${centerName || 'Centro'}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto;">`
    : (centerName ? `<span style="margin: 0; font-size: 20px; font-weight: bold; color: #1d4ed8;">${centerName}</span>` : '');
  
  // Process message: convert newlines to <br> and linkify URLs
  const processedMessage = linkifyUrls(message.replace(/\n/g, '<br>'));
  
  // Outlook-compatible HTML with inline styles and table layout
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
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 24px 24px 20px 24px; border-bottom: 1px solid #e2e8f0;">
              ${headerContent}
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 24px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #333333;">
              ${processedMessage}
            </td>
          </tr>
          <!-- Footer -->
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

  return sendEmailViaResendAPI(to, subject, htmlContent, centerName || 'Psycma');
}

// Generate WhatsApp Web link
function generateWhatsAppWebLink(phone: string, message: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
  
  // If 9 digits starting with 6 or 7, add Spanish country code
  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
    cleanPhone = '34' + cleanPhone;
  }
  
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}

// Send WhatsApp via Meta API
async function sendWhatsAppViaMetaAPI(
  phone: string,
  message: string,
  accessToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Clean phone number
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
      cleanPhone = '34' + cleanPhone;
    }

    console.log(`Sending WhatsApp via Meta API to ${cleanPhone}`);

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
          text: { 
            preview_url: false,
            body: message 
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', data);
      return { 
        success: false, 
        error: data.error?.message || `API Error: ${response.status}` 
      };
    }

    console.log('WhatsApp sent successfully via Meta API:', data);
    return { success: true };
  } catch (error) {
    console.error('Error sending WhatsApp via Meta API:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
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

    const { notificationId, processScheduled } = await req.json() as NotificationRequest;

    let notifications;

    if (notificationId) {
      // Send specific notification
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (error) throw error;
      notifications = [data];
    } else if (processScheduled) {
      // Process all pending scheduled notifications
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString());

      if (error) throw error;
      notifications = data;
    } else {
      throw new Error("notificationId or processScheduled required");
    }

    const results = [];

    for (const notification of notifications) {
      try {
        let success = false;
        let errorMessage = null;
        let whatsappWebLink = null;

        // Get center info for email branding
        let centerName: string | undefined;
        let logoUrl: string | null = null;
        if (notification.type === 'email') {
          const { data: centerData } = await supabase
            .from("centers")
            .select("name, logo_url, invoice_logo_url")
            .eq("id", notification.center_id)
            .single();
          centerName = centerData?.name;
          // Use invoice_logo_url as primary, fallback to logo_url
          logoUrl = centerData?.invoice_logo_url || centerData?.logo_url || null;
        }

        switch (notification.type) {
          case "email": {
            // Send email via Resend
            const emailResult = await sendEmailViaResend(
              notification.recipient,
              notification.subject || 'Notificación',
              notification.message,
              centerName,
              logoUrl
            );
            success = emailResult.success;
            errorMessage = emailResult.error || null;
            break;
          }

          case "sms":
            // TODO: Integrate with Twilio for SMS
            console.log(`Sending SMS to ${notification.recipient}: ${notification.message}`);
            success = true;
            break;

          case "whatsapp": {
            // Get center's WhatsApp configuration
            const { data: centerData, error: centerError } = await supabase
              .from("centers")
              .select("whatsapp_send_method, whatsapp_access_token, whatsapp_phone_number_id")
              .eq("id", notification.center_id)
              .single();

            if (centerError) {
              console.error('Error fetching center config:', centerError);
              errorMessage = 'Error al obtener configuración del centro';
              break;
            }

            const centerConfig = centerData as CenterWhatsAppConfig;
            const sendMethod = centerConfig?.whatsapp_send_method || 'web';

            console.log(`WhatsApp send method for center: ${sendMethod}`);

            if (sendMethod === 'api') {
              // Send via Meta API
              const accessToken = centerConfig?.whatsapp_access_token;
              const phoneNumberId = centerConfig?.whatsapp_phone_number_id;

              if (!accessToken || !phoneNumberId) {
                errorMessage = 'Credenciales de API de Meta no configuradas';
                console.error(errorMessage);
                break;
              }

              const apiResult = await sendWhatsAppViaMetaAPI(
                notification.recipient,
                notification.message,
                accessToken,
                phoneNumberId
              );

              success = apiResult.success;
              errorMessage = apiResult.error || null;
            } else {
              // WhatsApp Web mode - generate link for manual sending
              whatsappWebLink = generateWhatsAppWebLink(
                notification.recipient,
                notification.message
              );
              console.log(`Generated WhatsApp Web link: ${whatsappWebLink}`);
              
              // Mark as pending_manual instead of sent
              // The notification stays pending until user manually sends via the link
              success = true;
            }
            break;
          }

          default:
            errorMessage = `Unknown notification type: ${notification.type}`;
        }

        // Determine final status
        let finalStatus: string;
        if (notification.type === 'whatsapp' && whatsappWebLink) {
          // For WhatsApp Web mode, keep as pending (user needs to manually send)
          finalStatus = 'pending';
        } else {
          finalStatus = success ? 'sent' : 'failed';
        }

        // Update notification status
        const updateData: Record<string, unknown> = {
          status: finalStatus,
          error_message: errorMessage,
        };

        if (success && finalStatus === 'sent') {
          updateData.sent_at = new Date().toISOString();
        }

        const { error: updateError } = await supabase
          .from("notifications")
          .update(updateData)
          .eq("id", notification.id);

        if (updateError) throw updateError;

        results.push({
          id: notification.id,
          type: notification.type,
          recipient: notification.recipient,
          success,
          error: errorMessage,
          whatsappWebLink,
        });
      } catch (notifError) {
        const errorMsg = notifError instanceof Error ? notifError.message : 'Unknown error';
        console.error(`Error processing notification ${notification.id}:`, notifError);
        
        // Update as failed
        await supabase
          .from("notifications")
          .update({
            status: "failed",
            error_message: errorMsg,
          })
          .eq("id", notification.id);

        results.push({
          id: notification.id,
          type: notification.type,
          recipient: notification.recipient,
          success: false,
          error: errorMsg,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
