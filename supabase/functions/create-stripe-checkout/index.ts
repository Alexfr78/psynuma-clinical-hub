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
    const { session_id } = await req.json();

    console.log('Creating Stripe checkout for session:', session_id);

    if (!session_id) {
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
    const authorization = req.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const isServiceCall = authorization === `Bearer ${supabaseKey}`;
    let userId: string | null = null;

    if (!isServiceCall) {
      const userClient = createClient(
        supabaseUrl,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authorization } } },
      );
      const { data: authData, error: authError } = await userClient.auth.getUser();
      if (authError || !authData.user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      userId = authData.user.id;
    }

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(`
        id, center_id, professional_id, patient_id, price, session_type,
        session_date, access_token, status,
        patient:patients(email, first_name, last_name)
      `)
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isServiceCall && userId) {
      const [{ data: profile }, { data: roleRows }] = await Promise.all([
        supabase.from('profiles').select('id, center_id').eq('id', userId).single(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      const isAdmin = (roleRows || []).some((row: { role: string }) => row.role === 'admin');
      const ownsSession = profile?.id === session.professional_id;
      if (!profile || profile.center_id !== session.center_id || (!isAdmin && !ownsSession)) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for this session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const amount = Number(session.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0 || session.status === 'cancelled') {
      return new Response(
        JSON.stringify({ error: 'Session is not payable' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const patient = Array.isArray(session.patient) ? session.patient[0] : session.patient;

    // Get professional's Stripe account
    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('stripe_account_id, stripe_account_status')
      .eq('professional_id', session.professional_id)
      .eq('provider', 'stripe')
      .maybeSingle();

    if (!connection?.stripe_account_id || connection.stripe_account_status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Stripe account not active' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl = Deno.env.get('APP_BASE_URL') || Deno.env.get('SITE_URL') || 'https://psycma.lovable.app';
    const successUrl = session.access_token
      ? `${siteUrl}/cita/${session.access_token}?pago=ok`
      : `${siteUrl}/pago-exitoso?session_id=${session.id}`;
    const cancelUrl = session.access_token
      ? `${siteUrl}/cita/${session.access_token}?pago=cancelado`
      : `${siteUrl}/agenda`;
    
    // Create checkout session on connected account
    const checkoutParams = new URLSearchParams({
      'mode': 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': 'eur',
      'line_items[0][price_data][unit_amount]': String(Math.round(amount * 100)),
      'line_items[0][price_data][product_data][name]': `Sesión de ${session.session_type || 'psicología'}`,
      'line_items[0][price_data][product_data][description]': `Sesión del ${session.session_date}`,
      'line_items[0][quantity]': '1',
      'success_url': successUrl,
      'cancel_url': cancelUrl,
      'metadata[session_id]': session.id,
      'metadata[patient_id]': session.patient_id,
      'metadata[professional_id]': session.professional_id,
    });

    if (patient?.email) {
      checkoutParams.append('customer_email', patient.email);
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
        'Idempotency-Key': `session-checkout-${session.id}-${Math.round(amount * 100)}`,
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
      .eq('id', session.id);

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
