import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.9.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Initialize Stripe with the secret key
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

interface Center {
  id: string;
  invoice_on_payment_mode: string | null;
  invoice_send_channel: string | null;
  verifactu_auto_enabled: boolean | null;
  verifactu_certificate_base64: string | null;
  default_tax_rate: number | null;
}

interface InvoiceSeries {
  id: string;
  name: string;
  format: string;
  next_number: number;
  invoice_type: string;
  is_archived: boolean;
}

interface SessionData {
  patient_id: string;
  price: number;
  center_id: string;
  session_type: string;
  session_date: string;
}

// Helper function to create invoice and send notification
async function createAndSendInvoice(
  supabase: any,
  sessionId: string,
  sessionData: SessionData,
  center: Center
): Promise<string | null> {
  console.log('Creating auto-invoice for session:', sessionId);
  
  try {
    // 1. Get default simplified series
    const { data: seriesData, error: seriesError } = await supabase
      .from('invoice_series')
      .select('*')
      .eq('center_id', center.id)
      .eq('invoice_type', 'simplified')
      .eq('is_archived', false)
      .limit(1)
      .single();

    if (seriesError || !seriesData) {
      console.error('No invoice series found:', seriesError);
      return null;
    }

    const series = seriesData as InvoiceSeries;

    // 2. Generate invoice number
    const year = new Date().getFullYear();
    const nextNumber = series.next_number || 1;
    const paddedNumber = nextNumber.toString().padStart(5, '0');
    
    const invoiceNumber = series.format
      .replace('{SERIE}', series.name)
      .replace('{AAAA}', year.toString())
      .replace('{AA}', year.toString().slice(-2))
      .replace('{NNNNN}', paddedNumber)
      .replace('{NNNN}', nextNumber.toString().padStart(4, '0'))
      .replace('{NNN}', nextNumber.toString().padStart(3, '0'));

    // 3. Calculate totals (session is exempt from VAT by default for healthcare)
    const taxRate = center.default_tax_rate ?? 0;
    const subtotal = sessionData.price;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // 4. Create the invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        center_id: center.id,
        patient_id: sessionData.patient_id,
        series_id: series.id,
        invoice_number: invoiceNumber,
        status: 'paid',
        issue_date: new Date().toISOString().split('T')[0],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: 'Factura generada automáticamente por pago Stripe',
      })
      .select()
      .single();

    if (invoiceError || !invoiceData) {
      console.error('Error creating invoice:', invoiceError);
      return null;
    }

    const invoiceId = invoiceData.id as string;
    console.log('Invoice created:', invoiceId);

    // 5. Create invoice item
    const description = `Sesión de ${sessionData.session_type || 'terapia'} - ${sessionData.session_date}`;
    await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoiceId,
        description,
        quantity: 1,
        unit_price: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        session_id: sessionId,
      });

    // 6. Update series counter
    await supabase
      .from('invoice_series')
      .update({ next_number: nextNumber + 1 })
      .eq('id', series.id);

    // 7. Link debt to invoice
    const { data: existingDebtData } = await supabase
      .from('debts')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existingDebtData) {
      await supabase
        .from('debts')
        .update({ invoice_id: invoiceId })
        .eq('id', existingDebtData.id);
    }

    // 8. Update payments to link to invoice
    await supabase
      .from('payments')
      .update({ invoice_id: invoiceId })
      .eq('session_id', sessionId)
      .is('invoice_id', null);

    // 9. Sign with Verifactu if enabled
    if (center.verifactu_auto_enabled && center.verifactu_certificate_base64) {
      try {
        console.log('Signing invoice with Verifactu...');
        const { error: verifactuError } = await supabase.functions.invoke(
          'sign-invoice-verifactu',
          { body: { invoice_id: invoiceId } }
        );
        
        if (verifactuError) {
          console.error('Verifactu signing error:', verifactuError);
          await supabase
            .from('invoices')
            .update({ verifactu_pending: true, verifactu_retry_count: 1 })
            .eq('id', invoiceId);
        } else {
          console.log('Verifactu signed successfully');
        }
      } catch (error) {
        console.error('Verifactu error:', error);
        await supabase
          .from('invoices')
          .update({ verifactu_pending: true, verifactu_retry_count: 1 })
          .eq('id', invoiceId);
      }
    }

    // 10. Send notification based on channel setting
    const sendChannel = center.invoice_send_channel || 'email';
    
    // Get patient info for notification
    const { data: patientData } = await supabase
      .from('patients')
      .select('email, phone')
      .eq('id', sessionData.patient_id)
      .single();

    if (patientData) {
      try {
        console.log('Sending invoice notification via:', sendChannel);
        await supabase.functions.invoke('send-invoice-notification', {
          body: {
            invoice_id: invoiceId,
            patient_id: sessionData.patient_id,
            patient_email: patientData.email,
            patient_phone: patientData.phone,
            channel: sendChannel,
          }
        });
        console.log('Invoice notification sent');
      } catch (notifError) {
        console.error('Error sending invoice notification:', notifError);
        // Don't fail the flow if notification fails
      }
    }

    return invoiceId;
  } catch (error) {
    console.error('Error in createAndSendInvoice:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    
    console.log('Stripe webhook received, signature present:', !!signature);

    // SECURITY: Verify webhook signature
    if (!signature) {
      console.error('No Stripe signature provided');
      return new Response(
        JSON.stringify({ error: 'No signature provided' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Stripe not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
      console.log('Webhook signature verified successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown verification error';
      console.error('Webhook signature verification failed:', errorMessage);
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verified webhook event type:', event.type);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
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
        const { data: sessionQueryData } = await supabase
          .from('sessions')
          .select('patient_id, price, center_id, session_type, session_date')
          .eq('id', sessionId)
          .single();

        if (sessionQueryData) {
          const sessionData = sessionQueryData as SessionData;
          
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
              reference: session.payment_intent as string,
              notes: `Pago online - Stripe Checkout ${session.id}`,
            });

          if (paymentError) {
            console.error('Error creating payment record:', paymentError);
          } else {
            console.log('Payment record created');
          }

          // Update or create debt record as paid
          const { data: existingDebtData } = await supabase
            .from('debts')
            .select('id')
            .eq('session_id', sessionId)
            .maybeSingle();

          if (existingDebtData) {
            await supabase
              .from('debts')
              .update({
                status: 'paid',
                paid_amount: sessionData.price,
              })
              .eq('id', existingDebtData.id);
          }

          // Check center's invoice automation settings
          const { data: centerData } = await supabase
            .from('centers')
            .select('id, invoice_on_payment_mode, invoice_send_channel, verifactu_auto_enabled, verifactu_certificate_base64, default_tax_rate')
            .eq('id', sessionData.center_id)
            .single();

          if (centerData) {
            const center = centerData as Center;
            const invoiceMode = center.invoice_on_payment_mode || 'disabled';
            console.log('Invoice automation mode:', invoiceMode);

            // If mode is 'auto', generate and send invoice automatically
            if (invoiceMode === 'auto') {
              const invoiceId = await createAndSendInvoice(
                supabase,
                sessionId,
                sessionData,
                center
              );
              
              if (invoiceId) {
                console.log('Auto-invoice created and sent:', invoiceId);
              } else {
                console.error('Failed to create auto-invoice');
              }
            } else {
              console.log('Invoice automation not enabled (mode:', invoiceMode, ')');
            }
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
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
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
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
        const charge = event.data.object as Stripe.Charge;
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