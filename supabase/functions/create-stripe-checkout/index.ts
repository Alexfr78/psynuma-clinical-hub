import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      professional_id, 
      session_id, 
      patient_id,
      patient_email,
      patient_name,
      amount,
      session_type,
      session_date,
      success_url,
      cancel_url 
    } = await req.json();

    console.log('Creating Stripe checkout for session:', session_id);

    if (!professional_id || !session_id || !amount) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get professional's Stripe account
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('stripe_account_id, stripe_account_status')
      .eq('professional_id', professional_id)
      .eq('provider', 'stripe')
      .maybeSingle();

    if (!connection?.stripe_account_id || connection.stripe_account_status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Stripe account not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://psycma.lovable.app';
    
    // Create checkout session on connected account
    const checkoutParams = new URLSearchParams({
      'mode': 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][price_data][product_data][name]': `Sesión de ${session_type || 'psicología'}`,
      'line_items[0][price_data][product_data][description]': `Sesión del ${session_date}`,
      'line_items[0][quantity]': '1',
      'success_url': success_url || `${siteUrl}/cita/pago-completado?session_id=${session_id}`,
      'cancel_url': cancel_url || `${siteUrl}/cita/pago-cancelado?session_id=${session_id}`,
      'metadata[session_id]': session_id,
      'metadata[patient_id]': patient_id,
      'metadata[professional_id]': professional_id,
    });

    if (patient_email) {
      checkoutParams.append('customer_email', patient_email);
    }

    // Application fee (platform takes 2.5%)
    const applicationFee = Math.round(amount * 100 * 0.025);
    checkoutParams.append('payment_intent_data[application_fee_amount]', String(applicationFee));

    const checkoutResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': connection.stripe_account_id,
      },
      body: checkoutParams,
    });

    const checkoutData = await checkoutResponse.json();

    if (!checkoutResponse.ok) {
      console.error('Stripe checkout error:', checkoutData);
      return new Response(
        JSON.stringify({ error: checkoutData.error?.message || 'Checkout creation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update session with checkout info
    await supabase
      .from('sessions')
      .update({
        stripe_checkout_session_id: checkoutData.id,
        stripe_payment_status: 'pending',
      })
      .eq('id', session_id);

    console.log('Checkout session created:', checkoutData.id);

    return new Response(
      JSON.stringify({ 
        checkout_url: checkoutData.url,
        checkout_session_id: checkoutData.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating checkout:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
