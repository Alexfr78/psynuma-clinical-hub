import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';
import { decryptSecret } from "../_shared/crypto.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  invoiceId: string;
  patientId: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  channel: 'email' | 'whatsapp' | 'both';
}

// Send WhatsApp via WasenderAPI
async function sendWhatsAppViaWasender(
  supabase: ReturnType<typeof createClient>,
  centerId: string,
  phone: string,
  message: string,
  patientId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[send-invoice-notification] Sending WhatsApp via WasenderAPI to ${phone}`);
    
    const { data, error } = await supabase.functions.invoke('wasender-send-message', {
      body: {
        phone,
        message,
        patient_id: patientId,
        message_type: 'invoice',
      },
    });

    if (error) {
      console.error('[send-invoice-notification] WasenderAPI invoke error:', error);
      return { success: false, error: error.message };
    }

    if (!data?.success) {
      const errorMsg = data?.error || 'Unknown WasenderAPI error';
      console.error('[send-invoice-notification] WasenderAPI failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log('[send-invoice-notification] WhatsApp sent successfully via WasenderAPI');
    return { success: true };
  } catch (error) {
    console.error('[send-invoice-notification] WasenderAPI exception:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
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
          text: { preview_url: true, body: message }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API error:', data);
      return { success: false, error: data.error?.message || `API Error: ${response.status}` };
    }

    console.log('WhatsApp sent successfully via Meta API:', data);
    return { success: true };
  } catch (error) {
    console.error('Error sending WhatsApp via Meta API:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get the public URL for the invoice
function getInvoicePublicUrl(accessToken: string, customDomain?: string | null): string {
  // If custom domain is configured, use it
  if (customDomain) {
    const baseUrl = customDomain.startsWith('http') ? customDomain : `https://${customDomain}`;
    // Remove trailing slash if present
    const cleanUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${cleanUrl}/factura/${accessToken}`;
  }
  
  // Fallback: Use the Supabase URL to construct the public app URL
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  // Extract project ID from Supabase URL (format: https://PROJECT_ID.supabase.co)
  const projectId = supabaseUrl.split('//')[1]?.split('.')[0] || '';
  
  // Construct the Lovable app URL
  const appUrl = `https://${projectId}.lovable.app`;
  
  return `${appUrl}/factura/${accessToken}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: RequestBody = await req.json();
    const { invoiceId, patientId, patientEmail, patientPhone, channel } = body;

    console.log('Sending invoice notification:', { invoiceId, channel });

    // Fetch invoice with center and patient data (including WasenderAPI settings)
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        patients!inner(first_name, last_name, email, phone),
        centers!inner(
          name, email, phone,
          custom_domain,
          whatsapp_send_method,
          whatsapp_access_token,
          whatsapp_phone_number_id,
          wasender_enabled,
          wasender_emergency_stop
        )
      `)
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error('Error fetching invoice:', invoiceError);
      throw new Error('Invoice not found');
    }

    const patient = invoice.patients;
    const center = invoice.centers;
    const email = patientEmail || patient?.email;
    const phone = patientPhone || patient?.phone;

    // Generate the public invoice URL using custom domain if configured
    const invoiceUrl = invoice.access_token 
      ? getInvoicePublicUrl(invoice.access_token, center?.custom_domain)
      : null;

    console.log('Invoice public URL:', invoiceUrl);

    let emailSent = false;
    let whatsappSent = false;
    let whatsappLink = null;
    let whatsappSendMethod = 'web'; // default

    // Send email if requested and email available
    if ((channel === 'email' || channel === 'both') && email) {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          
          const patientName = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim();
          const invoiceNumber = invoice.invoice_number;
          const total = invoice.total?.toFixed(2) || '0.00';
          
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <tr>
                  <td style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">${center?.name || 'Centro'}</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Factura ${invoiceNumber}</p>
                  </td>
                </tr>
                <tr>
                  <td style="background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="margin: 0 0 15px 0;">Estimado/a ${patientName},</p>
                    <p style="margin: 0 0 20px 0;">Le enviamos su factura correspondiente a los servicios prestados.</p>
                    
                    <table width="100%" cellpadding="0" cellspacing="0" style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                      <tr>
                        <td>
                          <p style="margin: 0 0 10px 0;"><strong>Número de factura:</strong> ${invoiceNumber}</p>
                          <p style="margin: 0 0 10px 0;"><strong>Fecha:</strong> ${new Date(invoice.issue_date).toLocaleDateString('es-ES')}</p>
                          <p style="margin: 0;"><strong>Total:</strong> <span style="font-size: 24px; font-weight: bold; color: #1d4ed8;">${total}€</span></p>
                        </td>
                      </tr>
                    </table>
                    
                    ${invoiceUrl ? `
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin: 25px 0;">
                      <tr>
                        <td align="center">
                          <a href="${invoiceUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Ver y descargar factura</a>
                        </td>
                      </tr>
                      <tr>
                        <td align="center" style="padding-top: 15px;">
                          <p style="margin: 0; color: #64748b; font-size: 14px;">O copie este enlace: <a href="${invoiceUrl}" style="color: #3b82f6;">${invoiceUrl}</a></p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    <p style="margin: 20px 0 0 0;">Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>
                    
                    <p style="margin: 20px 0 0 0;">Atentamente,<br>${center?.name || 'El equipo'}</p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center; padding: 20px; color: #64748b; font-size: 14px;">
                    <p style="margin: 0;">${center?.name || ''}</p>
                    ${center?.email ? `<p style="margin: 5px 0 0 0;">${center.email}</p>` : ''}
                    ${center?.phone ? `<p style="margin: 5px 0 0 0;">${center.phone}</p>` : ''}
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `;

          const emailResponse = await resend.emails.send({
            from: `${center?.name || 'Psycma'} <onboarding@resend.dev>`,
            to: [email],
            subject: `Factura ${invoiceNumber} - ${center?.name || 'Psycma'}`,
            html: emailHtml,
          });

          console.log('Email sent successfully:', emailResponse);
          emailSent = true;

          // Log notification
          await supabase.from('notifications').insert({
            center_id: invoice.center_id,
            patient_id: patientId,
            type: 'email',
            recipient: email,
            subject: `Factura ${invoiceNumber}`,
            message: `Factura ${invoiceNumber} enviada por email`,
            status: 'sent',
            sent_at: new Date().toISOString(),
          });

        } catch (emailError) {
          console.error('Error sending email:', emailError);
        }
      } else {
        console.log('RESEND_API_KEY not configured, skipping email');
      }
    }

    // Handle WhatsApp if requested and phone available
    if ((channel === 'whatsapp' || channel === 'both') && phone) {
      const patientName = `${patient?.first_name || ''} ${patient?.last_name || ''}`.trim();
      const invoiceNumber = invoice.invoice_number;
      const total = invoice.total?.toFixed(2) || '0.00';

      // Build message with download link
      let message = `Hola ${patientName}, le enviamos su factura ${invoiceNumber} por un total de ${total}€.`;
      
      if (invoiceUrl) {
        message += `\n\n📄 Ver y descargar factura:\n${invoiceUrl}`;
      }
      
      message += `\n\nGracias por confiar en ${center?.name || 'nosotros'}.`;

      // Clean phone number
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
        cleanPhone = '34' + cleanPhone;
      }

      // Check WasenderAPI connection status
      let wasenderConnected = false;
      if (center?.wasender_enabled && !center?.wasender_emergency_stop) {
        const { data: wasenderSession } = await supabase
          .from("whatsapp_sessions")
          .select("status")
          .eq("center_id", invoice.center_id)
          .maybeSingle();
        
        wasenderConnected = wasenderSession?.status === 'connected';
      }

      console.log(`[send-invoice-notification] WhatsApp delivery check:`, {
        wasender_enabled: center?.wasender_enabled,
        wasender_emergency_stop: center?.wasender_emergency_stop,
        wasender_connected: wasenderConnected,
        whatsapp_send_method: center?.whatsapp_send_method,
      });

      // PRIORITY 1: WasenderAPI (if enabled AND connected AND not emergency stopped)
      if (center?.wasender_enabled && wasenderConnected && !center?.wasender_emergency_stop) {
        console.log('[send-invoice-notification] Using WasenderAPI (Priority 1)');
        whatsappSendMethod = 'wasender';
        
        const wasenderResult = await sendWhatsAppViaWasender(
          supabase,
          invoice.center_id,
          phone,
          message,
          patientId
        );

        if (wasenderResult.success) {
          whatsappSent = true;

          // Log notification
          await supabase.from('notifications').insert({
            center_id: invoice.center_id,
            patient_id: patientId,
            type: 'whatsapp',
            recipient: phone,
            message: message,
            status: 'sent',
            sent_at: new Date().toISOString(),
          });
        } else {
          console.warn('[send-invoice-notification] WasenderAPI failed, trying fallback:', wasenderResult.error);
        }
      }

      // PRIORITY 2: Meta API (if configured and WasenderAPI didn't succeed)
      if (!whatsappSent && center?.whatsapp_send_method === 'api' && center?.whatsapp_access_token && center?.whatsapp_phone_number_id) {
        console.log('[send-invoice-notification] Using Meta API (Priority 2)');
        whatsappSendMethod = 'api';
        
        // Decrypt the access token
        const decryptedToken = await decryptSecret(center.whatsapp_access_token);
        const apiResult = await sendWhatsAppViaMetaAPI(
          phone,
          message,
          decryptedToken,
          center.whatsapp_phone_number_id
        );

        whatsappSent = apiResult.success;

        // Log notification
        await supabase.from('notifications').insert({
          center_id: invoice.center_id,
          patient_id: patientId,
          type: 'whatsapp',
          recipient: phone,
          message: message,
          status: apiResult.success ? 'sent' : 'failed',
          sent_at: apiResult.success ? new Date().toISOString() : null,
          error_message: apiResult.error || null,
        });

        if (!apiResult.success) {
          console.error('WhatsApp API failed:', apiResult.error);
        }
      }

      // PRIORITY 3: Web mode - generate link for manual sending
      if (!whatsappSent) {
        console.log('[send-invoice-notification] Using WhatsApp Web (Priority 3)');
        whatsappSendMethod = 'web';
        whatsappLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        whatsappSent = true; // Link was generated successfully

        // Log notification as pending (manual send required)
        await supabase.from('notifications').insert({
          center_id: invoice.center_id,
          patient_id: patientId,
          type: 'whatsapp',
          recipient: phone,
          message: message,
          status: 'pending', // Pending because it requires manual action
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailSent,
        whatsappSent,
        whatsappLink,
        whatsappSendMethod,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-invoice-notification:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
