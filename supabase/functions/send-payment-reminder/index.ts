import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentReminderRequest {
  debt_id: string;
  channel: 'email' | 'whatsapp' | 'sms';
  include_stripe_link: boolean;
  include_bizum: boolean;
  include_transfer?: boolean;
  include_bono_option: boolean;
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

    const { 
      debt_id, 
      channel, 
      include_stripe_link, 
      include_bizum, 
      include_transfer = false,
      include_bono_option 
    } = await req.json() as PaymentReminderRequest;

    console.log(`[send-payment-reminder] Processing reminder for debt ${debt_id}, channel: ${channel}`);

    // Get debt with patient and session info
    const { data: debt, error: debtError } = await supabase
      .from('debts')
      .select(`
        *,
        patients (id, first_name, last_name, email, phone),
        sessions (id, session_date, session_type)
      `)
      .eq('id', debt_id)
      .single();

    if (debtError || !debt) {
      console.error('[send-payment-reminder] Debt not found:', debtError);
      return new Response(
        JSON.stringify({ error: 'Deuda no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get center info with public_domain
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id, name, bizum_phone, bank_transfer_info, oauth_stripe_credentials, public_domain')
      .eq('id', debt.center_id)
      .single();

    if (centerError || !center) {
      console.error('[send-payment-reminder] Center not found:', centerError);
      return new Response(
        JSON.stringify({ error: 'Centro no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get communication template
    const { data: template } = await supabase
      .from('communication_templates')
      .select('*')
      .eq('center_id', center.id)
      .eq('channel', channel)
      .eq('template_type', 'payment_reminder')
      .maybeSingle();

    // Calculate amounts
    const pendingAmount = Number(debt.amount) - Number(debt.paid_amount);
    const bizumNumber = center.bizum_phone || '609555514';
    const transferInfo = (center as any).bank_transfer_info || '';
    
    // Use center's public domain for URLs
    const baseUrl = center.public_domain 
      ? `https://${center.public_domain}` 
      : (() => {
      const v = Deno.env.get('APP_BASE_URL');
      if (!v) throw new Error('APP_BASE_URL not configured');
      return v;
    })();
    
    // Generate Stripe checkout link if needed
    let stripeCheckoutUrl = '';
    if (include_stripe_link && center.oauth_stripe_credentials) {
      try {
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
          'create-debt-payment-checkout',
          { 
            body: { 
              debt_id: debt.id,
              success_url: `${baseUrl}/pago-exitoso?debt_id=${debt.id}`,
              cancel_url: `${baseUrl}/pagar/${debt.access_token}`,
            }
          }
        );
        
        if (!checkoutError && checkoutData?.url) {
          stripeCheckoutUrl = checkoutData.url;
        }
      } catch (e) {
        console.error('[send-payment-reminder] Error creating Stripe checkout:', e);
      }
    }

    // Generate bono purchase link if needed
    let bonoPurchaseUrl = '';
    if (include_bono_option) {
      bonoPurchaseUrl = `${baseUrl}/pagar/${debt.access_token}?bono=1`;
    }

    // Format session date
    const sessionDate = debt.sessions?.session_date 
      ? new Date(debt.sessions.session_date).toLocaleDateString('es-ES', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        })
      : debt.due_date 
        ? new Date(debt.due_date).toLocaleDateString('es-ES', { 
            day: 'numeric', 
            month: 'long', 
            year: 'numeric' 
          })
        : 'N/A';

    // Default templates for fallback
    const defaults = {
      email: {
        subject: `Recordatorio de pago pendiente - ${center.name}`,
        initial: `Hola ${debt.patients.first_name},\n\nTe recordamos que tienes un pago pendiente de ${pendingAmount.toFixed(2)}€ correspondiente a tu sesión del ${sessionDate}.`,
        payment_intro: 'Puedes realizar el pago por las siguientes opciones:',
        footer: `Gracias por tu confianza,\n${center.name}`,
        payment_option_stripe: '💳 Pagar con tarjeta: {link_pago_stripe}',
        payment_option_bizum: '📱 Bizum al número {bizum_numero}',
        payment_option_bono: '🎫 Adquirir un bono: {link_comprar_bono}',
      },
      whatsapp: {
        message: `Hola ${debt.patients.first_name}, te recordamos un pago pendiente de ${pendingAmount.toFixed(2)}€ de tu sesión del ${sessionDate}.\n\nGracias, ${center.name}`,
        payment_option_stripe: '💳 Pagar por tarjeta: {link_pago_stripe}',
        payment_option_bizum: '📱 Bizum al {bizum_numero}',
        payment_option_bono: '🎫 ¿Prefieres un bono? {link_comprar_bono}',
      },
      sms: {
        message: `Pago pendiente de ${pendingAmount.toFixed(2)}€. ${center.name}`,
        payment_option_stripe: 'Pagar: {link_pago_stripe}',
        payment_option_bizum: 'Bizum: {bizum_numero}',
        payment_option_bono: 'Bono: {link_comprar_bono}',
      },
    };

    // Helper function to replace variables in a string
    const replaceVariables = (text: string): string => {
      return text
        .replace(/{nombre_paciente}/g, debt.patients.first_name)
        .replace(/{centro_nombre}/g, center.name)
        .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2))
        .replace(/{importe_total}/g, Number(debt.amount).toFixed(2))
        .replace(/{fecha_sesion}/g, sessionDate)
        .replace(/{bizum_numero}/g, bizumNumber)
        .replace(/{link_pago_stripe}/g, stripeCheckoutUrl || '[No disponible]')
        .replace(/{link_comprar_bono}/g, bonoPurchaseUrl || '[No disponible]');
    };

    // Build payment options array from template or defaults
    const getPaymentLines = (channelDefaults: typeof defaults.email | typeof defaults.whatsapp | typeof defaults.sms): string[] => {
      const lines: string[] = [];
      
      if (include_stripe_link && stripeCheckoutUrl) {
        const stripeText = template?.payment_option_stripe || channelDefaults.payment_option_stripe || '';
        if (stripeText) lines.push(replaceVariables(stripeText));
      }
      if (include_bizum) {
        const bizumText = template?.payment_option_bizum || channelDefaults.payment_option_bizum || '';
        if (bizumText) lines.push(replaceVariables(bizumText));
      }
      if (include_bono_option && bonoPurchaseUrl) {
        const bonoText = template?.payment_option_bono || channelDefaults.payment_option_bono || '';
        if (bonoText) lines.push(replaceVariables(bonoText));
      }
      
      return lines;
    };

    let message = '';
    let subject = '';

    if (channel === 'email') {
      // Build email
      subject = replaceVariables(template?.email_subject || defaults.email.subject);
      
      const initialText = replaceVariables(template?.email_initial_text || defaults.email.initial);
      const paymentIntro = replaceVariables(template?.email_payment_text || defaults.email.payment_intro);
      const footerText = replaceVariables(template?.email_footer || defaults.email.footer);
      const paymentLines = getPaymentLines(defaults.email);
      
      const parts = [initialText];
      if (paymentLines.length > 0) {
        parts.push(paymentIntro + '\n' + paymentLines.join('\n'));
      }
      if (footerText) parts.push(footerText);
      
      message = parts.filter(Boolean).join('\n\n');

    } else if (channel === 'whatsapp') {
      // Build WhatsApp message
      const baseMessage = replaceVariables(template?.whatsapp_message || defaults.whatsapp.message);
      const paymentLines = getPaymentLines(defaults.whatsapp);
      
      message = baseMessage;
      if (paymentLines.length > 0) {
        message += '\n\n' + paymentLines.join('\n');
      }

    } else {
      // Build SMS message
      const baseMessage = replaceVariables(template?.sms_message || defaults.sms.message);
      const paymentLines = getPaymentLines(defaults.sms);
      
      message = baseMessage;
      if (paymentLines.length > 0) {
        message += ' ' + paymentLines.join(' ');
      }
    }

    // Determine recipient
    const recipient = channel === 'email' ? debt.patients.email : debt.patients.phone;

    if (!recipient) {
      return new Response(
        JSON.stringify({ error: `El paciente no tiene ${channel === 'email' ? 'email' : 'teléfono'} registrado` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create notification record
    const { data: notification, error: notifError } = await supabase
      .from('notifications')
      .insert({
        center_id: center.id,
        patient_id: debt.patients.id,
        session_id: debt.session_id,
        type: channel,
        recipient,
        subject: channel === 'email' ? subject : null,
        message,
        status: 'pending',
      })
      .select()
      .single();

    if (notifError) {
      console.error('[send-payment-reminder] Error creating notification:', notifError);
      return new Response(
        JSON.stringify({ error: 'Error al crear notificación' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send the notification
    const { data: sendResult, error: sendError } = await supabase.functions.invoke(
      'send-notification',
      { body: { notificationId: notification.id } }
    );

    if (sendError) {
      console.error('[send-payment-reminder] Error sending notification:', sendError);
    }

    console.log(`[send-payment-reminder] Notification sent:`, sendResult);

    return new Response(
      JSON.stringify({
        success: true,
        notificationId: notification.id,
        whatsappWebLink: sendResult?.results?.[0]?.whatsappWebLink || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[send-payment-reminder] Error:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
