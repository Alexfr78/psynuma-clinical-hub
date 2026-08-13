import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  buildConnectedCheckoutIdempotencyKey,
  createConnectedCheckoutSession,
} from "../_shared/stripeConnectedCheckout.ts";

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
      console.error('Stripe checkout rejected: authorization header missing');
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const isServiceCall = authorization === `Bearer ${supabaseKey}`;
    let userId: string | null = null;

    if (!isServiceCall) {
      const token = authorization.slice('Bearer '.length);
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user) {
        console.error('Stripe checkout rejected: bearer token is not a valid user or service credential');
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
        session_date, access_token, status, payment_status, stripe_payment_status,
        patient:patients(email, first_name, last_name)
      `)
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      console.error('Stripe checkout rejected: session not found', { session_id });
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
        console.error('Stripe checkout rejected: authenticated user cannot manage the session', { session_id });
        return new Response(
          JSON.stringify({ error: 'Not authorized for this session' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const amount = Number(session.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0 || session.status === 'cancelled') {
      console.error('Stripe checkout rejected: session is not payable', {
        session_id,
        has_positive_amount: Number.isFinite(amount) && amount > 0,
        is_cancelled: session.status === 'cancelled',
      });
      return new Response(
        JSON.stringify({ error: 'Session is not payable' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (
      session.payment_status === 'paid'
      || session.payment_status === 'bono'
      || session.stripe_payment_status === 'paid'
    ) {
      console.error('Stripe checkout rejected: session is already paid', {
        session_id,
        payment_status: session.payment_status,
        stripe_payment_status: session.stripe_payment_status,
      });
      return new Response(
        JSON.stringify({ error: 'Esta sesión ya está pagada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!session.professional_id) {
      console.error('Stripe checkout rejected: session has no professional assigned', { session_id });
      return new Response(
        JSON.stringify({ error: 'No hay profesional asignado para recibir el pago' }),
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
      console.error('Stripe checkout rejected: connected account is not active', {
        session_id,
        has_account_id: Boolean(connection?.stripe_account_id),
        account_status: connection?.stripe_account_status || null,
      });
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
    const amountInCents = Math.round(amount * 100);
    const feeBpsRaw = Deno.env.get('STRIPE_APPLICATION_FEE_BPS');
    const checkoutData = await createConnectedCheckoutSession({
      stripeSecretKey,
      connectedAccountId: connection.stripe_account_id,
      successUrl,
      cancelUrl,
      customerEmail: patient?.email,
      lineItem: {
        name: `Sesión de ${session.session_type || 'psicología'}`,
        description: `Sesión del ${session.session_date}`,
        amountInCents,
      },
      metadata: {
        payment_type: 'session_payment',
        session_id: session.id,
        patient_id: session.patient_id,
        professional_id: session.professional_id,
      },
      applicationFeeBpsRaw: feeBpsRaw,
      idempotencyKey: buildConnectedCheckoutIdempotencyKey(
        'session', session.id, amountInCents, feeBpsRaw,
      ),
    });

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
