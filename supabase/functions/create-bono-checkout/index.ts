import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  buildConnectedCheckoutIdempotencyKey,
  createConnectedCheckoutSession,
  selectPaymentProfessionalId,
} from "../_shared/stripeConnectedCheckout.ts";
import { assertStripeEnvironment } from "../_shared/stripeEnvironment.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');

interface CheckoutRequest {
  debt_id?: string;
  session_access_token?: string;
  bono_template_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { debt_id, session_access_token, bono_template_id } = await req.json() as CheckoutRequest;

    if ((!debt_id && !session_access_token) || !bono_template_id) {
      return new Response(
        JSON.stringify({ error: 'bono_template_id y (debt_id o session_access_token) son requeridos' }),
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

    // Resolve a common context (patient/center/session/professional) from
    // either an existing debt link or a public session link, so a bono can
    // be bought directly from the appointment reminder without a debt.
    let debtId: string | null = null;
    let centerId: string;
    let patientId: string;
    let patientEmail: string | null | undefined;
    let sessionId: string | null;
    let sessionProfessionalId: string | null;
    let assignedProfessionalId: string | null;
    let debtAccessToken: string | null = null;

    if (debt_id) {
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

      debtId = debt.id;
      centerId = debt.center_id;
      patientId = debt.patient_id;
      patientEmail = debt.patients?.email;
      sessionId = debt.session_id || null;
      sessionProfessionalId = debt.sessions?.professional_id || null;
      assignedProfessionalId = debt.patients?.assigned_professional_id || null;
      debtAccessToken = debt.access_token;
    } else {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select(`
          id, center_id, patient_id, professional_id, status, payment_status, stripe_payment_status,
          patients (id, email, assigned_professional_id)
        `)
        .eq('access_token', session_access_token!)
        .single();

      if (sessionError || !session) {
        console.error('Error fetching session:', sessionError);
        return new Response(
          JSON.stringify({ error: 'Cita no encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (
        session.status === 'cancelled'
        || ['paid', 'bono'].includes((session.payment_status || '').toLowerCase())
        || session.stripe_payment_status === 'paid'
      ) {
        return new Response(
          JSON.stringify({ error: 'Esta cita ya no admite compra de bono' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Supabase's untyped client infers this embed's cardinality as an array;
      // it's actually a single row (sessions.patient_id -> patients.id is many-to-one).
      // Normalize defensively, matching the pattern used in create-stripe-checkout.
      const sessionPatient = Array.isArray(session.patients) ? session.patients[0] : session.patients;

      centerId = session.center_id;
      patientId = session.patient_id;
      patientEmail = sessionPatient?.email;
      sessionId = session.id;
      sessionProfessionalId = session.professional_id;
      assignedProfessionalId = sessionPatient?.assigned_professional_id || null;
    }

    // Get bono template
    const { data: bonoTemplate, error: templateError } = await supabase
      .from('bono_templates')
      .select('*')
      .eq('id', bono_template_id)
      .eq('center_id', centerId)
      .eq('is_active', true)
      .eq('is_public', true)
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
      .select('id, name, public_domain, portal_default_professional_id')
      .eq('id', centerId)
      .single();

    if (centerError || !center) {
      return new Response(
        JSON.stringify({ error: 'Centro no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve the patient's actual price (custom price > tariff plan > base),
    // matching what the payment page displays — never charge the generic
    // template price for a patient with a special rate.
    const { data: resolvedPrice, error: resolvedPriceError } = await supabase
      .rpc('resolve_effective_price', {
        p_patient_id: patientId,
        p_target_type: 'bono_template',
        p_target_id: bono_template_id,
      });
    if (resolvedPriceError) {
      console.error('Error resolving bono price:', resolvedPriceError);
    }
    const effectivePrice = Number(resolvedPrice?.applied_price ?? bonoTemplate.total_price);

    const amountInCents = Math.round(effectivePrice * 100);
    if (amountInCents <= 0) {
      return new Response(
        JSON.stringify({ error: 'El bono no tiene un importe válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    assertStripeEnvironment(stripeSecretKey);

    const professionalId = selectPaymentProfessionalId(
      sessionProfessionalId,
      assignedProfessionalId,
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

    // Generate URLs using center's public domain
    const baseUrl = center.public_domain 
      ? `https://${center.public_domain}` 
      : (() => {
      const v = Deno.env.get('APP_BASE_URL');
      if (!v) throw new Error('APP_BASE_URL not configured');
      return v;
    })();
    const defaultSuccessUrl = debtId
      ? `${baseUrl}/pago-exitoso?bono=1&debt_id=${debtId}`
      : `${baseUrl}/cita/${session_access_token}?pago=ok`;
    const defaultCancelUrl = debtId
      ? `${baseUrl}/pagar/${debtAccessToken}?bono=1`
      : `${baseUrl}/cita/${session_access_token}?pago=cancelado`;

    // Create Stripe Checkout Session
    const feeBpsRaw = Deno.env.get('STRIPE_APPLICATION_FEE_BPS');
    const checkoutSession = await createConnectedCheckoutSession({
      stripeSecretKey,
      connectedAccountId: connection.stripe_account_id,
      customerEmail: patientEmail,
      lineItem: {
        name: bonoTemplate.name,
        description: `${bonoTemplate.total_sessions} sesiones en ${center.name}`,
        amountInCents,
      },
      metadata: {
        payment_type: 'bono_purchase',
        debt_id: debtId || '',
        patient_id: patientId,
        center_id: centerId,
        session_id: sessionId || '',
        professional_id: professionalId,
        bono_template_id: bono_template_id,
        bono_name: bonoTemplate.name,
        bono_total_sessions: bonoTemplate.total_sessions.toString(),
        bono_price_per_session: (effectivePrice / bonoTemplate.total_sessions).toString(),
        bono_total_price: effectivePrice.toString(),
        bono_validity_days: (bonoTemplate.validity_days || 365).toString(),
      },
      successUrl: defaultSuccessUrl,
      cancelUrl: defaultCancelUrl,
      applicationFeeBpsRaw: feeBpsRaw,
      idempotencyKey: buildConnectedCheckoutIdempotencyKey(
        'bono', `${debtId || sessionId}-${bonoTemplate.id}`, amountInCents, feeBpsRaw,
      ),
    });

    console.log('Bono checkout session created:', checkoutSession.id);

    if (debtId) {
      await supabase
        .from('debts')
        .update({
          stripe_checkout_session_id: checkoutSession.id,
          stripe_payment_status: 'pending',
        })
        .eq('id', debtId);
    }

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
