import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { sendAdminAlert, buildAlertMessage } from "../_shared/adminAlerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    
    console.log('Stripe webhook received, signature present:', !!signature);

    // For now, we'll process without signature verification
    // In production, you should verify the signature using STRIPE_WEBHOOK_SECRET
    
    let event;
    try {
      event = JSON.parse(body);
    } catch (err) {
      console.error('Invalid JSON:', err);
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Webhook event type:', event.type);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const sessionId = session.metadata?.session_id;
        
        if (!sessionId) {
          console.log('No session_id in metadata, skipping');
          break;
        }

        console.log('Processing completed checkout for session:', sessionId);

        // Update session payment status
        const { error: updateError } = await supabase
          .from('sessions')
          .update({
            stripe_payment_status: 'paid',
            status: 'confirmed',
          })
          .eq('id', sessionId);

        if (updateError) {
          console.error('Error updating session:', updateError);
        } else {
          console.log('Session updated to paid and confirmed');
        }

        // Get session details for payment record
        const { data: sessionData } = await supabase
          .from('sessions')
          .select('patient_id, price, center_id')
          .eq('id', sessionId)
          .single();

        if (sessionData) {
          // Get more session details for alert
          const { data: fullSession } = await supabase
            .from('sessions')
            .select('session_date, start_time, professional_id')
            .eq('id', sessionId)
            .single();

          // Get patient info
          const { data: patientData } = await supabase
            .from('patients')
            .select('first_name, last_name, email')
            .eq('id', sessionData.patient_id)
            .single();

          // Create payment record
          const { error: paymentError } = await supabase
            .from('payments')
            .insert({
              patient_id: sessionData.patient_id,
              center_id: sessionData.center_id,
              session_id: sessionId,
              amount: sessionData.price,
              payment_method: 'stripe',
              payment_date: new Date().toISOString().split('T')[0],
              reference: session.payment_intent,
              notes: `Pago online - Stripe Checkout ${session.id}`,
            });

          if (paymentError) {
            console.error('Error creating payment record:', paymentError);
          } else {
            console.log('Payment record created');
          }

          // Update or create debt record as paid
          const { data: existingDebt } = await supabase
            .from('debts')
            .select('id')
            .eq('session_id', sessionId)
            .maybeSingle();

          if (existingDebt) {
            await supabase
              .from('debts')
              .update({
                status: 'paid',
                paid_amount: sessionData.price,
              })
              .eq('id', existingDebt.id);
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object;
        const sessionId = session.metadata?.session_id;
        
        if (sessionId) {
          console.log('Checkout expired for session:', sessionId);
          await supabase
            .from('sessions')
            .update({
              stripe_payment_status: 'expired',
            })
            .eq('id', sessionId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const sessionId = paymentIntent.metadata?.session_id;
        
        if (sessionId) {
          console.log('Payment failed for session:', sessionId);
          await supabase
            .from('sessions')
            .update({
              stripe_payment_status: 'failed',
            })
            .eq('id', sessionId);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;
        console.log('Refund processed for charge:', charge.id);
        // Could update payment/debt status to refunded
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
