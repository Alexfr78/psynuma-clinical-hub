import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  buildConnectedCheckoutIdempotencyKey,
  createConnectedCheckoutSession,
  selectPaymentProfessionalId,
} from "../_shared/stripeConnectedCheckout.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

interface CheckoutRequest {
  debt_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { debt_id } = await req.json() as CheckoutRequest;

    if (!debt_id) {
      return new Response(
        JSON.stringify({ error: 'debt_id es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Stripe no está configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get debt with patient info
    const { data: debt, error: debtError } = await supabase
      .from('debts')
      .select(`
        *,
        patients (id, first_name, last_name, email, assigned_professional_id),
        sessions (id, session_date, session_type, professional_id)
      `)
      .eq('id', debt_id)
      .single();

    if (debtError || !debt) {
      console.error('Error fetching debt:', debtError);
      return new Response(
        JSON.stringify({ error: 'Deuda no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get center info with public_domain
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id, name, public_domain, portal_default_professional_id')
      .eq('id', debt.center_id)
      .single();

    if (centerError || !center) {
      return new Response(
        JSON.stringify({ error: 'Centro no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate pending amount
    const pendingAmount = Number(debt.amount) - Number(debt.paid_amount);
    const amountInCents = Math.round(pendingAmount * 100);
    if (amountInCents <= 0) {
      return new Response(
        JSON.stringify({ error: 'La deuda no tiene importe pendiente' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const professionalId = selectPaymentProfessionalId(
      debt.sessions?.professional_id,
      debt.patients?.assigned_professional_id,
      center.portal_default_professional_id,
    );
    if (!professionalId) {
      return new Response(
        JSON.stringify({ error: 'No hay profesional asignado para recibir el pago' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: connection } = await supabase
      .from('oauth_connections')
      .select('stripe_account_id, stripe_account_status')
      .eq('professional_id', professionalId)
      .eq('provider', 'stripe')
      .maybeSingle();
    if (!connection?.stripe_account_id || connection.stripe_account_status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'El profesional no tiene una cuenta Stripe activa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format description
    const sessionInfo = debt.sessions 
      ? `Sesión ${debt.sessions.session_type || 'de terapia'} - ${new Date(debt.sessions.session_date).toLocaleDateString('es-ES')}`
      : 'Pago de sesión pendiente';

    // Generate URLs using center's public domain
    const baseUrl = center.public_domain 
      ? `https://${center.public_domain}` 
      : (() => {
      const v = Deno.env.get('APP_BASE_URL');
      if (!v) throw new Error('APP_BASE_URL not configured');
      return v;
    })();
    const defaultSuccessUrl = `${baseUrl}/pago-exitoso?debt_id=${debt_id}`;
    const defaultCancelUrl = `${baseUrl}/pagar/${debt.access_token}`;

    // Create Stripe Checkout Session
    const feeBpsRaw = Deno.env.get('STRIPE_APPLICATION_FEE_BPS');
    const checkoutSession = await createConnectedCheckoutSession({
      stripeSecretKey,
      connectedAccountId: connection.stripe_account_id,
      customerEmail: debt.patients?.email,
      lineItem: {
        name: sessionInfo,
        description: `Pago a ${center.name}`,
        amountInCents,
      },
      metadata: {
        debt_id: debt.id,
        patient_id: debt.patient_id,
        center_id: debt.center_id,
        session_id: debt.session_id || '',
        professional_id: professionalId,
        payment_type: 'debt_payment',
      },
      successUrl: defaultSuccessUrl,
      cancelUrl: defaultCancelUrl,
      applicationFeeBpsRaw: feeBpsRaw,
      idempotencyKey: buildConnectedCheckoutIdempotencyKey(
        'debt', debt.id, amountInCents, feeBpsRaw,
      ),
    });

    console.log('Checkout session created:', checkoutSession.id);

    // Update debt with checkout session ID
    await supabase
      .from('debts')
      .update({
        stripe_checkout_session_id: checkoutSession.id,
        stripe_payment_status: 'pending',
      })
      .eq('id', debt_id);

    return new Response(
      JSON.stringify({
        url: checkoutSession.url,
        session_id: checkoutSession.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
