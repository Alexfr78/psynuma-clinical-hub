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

// Send email via Resend
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
    ? `<img src="${logoUrl}" alt="${centerName || 'Centro'}" style="max-height: 60px; max-width: 200px; object-fit: contain;">`
    : (centerName ? `<h1 style="margin: 0; font-size: 20px; color: #1d4ed8;">${centerName}</h1>` : '');
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 24px; border-bottom: 1px solid #e2e8f0; }
          .content { background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; }
          .message { white-space: pre-wrap; }
          .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          ${headerContent}
        </div>
        <div class="content">
          <div class="message">${message.replace(/\n/g, '<br>')}</div>
          <div class="footer">
            <p>Este es un mensaje automático enviado por ${centerName || 'Psycma'}.</p>
          </div>
        </div>
      </body>
    </html>
  `;

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
