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

// Helper function to create invoice
async function createInvoice(
  supabase: any,
  centerId: string,
  patientId: string,
  description: string,
  amount: number,
  linkedSessionId: string | null,
  linkedBonoId: string | null
): Promise<{ invoiceId: string | null; accessToken: string | null }> {
  console.log('Creating invoice for:', { centerId, patientId, amount });
  
  try {
    // Get center settings
    const { data: center } = await supabase
      .from('centers')
      .select('id, invoice_on_payment_mode, invoice_send_channel, verifactu_auto_enabled, verifactu_certificate_base64, default_tax_rate')
      .eq('id', centerId)
      .single();

    if (!center) {
      console.error('Center not found');
      return { invoiceId: null, accessToken: null };
    }

    // Get default simplified series
    const { data: seriesData, error: seriesError } = await supabase
      .from('invoice_series')
      .select('*')
      .eq('center_id', centerId)
      .eq('invoice_type', 'simplified')
      .eq('is_archived', false)
      .limit(1)
      .single();

    if (seriesError || !seriesData) {
      console.error('No invoice series found:', seriesError);
      return { invoiceId: null, accessToken: null };
    }

    const series = seriesData as InvoiceSeries;

    // Generate invoice number
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

    // Calculate totals (healthcare exempt from VAT by default)
    const taxRate = center.default_tax_rate ?? 0;
    const subtotal = amount;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // Create the invoice
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        center_id: centerId,
        patient_id: patientId,
        series_id: series.id,
        invoice_number: invoiceNumber,
        status: 'paid',
        issue_date: new Date().toISOString().split('T')[0],
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        notes: 'Factura generada automáticamente por pago online',
      })
      .select('id, access_token')
      .single();

    if (invoiceError || !invoiceData) {
      console.error('Error creating invoice:', invoiceError);
      return { invoiceId: null, accessToken: null };
    }

    console.log('Invoice created:', invoiceData.id);

    // Create invoice item
    await supabase
      .from('invoice_items')
      .insert({
        invoice_id: invoiceData.id,
        description,
        quantity: 1,
        unit_price: subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        session_id: linkedSessionId,
        bono_id: linkedBonoId,
      });

    // Update series counter
    await supabase
      .from('invoice_series')
      .update({ next_number: nextNumber + 1 })
      .eq('id', series.id);

    // Sign with Verifactu if enabled
    if (center.verifactu_auto_enabled && center.verifactu_certificate_base64) {
      try {
        console.log('Signing invoice with Verifactu...');
        const { error: verifactuError } = await supabase.functions.invoke(
          'sign-invoice-verifactu',
          { body: { invoice_id: invoiceData.id } }
        );
        
        if (verifactuError) {
          console.error('Verifactu signing error:', verifactuError);
          await supabase
            .from('invoices')
            .update({ verifactu_pending: true, verifactu_retry_count: 1 })
            .eq('id', invoiceData.id);
        }
      } catch (error) {
        console.error('Verifactu error:', error);
      }
    }

    // Send notification
    const sendChannel = center.invoice_send_channel || 'email';
    const { data: patientData } = await supabase
      .from('patients')
      .select('email, phone')
      .eq('id', patientId)
      .single();

    if (patientData) {
      try {
        console.log('Sending invoice notification via:', sendChannel);
        await supabase.functions.invoke('send-invoice-notification', {
          body: {
            invoice_id: invoiceData.id,
            patient_id: patientId,
            patient_email: patientData.email,
            patient_phone: patientData.phone,
            channel: sendChannel,
          }
        });
      } catch (notifError) {
        console.error('Error sending invoice notification:', notifError);
      }
    }

    return { invoiceId: invoiceData.id, accessToken: invoiceData.access_token };
  } catch (error) {
    console.error('Error in createInvoice:', error);
    return { invoiceId: null, accessToken: null };
  }
}

// Handle debt payment
async function handleDebtPayment(
  supabase: any,
  metadata: Record<string, string>,
  paymentAmount: number,
  stripeSessionId: string
): Promise<void> {
  const debtId = metadata.debt_id;
  const patientId = metadata.patient_id;
  const centerId = metadata.center_id;
  const sessionId = metadata.session_id || null;

  console.log('Processing debt payment:', { debtId, patientId, centerId, sessionId });

  // Update debt to paid
  await supabase
    .from('debts')
    .update({
      status: 'paid',
      paid_amount: paymentAmount,
      stripe_payment_status: 'paid',
    })
    .eq('id', debtId);

  // Create payment record
  await supabase
    .from('payments')
    .insert({
      patient_id: patientId,
      center_id: centerId,
      session_id: sessionId || null,
      amount: paymentAmount,
      payment_method: 'stripe',
      payment_date: new Date().toISOString().split('T')[0],
      reference: stripeSessionId,
      notes: 'Pago online de deuda pendiente',
    });

  // Update session if exists
  if (sessionId) {
    await supabase
      .from('sessions')
      .update({
        payment_status: 'paid',
        stripe_payment_status: 'paid',
      })
      .eq('id', sessionId);
  }

  // Get session details for invoice description
  let description = 'Pago de sesión de terapia';
  if (sessionId) {
    const { data: sessionData } = await supabase
      .from('sessions')
      .select('session_type, session_date')
      .eq('id', sessionId)
      .single();
    
    if (sessionData) {
      const date = new Date(sessionData.session_date).toLocaleDateString('es-ES');
      description = `Sesión de ${sessionData.session_type || 'terapia'} - ${date}`;
    }
  }

  // Create invoice
  const { invoiceId } = await createInvoice(
    supabase,
    centerId,
    patientId,
    description,
    paymentAmount,
    sessionId,
    null
  );

  // Link invoice to debt
  if (invoiceId) {
    await supabase
      .from('debts')
      .update({ invoice_id: invoiceId })
      .eq('id', debtId);
  }

  console.log('Debt payment processed successfully');
}

// Handle bono purchase
async function handleBonoPurchase(
  supabase: any,
  metadata: Record<string, string>,
  paymentAmount: number,
  stripeSessionId: string
): Promise<void> {
  const debtId = metadata.debt_id;
  const patientId = metadata.patient_id;
  const centerId = metadata.center_id;
  const sessionId = metadata.session_id || null;
  const bonoName = metadata.bono_name;
  const totalSessions = parseInt(metadata.bono_total_sessions);
  const pricePerSession = parseFloat(metadata.bono_price_per_session);
  const validityDays = parseInt(metadata.bono_validity_days || '365');

  console.log('Processing bono purchase:', { debtId, patientId, bonoName, totalSessions });

  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  // Create the bono
  const { data: bonoData, error: bonoError } = await supabase
    .from('bonos')
    .insert({
      center_id: centerId,
      patient_id: patientId,
      name: bonoName,
      total_sessions: totalSessions,
      used_sessions: 0,
      total_price: paymentAmount,
      price_per_session: pricePerSession,
      status: 'active',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (bonoError || !bonoData) {
    console.error('Error creating bono:', bonoError);
    throw new Error('Failed to create bono');
  }

  console.log('Bono created:', bonoData.id);

  // Create payment record for bono
  await supabase
    .from('payments')
    .insert({
      patient_id: patientId,
      center_id: centerId,
      bono_id: bonoData.id,
      amount: paymentAmount,
      payment_method: 'stripe',
      payment_date: new Date().toISOString().split('T')[0],
      reference: stripeSessionId,
      notes: `Compra de bono: ${bonoName}`,
    });

  // If there's a session associated, apply bono to it
  if (sessionId) {
    console.log('Applying bono to session:', sessionId);
    
    // Use the RPC function to apply bono
    const { error: applyError } = await supabase
      .rpc('apply_bono_to_session', {
        p_bono_id: bonoData.id,
        p_session_id: sessionId,
      });

    if (applyError) {
      console.error('Error applying bono to session:', applyError);
      // Fallback: manually update
      await supabase
        .from('bono_items')
        .insert({
          bono_id: bonoData.id,
          session_id: sessionId,
          used_at: new Date().toISOString(),
        });

      await supabase
        .from('bonos')
        .update({ used_sessions: 1 })
        .eq('id', bonoData.id);

      await supabase
        .from('sessions')
        .update({
          bono_id: bonoData.id,
          payment_status: 'bono',
        })
        .eq('id', sessionId);
    }

    // Delete or mark the original debt as paid
    await supabase
      .from('debts')
      .update({
        status: 'paid',
        paid_amount: 0, // Paid via bono, not money
        notes: `Liquidada con bono ${bonoName}`,
      })
      .eq('id', debtId);
  }

  // Create invoice for bono purchase
  const description = `${bonoName} - ${totalSessions} sesiones`;
  await createInvoice(
    supabase,
    centerId,
    patientId,
    description,
    paymentAmount,
    null,
    bonoData.id
  );

  console.log('Bono purchase processed successfully');
}

// Handle session checkout payment (existing flow)
async function handleSessionCheckout(
  supabase: any,
  metadata: Record<string, string>,
  paymentAmount: number,
  stripeSessionId: string
): Promise<void> {
  const sessionId = metadata.session_id;
  
  if (!sessionId) {
    console.log('No session_id in metadata, skipping');
    return;
  }

  console.log('Processing session checkout:', sessionId);

  // Update session payment status
  await supabase
    .from('sessions')
    .update({
      stripe_payment_status: 'paid',
      status: 'confirmed',
    })
    .eq('id', sessionId);

  // Get session details
  const { data: sessionData } = await supabase
    .from('sessions')
    .select('patient_id, price, center_id, session_type, session_date')
    .eq('id', sessionId)
    .single();

  if (!sessionData) {
    console.error('Session not found');
    return;
  }

  // Create payment record
  await supabase
    .from('payments')
    .insert({
      patient_id: sessionData.patient_id,
      center_id: sessionData.center_id,
      session_id: sessionId,
      amount: sessionData.price,
      payment_method: 'stripe',
      payment_date: new Date().toISOString().split('T')[0],
      reference: stripeSessionId,
      notes: `Pago online - Stripe Checkout`,
    });

  // Update debt if exists
  const { data: debtData } = await supabase
    .from('debts')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (debtData) {
    await supabase
      .from('debts')
      .update({
        status: 'paid',
        paid_amount: sessionData.price,
      })
      .eq('id', debtData.id);
  }

  // Check center settings for auto-invoicing
  const { data: center } = await supabase
    .from('centers')
    .select('id, invoice_on_payment_mode, invoice_send_channel, verifactu_auto_enabled, verifactu_certificate_base64, default_tax_rate')
    .eq('id', sessionData.center_id)
    .single();

  if (center && center.invoice_on_payment_mode === 'auto') {
    const date = new Date(sessionData.session_date).toLocaleDateString('es-ES');
    const description = `Sesión de ${sessionData.session_type || 'terapia'} - ${date}`;
    
    const { invoiceId } = await createInvoice(
      supabase,
      sessionData.center_id,
      sessionData.patient_id,
      description,
      sessionData.price,
      sessionId,
      null
    );

    if (invoiceId && debtData) {
      await supabase
        .from('debts')
        .update({ invoice_id: invoiceId })
        .eq('id', debtData.id);
    }
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
        const metadata = session.metadata || {};
        const paymentType = metadata.payment_type;
        const amountTotal = (session.amount_total || 0) / 100; // Convert from cents

        console.log('Checkout completed, payment_type:', paymentType);

        if (paymentType === 'debt_payment') {
          await handleDebtPayment(supabase, metadata, amountTotal, session.id);
        } else if (paymentType === 'bono_purchase') {
          await handleBonoPurchase(supabase, metadata, amountTotal, session.id);
        } else {
          // Default: session checkout (backward compatibility)
          await handleSessionCheckout(supabase, metadata, amountTotal, session.id);
        }
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const sessionId = metadata.session_id;
        const debtId = metadata.debt_id;
        
        if (sessionId) {
          console.log('Checkout expired for session:', sessionId);
          await supabase
            .from('sessions')
            .update({ stripe_payment_status: 'expired' })
            .eq('id', sessionId);
        }

        if (debtId) {
          console.log('Checkout expired for debt:', debtId);
          await supabase
            .from('debts')
            .update({ stripe_payment_status: 'expired' })
            .eq('id', debtId);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const metadata = paymentIntent.metadata || {};
        const sessionId = metadata.session_id;
        
        if (sessionId) {
          console.log('Payment failed for session:', sessionId);
          await supabase
            .from('sessions')
            .update({ stripe_payment_status: 'failed' })
            .eq('id', sessionId);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        console.log('Refund processed for charge:', charge.id);
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
