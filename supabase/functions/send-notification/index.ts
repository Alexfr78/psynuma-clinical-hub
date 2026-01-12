import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptSecret } from "../_shared/crypto.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL"); // e.g., "noreply@tudominio.com"

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

interface ResendEmailResult {
  success: boolean;
  error?: string;
  providerMessageId?: string;
}

// Convert plain text URLs to clickable hyperlinks
function linkifyUrls(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return text.replace(urlRegex, (url) => 
    `<a href="${url}" style="color: #1d4ed8; text-decoration: underline; word-break: break-all;">${url}</a>`
  );
}

// Send email via Resend API with detailed logging
async function sendEmailViaResend(
  to: string,
  subject: string,
  message: string,
  centerName?: string,
  logoUrl?: string | null
): Promise<ResendEmailResult> {
  // Determine the from address
  const fromEmail = RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const fromAddress = `${centerName || 'Psycma'} <${fromEmail}>`;
  
  console.log(`[send-notification] Preparing email:`, {
    to,
    subject,
    from: fromAddress,
    fromEmailConfigured: !!RESEND_FROM_EMAIL,
  });

  // IMPORTANT: If using onboarding@resend.dev, emails can only be sent to the Resend account owner
  if (fromEmail === "onboarding@resend.dev") {
    console.warn(`[send-notification] WARNING: Using test domain 'onboarding@resend.dev'. Emails can only be sent to the Resend account owner's email. Configure RESEND_FROM_EMAIL with a verified domain.`);
  }

  // Build header content
  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${centerName || 'Centro'}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto;">`
    : (centerName ? `<span style="margin: 0; font-size: 20px; font-weight: bold; color: #1d4ed8;">${centerName}</span>` : '');
  
  // Process message
  const processedMessage = linkifyUrls(message.replace(/\n/g, '<br>'));
  
  // Outlook-compatible HTML
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

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject: subject,
        html: htmlContent,
      }),
    });

    const data = await response.json();

    console.log(`[send-notification] Resend API response:`, {
      status: response.status,
      ok: response.ok,
      data,
    });

    if (!response.ok) {
      // Check for specific error types
      const errorName = data.name || 'unknown_error';
      const errorMessage = data.message || `API Error: ${response.status}`;
      
      // Log suppression/bounce info if available
      if (errorName === 'validation_error' && errorMessage.includes('testing emails')) {
        console.error(`[send-notification] DOMAIN NOT VERIFIED: ${errorMessage}`);
      } else if (errorName === 'validation_error' && errorMessage.includes('suppressed')) {
        console.error(`[send-notification] EMAIL SUPPRESSED (bounce/complaint): ${to}`);
      }
      
      return { 
        success: false, 
        error: `[${errorName}] ${errorMessage}` 
      };
    }

    // Success - Resend returns { id: "..." } on success
    const providerMessageId = data.id;
    console.log(`[send-notification] Email sent successfully. Provider message ID: ${providerMessageId}`);

    return { 
      success: true, 
      providerMessageId 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[send-notification] Exception sending email:`, error);
    return { success: false, error: errorMessage };
  }
}

// Generate WhatsApp Web link
function generateWhatsAppWebLink(phone: string, message: string): string {
  let cleanPhone = phone.replace(/\D/g, '');
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
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
      cleanPhone = '34' + cleanPhone;
    }

    console.log(`[send-notification] Sending WhatsApp via Meta API to ${cleanPhone}`);

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
      console.error('[send-notification] Meta API error:', data);
      return { 
        success: false, 
        error: data.error?.message || `API Error: ${response.status}` 
      };
    }

    console.log('[send-notification] WhatsApp sent successfully via Meta API:', data);
    return { success: true };
  } catch (error) {
    console.error('[send-notification] Error sending WhatsApp via Meta API:', error);
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

    console.log(`[send-notification] Request received:`, { notificationId, processScheduled });

    let notifications;

    if (notificationId) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("id", notificationId)
        .single();

      if (error) {
        console.error(`[send-notification] Error fetching notification ${notificationId}:`, error);
        throw error;
      }
      notifications = [data];
      console.log(`[send-notification] Processing notification:`, {
        id: data.id,
        type: data.type,
        recipient: data.recipient,
        subject: data.subject,
      });
    } else if (processScheduled) {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_for", new Date().toISOString());

      if (error) throw error;
      notifications = data;
      console.log(`[send-notification] Found ${notifications?.length || 0} scheduled notifications to process`);
    } else {
      throw new Error("notificationId or processScheduled required");
    }

    const results = [];

    for (const notification of notifications) {
      try {
        let success = false;
        let errorMessage: string | null = null;
        let whatsappWebLink: string | null = null;
        let providerMessageId: string | undefined;

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
          logoUrl = centerData?.invoice_logo_url || centerData?.logo_url || null;
        }

        switch (notification.type) {
          case "email": {
            const emailResult = await sendEmailViaResend(
              notification.recipient,
              notification.subject || 'Notificación',
              notification.message,
              centerName,
              logoUrl
            );
            success = emailResult.success;
            errorMessage = emailResult.error || null;
            providerMessageId = emailResult.providerMessageId;
            break;
          }

          case "sms":
            console.log(`[send-notification] SMS sending not implemented. Recipient: ${notification.recipient}`);
            success = true;
            break;

          case "whatsapp": {
            const { data: centerData, error: centerError } = await supabase
              .from("centers")
              .select("whatsapp_send_method, whatsapp_access_token, whatsapp_phone_number_id")
              .eq("id", notification.center_id)
              .single();

            if (centerError) {
              console.error('[send-notification] Error fetching center config:', centerError);
              errorMessage = 'Error al obtener configuración del centro';
              break;
            }

            const centerConfig = centerData as CenterWhatsAppConfig;
            const sendMethod = centerConfig?.whatsapp_send_method || 'web';

            console.log(`[send-notification] WhatsApp send method: ${sendMethod}`);

            if (sendMethod === 'api') {
              const encryptedToken = centerConfig?.whatsapp_access_token;
              const phoneNumberId = centerConfig?.whatsapp_phone_number_id;

              if (!encryptedToken || !phoneNumberId) {
                errorMessage = 'Credenciales de API de Meta no configuradas';
                console.error(`[send-notification] ${errorMessage}`);
                break;
              }

              // Decrypt the access token
              const accessToken = await decryptSecret(encryptedToken);

              const apiResult = await sendWhatsAppViaMetaAPI(
                notification.recipient,
                notification.message,
                accessToken,
                phoneNumberId
              );

              success = apiResult.success;
              errorMessage = apiResult.error || null;
            } else {
              whatsappWebLink = generateWhatsAppWebLink(
                notification.recipient,
                notification.message
              );
              console.log(`[send-notification] Generated WhatsApp Web link for manual sending`);
              success = true;
            }
            break;
          }

          default:
            errorMessage = `Unknown notification type: ${notification.type}`;
            console.error(`[send-notification] ${errorMessage}`);
        }

        // Determine final status
        let finalStatus: string;
        if (notification.type === 'whatsapp' && whatsappWebLink) {
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

        if (updateError) {
          console.error(`[send-notification] Error updating notification status:`, updateError);
        }

        const result = {
          id: notification.id,
          type: notification.type,
          recipient: notification.recipient,
          ok: success,
          status: finalStatus,
          error: errorMessage,
          providerMessageId,
          whatsappWebLink,
        };

        console.log(`[send-notification] Result for ${notification.id}:`, result);
        results.push(result);

      } catch (notifError) {
        const errorMsg = notifError instanceof Error ? notifError.message : 'Unknown error';
        console.error(`[send-notification] Exception processing notification ${notification.id}:`, notifError);
        
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
          ok: false,
          status: 'failed',
          error: errorMsg,
        });
      }
    }

    // Return structured response
    const allOk = results.every(r => r.ok);
    return new Response(
      JSON.stringify({ 
        ok: allOk, 
        results,
        processedCount: results.length,
        successCount: results.filter(r => r.ok).length,
        failedCount: results.filter(r => !r.ok).length,
      }),
      { 
        status: allOk ? 200 : 207, // 207 Multi-Status if some failed
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error) {
    console.error("[send-notification] Fatal error:", error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : "Error interno del servidor" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
