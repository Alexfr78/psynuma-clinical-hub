import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.9.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

interface CheckoutRequest {
  debt_id: string;
  bono_template_id: string;
  success_url?: string;
  cancel_url?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { debt_id, bono_template_id, success_url, cancel_url } = await req.json() as CheckoutRequest;

    if (!debt_id || !bono_template_id) {
      return new Response(
        JSON.stringify({ error: 'debt_id y bono_template_id son requeridos' }),
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
        patients (id, first_name, last_name, email),
        sessions (id, session_date, session_type)
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

    // Get bono template
    const { data: bonoTemplate, error: templateError } = await supabase
      .from('bono_templates')
      .select('*')
      .eq('id', bono_template_id)
      .eq('is_active', true)
      .single();

    if (templateError || !bonoTemplate) {
      console.error('Error fetching bono template:', templateError);
      return new Response(
        JSON.stringify({ error: 'Plantilla de bono no encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get center info with public_domain
    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id, name, public_domain')
      .eq('id', debt.center_id)
      .single();

    if (centerError || !center) {
      return new Response(
        JSON.stringify({ error: 'Centro no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    const amountInCents = Math.round(Number(bonoTemplate.total_price) * 100);

    // Generate URLs using center's public domain
    const baseUrl = center.public_domain 
      ? `https://${center.public_domain}` 
      : (() => {
      const v = Deno.env.get('APP_BASE_URL');
      if (!v) throw new Error('APP_BASE_URL not configured');
      return v;
    })();
    const defaultSuccessUrl = `${baseUrl}/pago-exitoso?bono=1&debt_id=${debt_id}`;
    const defaultCancelUrl = `${baseUrl}/pagar/${debt.access_token}?bono=1`;

    // Create Stripe Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: debt.patients?.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: bonoTemplate.name,
              description: `${bonoTemplate.total_sessions} sesiones en ${center.name}`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: 'bono_purchase',
        debt_id: debt.id,
        patient_id: debt.patient_id,
        center_id: debt.center_id,
        session_id: debt.session_id || '',
        bono_template_id: bono_template_id,
        bono_name: bonoTemplate.name,
        bono_total_sessions: bonoTemplate.total_sessions.toString(),
        bono_price_per_session: bonoTemplate.price_per_session.toString(),
        bono_total_price: bonoTemplate.total_price.toString(),
        bono_validity_days: (bonoTemplate.validity_days || 365).toString(),
      },
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl,
    });

    console.log('Bono checkout session created:', checkoutSession.id);

    return new Response(
      JSON.stringify({
        url: checkoutSession.url,
        session_id: checkoutSession.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error creating bono checkout session:', error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
