import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

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
          text: { preview_url: false, body: message }
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

    // Fetch invoice with center and patient data
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        patients!inner(first_name, last_name, email, phone),
        centers!inner(
          name, email, phone,
          whatsapp_send_method,
          whatsapp_access_token,
          whatsapp_phone_number_id
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

    let emailSent = false;
    let whatsappSent = false;
    let whatsappLink = null;
    let whatsappSendMethod = 'web'; // default

    // Get WhatsApp configuration from center
    if (center) {
      whatsappSendMethod = center.whatsapp_send_method || 'web';
    }

    console.log(`WhatsApp send method: ${whatsappSendMethod}`);

    // Generate PDF first
    const { data: pdfData, error: pdfError } = await supabase.functions.invoke('generate-invoice-pdf', {
      body: { invoice_id: invoiceId },
    });

    if (pdfError) {
      console.error('Error generating PDF:', pdfError);
    }

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
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f8fafc; padding: 30px; border: 1px solid #e2e8f0; }
                .invoice-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e2e8f0; }
                .total { font-size: 24px; font-weight: bold; color: #1d4ed8; }
                .footer { text-align: center; padding: 20px; color: #64748b; font-size: 14px; }
                .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1 style="margin: 0;">${center?.name || 'Centro'}</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">Factura ${invoiceNumber}</p>
                </div>
                <div class="content">
                  <p>Estimado/a ${patientName},</p>
                  <p>Le enviamos su factura correspondiente a los servicios prestados.</p>
                  
                  <div class="invoice-box">
                    <p style="margin: 0 0 10px 0;"><strong>Número de factura:</strong> ${invoiceNumber}</p>
                    <p style="margin: 0 0 10px 0;"><strong>Fecha:</strong> ${new Date(invoice.issue_date).toLocaleDateString('es-ES')}</p>
                    <p style="margin: 0;"><strong>Total:</strong> <span class="total">${total}€</span></p>
                  </div>
                  
                  <p>Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.</p>
                  
                  <p>Atentamente,<br>${center?.name || 'El equipo'}</p>
                </div>
                <div class="footer">
                  <p>${center?.name || ''}</p>
                  ${center?.email ? `<p>${center.email}</p>` : ''}
                  ${center?.phone ? `<p>${center.phone}</p>` : ''}
                </div>
              </div>
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

      const message = `Hola ${patientName}, le enviamos su factura ${invoiceNumber} por un total de ${total}€. Gracias por confiar en ${center?.name || 'nosotros'}.`;

      // Clean phone number
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
        cleanPhone = '34' + cleanPhone;
      }

      if (whatsappSendMethod === 'api' && center?.whatsapp_access_token && center?.whatsapp_phone_number_id) {
        // Send via Meta API
        console.log('Sending WhatsApp via Meta API');
        const apiResult = await sendWhatsAppViaMetaAPI(
          phone,
          message,
          center.whatsapp_access_token,
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
      } else {
        // Web mode - generate link for manual sending
        console.log('WhatsApp Web mode - generating link');
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
