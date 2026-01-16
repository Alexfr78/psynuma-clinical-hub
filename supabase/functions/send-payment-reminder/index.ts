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

    // Get center info
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id, name, bizum_phone, oauth_stripe_credentials')
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
    
    // Generate Stripe checkout link if needed
    let stripeCheckoutUrl = '';
    if (include_stripe_link && center.oauth_stripe_credentials) {
      try {
        // Create Stripe checkout session for debt payment
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
          'create-debt-payment-checkout',
          { 
            body: { 
              debt_id: debt.id,
              success_url: `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/pago-exitoso?debt_id=${debt.id}`,
              cancel_url: `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/pagar/${debt.access_token}`,
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
      bonoPurchaseUrl = `${Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.lovable.app')}/pagar/${debt.access_token}?bono=1`;
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

    // Build message based on template and channel
    let message = '';
    let subject = '';

    // Default templates
    const defaults: Record<string, Record<string, string>> = {
      email: {
        subject: `Recordatorio de pago pendiente - ${center.name}`,
        initial: `Hola ${debt.patients.first_name},\n\nTe recordamos que tienes un pago pendiente de ${pendingAmount.toFixed(2)}€ correspondiente a tu sesión del ${sessionDate}.`,
        payment: '',
        footer: `Gracias por tu confianza,\n${center.name}`,
      },
      whatsapp: {
        message: `Hola ${debt.patients.first_name}, te recordamos un pago pendiente de ${pendingAmount.toFixed(2)}€ de tu sesión del ${sessionDate}.`,
      },
      sms: {
        message: `Pago pendiente de ${pendingAmount.toFixed(2)}€. ${center.name}`,
      },
    };

    // Build payment options text
    const paymentOptions: string[] = [];
    if (include_stripe_link && stripeCheckoutUrl) {
      paymentOptions.push(`💳 Pagar por tarjeta: ${stripeCheckoutUrl}`);
    }
    if (include_bizum) {
      paymentOptions.push(`📱 Bizum al ${bizumNumber}`);
    }
    if (include_bono_option && bonoPurchaseUrl) {
      paymentOptions.push(`🎫 ¿Prefieres un bono? ${bonoPurchaseUrl}`);
    }

    if (channel === 'email') {
      subject = template?.email_subject || defaults.email.subject;
      subject = subject
        .replace(/{centro_nombre}/g, center.name)
        .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2));

      const initialText = (template?.email_initial_text || defaults.email.initial)
        .replace(/{nombre_paciente}/g, debt.patients.first_name)
        .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2))
        .replace(/{importe_total}/g, Number(debt.amount).toFixed(2))
        .replace(/{fecha_sesion}/g, sessionDate)
        .replace(/{centro_nombre}/g, center.name);

      let paymentText = template?.email_payment_text || defaults.email.payment;
      if (paymentOptions.length > 0) {
        paymentText = paymentOptions.join('\n');
      }
      paymentText = paymentText
        .replace(/{bizum_numero}/g, bizumNumber)
        .replace(/{link_pago_stripe}/g, stripeCheckoutUrl || '[No disponible]')
        .replace(/{link_comprar_bono}/g, bonoPurchaseUrl || '[No disponible]');

      const footerText = (template?.email_footer || defaults.email.footer)
        .replace(/{centro_nombre}/g, center.name);

      message = [initialText, paymentText, footerText].filter(Boolean).join('\n\n');

    } else if (channel === 'whatsapp') {
      message = template?.whatsapp_message || defaults.whatsapp.message;
      
      // Add payment options
      if (paymentOptions.length > 0) {
        message += '\n\n' + paymentOptions.join('\n');
      }
      message += `\n\nGracias, ${center.name}`;

      message = message
        .replace(/{nombre_paciente}/g, debt.patients.first_name)
        .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2))
        .replace(/{importe_total}/g, Number(debt.amount).toFixed(2))
        .replace(/{fecha_sesion}/g, sessionDate)
        .replace(/{centro_nombre}/g, center.name)
        .replace(/{bizum_numero}/g, bizumNumber)
        .replace(/{link_pago_stripe}/g, stripeCheckoutUrl || '')
        .replace(/{link_comprar_bono}/g, bonoPurchaseUrl || '');

    } else {
      message = template?.sms_message || defaults.sms.message;
      if (include_stripe_link && stripeCheckoutUrl) {
        message += ` Paga: ${stripeCheckoutUrl}`;
      }
      if (include_bizum) {
        message += ` Bizum: ${bizumNumber}`;
      }
      message = message
        .replace(/{nombre_paciente}/g, debt.patients.first_name)
        .replace(/{importe_pendiente}/g, pendingAmount.toFixed(2))
        .replace(/{centro_nombre}/g, center.name)
        .replace(/{bizum_numero}/g, bizumNumber)
        .replace(/{link_pago_stripe}/g, stripeCheckoutUrl || '');
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
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
