import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.9.0";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import {
  getStripePaymentOutcome,
  shouldReprocessClaimedStripeEvent,
} from "../_shared/stripeWebhookPolicy.ts";
import { resolveRefundMetadata } from "../_shared/stripeRefundResolution.ts";
import { calculateStripeRefundProgress } from "../_shared/stripeRefundPayment.ts";
import { getOrCreatePublicShortLink } from "../_shared/publicShortLinks.ts";
import { assertStripeEnvironment } from "../_shared/stripeEnvironment.ts";
import { createInvoice } from "../_shared/createInvoice.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-cron-secret',
};

// Initialize Stripe with the secret key
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const connectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');

// After this many failed processing attempts, surface a visible notice in
// Settings → External connections so persistent webhook failures don't stay
// hidden in logs.
const WEBHOOK_FAILURE_ALERT_THRESHOLD = 3;

interface UntrustedStripeEventReference {
  id?: unknown;
  object?: unknown;
  account?: unknown;
}

async function retrieveConnectedAccountEvent(
  body: string,
  secretKey: string,
): Promise<Stripe.Event | null> {
  let candidate: UntrustedStripeEventReference;

  try {
    candidate = JSON.parse(body) as UntrustedStripeEventReference;
  } catch {
    return null;
  }

  if (
    candidate.object !== 'event'
    || typeof candidate.id !== 'string'
    || !/^evt_[A-Za-z0-9]+$/.test(candidate.id)
    || typeof candidate.account !== 'string'
    || !/^acct_[A-Za-z0-9]+$/.test(candidate.account)
  ) {
    return null;
  }

  // A Connect event belongs to the connected account. When endpoint-signature
  // verification is unavailable, authenticate the event against Stripe's API
  // using the platform key and that account's Stripe-Account context. The
  // untrusted request body is never processed; only Stripe's response is used.
  const response = await fetch(
    `https://api.stripe.com/v1/events/${encodeURIComponent(candidate.id)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Account': candidate.account,
      },
    },
  );

  if (!response.ok) {
    console.error('Stripe API could not verify connected-account event', {
      event_id: candidate.id,
      connected_account_id: candidate.account,
      status: response.status,
    });
    return null;
  }

  const retrieved = await response.json() as Stripe.Event;
  if (retrieved.id !== candidate.id || retrieved.object !== 'event') {
    return null;
  }

  console.warn('Stripe event authenticated through API retrieval fallback', {
    event_id: retrieved.id,
    connected_account_id: candidate.account,
  });

  return retrieved;
}

async function reconcileRefundedPayment(
  supabase: SupabaseClient,
  metadata: Record<string, string>,
  charge: Stripe.Charge,
  eventCreated: number,
): Promise<{ refundedAmount: number; refundDelta: number; fullyRefunded: boolean }> {
  let checkoutSessionId: string | null = null;

  if (metadata.debt_id) {
    const { data: debt, error: debtError } = await supabase
      .from('debts')
      .select('stripe_checkout_session_id')
      .eq('id', metadata.debt_id)
      .maybeSingle();
    if (debtError) throw debtError;
    checkoutSessionId = debt?.stripe_checkout_session_id || null;
  }

  if (!checkoutSessionId && metadata.session_id) {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('stripe_checkout_session_id')
      .eq('id', metadata.session_id)
      .maybeSingle();
    if (sessionError) throw sessionError;
    checkoutSessionId = session?.stripe_checkout_session_id || null;
  }

  if (!checkoutSessionId) {
    throw new Error(`Refund ${charge.id} could not resolve its Checkout Session`);
  }

  const { data: payment, error: paymentLookupError } = await supabase
    .from('payments')
    .select('id, amount, refunded_amount')
    .eq('reference', checkoutSessionId)
    .eq('payment_method', 'stripe')
    .maybeSingle();

  if (paymentLookupError) throw paymentLookupError;
  if (!payment) {
    throw new Error(`Refund ${charge.id} could not find its local payment`);
  }

  const refundProgress = calculateStripeRefundProgress({
    paymentAmount: Number(payment.amount),
    previousRefundedAmount: Number(payment.refunded_amount || 0),
    stripeAmountRefunded: charge.amount_refunded / 100,
    chargeFullyRefunded: charge.refunded,
  });

  const { error: paymentUpdateError } = await supabase
    .from('payments')
    .update({
      status: refundProgress.fullyRefunded ? 'refunded' : 'paid',
      refunded_amount: refundProgress.refundedAmount,
      refunded_at: new Date(eventCreated * 1000).toISOString(),
      stripe_charge_id: charge.id,
    })
    .eq('id', payment.id);

  if (paymentUpdateError) throw paymentUpdateError;
  return refundProgress;
}

// Resolve which professional owns a Stripe connected account, so integration
// notices can be attributed even when a refund has no local payment to link to.
async function resolveProfessionalIdForConnectedAccount(
  supabase: SupabaseClient,
  connectedAccountId: string | null,
): Promise<string | null> {
  if (!connectedAccountId) return null;
  const { data } = await supabase
    .from('oauth_connections')
    .select('professional_id')
    .eq('stripe_account_id', connectedAccountId)
    .eq('provider', 'stripe')
    .maybeSingle();
  return data?.professional_id ?? null;
}

// Best-effort visible notice in Settings → External connections. Never let a
// logging failure mask the original webhook error.
async function logStripeIntegrationError(
  supabase: SupabaseClient,
  params: {
    professionalId: string | null;
    step: string;
    errorCode: string;
    message: string;
    raw: Record<string, unknown>;
  },
): Promise<void> {
  try {
    if (!params.professionalId) {
      console.error('integration_errors skipped (no professional_id resolved)', params);
      return;
    }
    await supabase.from('integration_errors').insert({
      professional_id: params.professionalId,
      provider: 'stripe',
      source: 'stripe-webhook',
      step: params.step,
      error_code: params.errorCode,
      message: params.message,
      raw: params.raw,
    });
  } catch (logError) {
    console.error('Failed to write integration_errors', logError);
  }
}

// Handle debt payment
async function handleDebtPayment(
  supabase: SupabaseClient,
  metadata: Record<string, string>,
  paymentAmount: number,
  stripeSessionId: string
): Promise<void> {
  const debtId = metadata.debt_id;
  const patientId = metadata.patient_id;
  const centerId = metadata.center_id;
  const sessionId = metadata.session_id || null;

  console.log('Processing debt payment:', { debtId, patientId, centerId, sessionId });

  // SECURITY: Re-validate entities from database - don't trust metadata alone
  const { data: debt, error: debtError } = await supabase
    .from('debts')
    .select('id, patient_id, center_id, session_id, amount, paid_amount, status, invoice_id, stripe_checkout_session_id')
    .eq('id', debtId)
    .single();

  if (debtError || !debt) {
    console.error('Debt not found:', debtId);
    throw new Error('Debt not found');
  }

  // SECURITY: Verify debt belongs to the claimed patient and center
  if (debt.patient_id !== patientId) {
    console.error('Patient mismatch:', { debtPatient: debt.patient_id, metadataPatient: patientId });
    throw new Error('Patient mismatch - potential fraud attempt');
  }

  if (debt.center_id !== centerId) {
    console.error('Center mismatch:', { debtCenter: debt.center_id, metadataCenter: centerId });
    throw new Error('Center mismatch - potential fraud attempt');
  }

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from('payments')
    .select('id, invoice_id')
    .eq('reference', stripeSessionId)
    .maybeSingle();
  if (existingPaymentError) throw existingPaymentError;

  if (!existingPayment) {
    // SECURITY: Checkout charges the remaining balance, not the original debt.
    const expectedAmount = Number(debt.amount) - Number(debt.paid_amount || 0);
    const amountDifference = Math.abs(paymentAmount - expectedAmount);
    if (amountDifference > 0.01) { // Allow 1 cent tolerance for rounding
      console.error('Amount mismatch:', { expected: expectedAmount, received: paymentAmount });
      throw new Error('Payment amount does not match pending debt amount');
    }
  }

  // Update debt to paid
  const { error: updateError } = await supabase
    .from('debts')
    .update({
      status: 'paid',
      paid_amount: debt.amount,
      stripe_payment_status: 'paid',
      stripe_checkout_session_id: stripeSessionId,
    })
    .eq('id', debtId);

  if (updateError) {
    console.error('Error updating debt:', updateError);
    throw new Error('Failed to update debt');
  }

  // Create the payment exactly once. If a previous attempt stopped after
  // updating the debt, the retry resumes here instead of skipping accounting.
  let paymentRecord = existingPayment;
  if (!paymentRecord) {
    const { data: insertedPayment, error: paymentError } = await supabase
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
      })
      .select('id, invoice_id')
      .single();
    if (paymentError || !insertedPayment) throw paymentError || new Error('Failed to create payment');
    paymentRecord = insertedPayment;
  }

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

  // Create invoice (solo si el centro genera factura automáticamente al pagar).
  const { data: invCenter } = await supabase
    .from('centers')
    .select('invoice_on_payment_mode')
    .eq('id', centerId)
    .maybeSingle();
  let invoiceId = debt.invoice_id || paymentRecord.invoice_id || null;
  if (!invoiceId && invCenter?.invoice_on_payment_mode === 'auto') {
    const invoiceResult = await createInvoice(
      supabase,
      centerId,
      patientId,
      description,
      paymentAmount,
      sessionId,
      null
    );
    invoiceId = invoiceResult.invoiceId;
  }

  // Link invoice to debt
  if (invoiceId) {
    await Promise.all([
      supabase.from('debts').update({ invoice_id: invoiceId }).eq('id', debtId),
      supabase.from('payments').update({ invoice_id: invoiceId }).eq('id', paymentRecord.id),
    ]);
  }

  console.log('Debt payment processed successfully');
}

// Handle bono purchase
async function handleBonoPurchase(
  supabase: SupabaseClient,
  metadata: Record<string, string>,
  paymentAmount: number,
  stripeSessionId: string
): Promise<void> {
  const debtId = metadata.debt_id;
  const patientId = metadata.patient_id;
  const centerId = metadata.center_id;
  const sessionId = metadata.session_id || null;
  const bonoName = metadata.bono_name;
  
  // SECURITY: Use Number() for stricter parsing (parseInt allows trailing chars)
  const totalSessions = Number(metadata.bono_total_sessions);
  const pricePerSession = Number(metadata.bono_price_per_session);
  const validityDays = Number(metadata.bono_validity_days || '365');

  // SECURITY: Validate parsed numbers
  if (!Number.isInteger(totalSessions) || totalSessions < 1 || totalSessions > 100) {
    console.error('Invalid totalSessions:', metadata.bono_total_sessions);
    throw new Error('Invalid bono configuration - totalSessions out of range');
  }

  if (!Number.isFinite(pricePerSession) || pricePerSession < 0 || pricePerSession > 10000) {
    console.error('Invalid pricePerSession:', metadata.bono_price_per_session);
    throw new Error('Invalid bono configuration - pricePerSession out of range');
  }

  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 3650) {
    console.error('Invalid validityDays:', metadata.bono_validity_days);
    throw new Error('Invalid bono configuration - validityDays out of range');
  }

  console.log('Processing bono purchase:', { debtId, patientId, bonoName, totalSessions });

  // SECURITY: Verify patient and center exist
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id, center_id')
    .eq('id', patientId)
    .single();

  if (patientError || !patient) {
    console.error('Patient not found:', patientId);
    throw new Error('Patient not found');
  }

  if (patient.center_id !== centerId) {
    console.error('Patient center mismatch:', { patientCenter: patient.center_id, metadataCenter: centerId });
    throw new Error('Center mismatch - potential fraud attempt');
  }

  // SECURITY: Verify expected price matches payment
  const expectedTotal = totalSessions * pricePerSession;
  const amountDifference = Math.abs(paymentAmount - expectedTotal);
  if (amountDifference > 0.01) {
    console.error('Bono amount mismatch:', { expected: expectedTotal, received: paymentAmount });
    throw new Error('Payment amount does not match bono price');
  }

  const { data: existingBono, error: existingBonoError } = await supabase
    .from('bonos')
    .select('id')
    .eq('stripe_checkout_session_id', stripeSessionId)
    .maybeSingle();
  if (existingBonoError) throw existingBonoError;

  let bonoData = existingBono;
  if (!bonoData) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);

    const { data: insertedBono, error: bonoError } = await supabase
      .from('bonos')
      .insert({
        center_id: centerId,
        patient_id: patientId,
        template_id: metadata.bono_template_id || null,
        name: bonoName,
        total_sessions: totalSessions,
        used_sessions: 0,
        total_price: paymentAmount,
        price_per_session: pricePerSession,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        stripe_checkout_session_id: stripeSessionId,
      })
      .select('id')
      .single();

    if (bonoError || !insertedBono) {
      console.error('Error creating bono:', bonoError);
      throw new Error('Failed to create bono');
    }
    bonoData = insertedBono;
  }

  console.log('Bono ready:', bonoData.id);

  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from('payments')
    .select('id, invoice_id')
    .eq('reference', stripeSessionId)
    .maybeSingle();
  if (existingPaymentError) throw existingPaymentError;

  let paymentRecord = existingPayment;
  if (!paymentRecord) {
    const { data: insertedPayment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        patient_id: patientId,
        center_id: centerId,
        amount: paymentAmount,
        payment_method: 'stripe',
        payment_date: new Date().toISOString().split('T')[0],
        reference: stripeSessionId,
        notes: `Compra de bono: ${bonoName} (${bonoData.id})`,
      })
      .select('id, invoice_id')
      .single();
    if (paymentError || !insertedPayment) throw paymentError || new Error('Failed to create payment');
    paymentRecord = insertedPayment;
  }

  // A bono bought directly from the appointment reminder (no prior debt)
  // has no debtId to settle here.
  if (debtId) {
    await supabase
      .from('debts')
      .update({
        bono_id: bonoData.id,
        status: 'paid',
        paid_amount: 0,
        stripe_payment_status: 'paid',
        stripe_checkout_session_id: stripeSessionId,
        notes: `Liquidada con bono ${bonoName}`,
      })
      .eq('id', debtId);
  }

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
      const { data: existingItem } = await supabase
        .from('bono_items')
        .select('id')
        .eq('bono_id', bonoData.id)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (!existingItem) {
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
    }
  }

  const { data: existingInvoiceItem, error: invoiceLookupError } = await supabase
    .from('invoice_items')
    .select('invoice_id')
    .eq('bono_id', bonoData.id)
    .limit(1)
    .maybeSingle();
  if (invoiceLookupError) throw invoiceLookupError;

  let invoiceId = existingInvoiceItem?.invoice_id || paymentRecord.invoice_id || null;
  if (!invoiceId) {
    const description = `${bonoName} - ${totalSessions} sesiones`;
    const invoiceResult = await createInvoice(
      supabase,
      centerId,
      patientId,
      description,
      paymentAmount,
      null,
      bonoData.id
    );
    invoiceId = invoiceResult.invoiceId;
  }

  if (invoiceId) {
    await supabase.from('payments').update({ invoice_id: invoiceId }).eq('id', paymentRecord.id);
  }

  console.log('Bono purchase processed successfully');
}

// Handle session checkout payment (existing flow)
async function handleSessionCheckout(
  supabase: SupabaseClient,
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

  // Fetch and validate the session before applying any payment metadata.
  const { data: sessionData, error: sessionError } = await supabase
    .from('sessions')
    .select('patient_id, price, center_id, session_type, session_date, start_time, session_modality, location_id, access_token')
    .eq('id', sessionId)
    .single();

  if (sessionError || !sessionData) {
    console.error('Session not found:', sessionError);
    throw new Error('Session checkout could not find its session');
  }

  const expectedAmount = Number(sessionData.price ?? 0);
  if (!Number.isFinite(expectedAmount) || Math.abs(paymentAmount - expectedAmount) > 0.01) {
    console.error('Session checkout amount mismatch:', { expectedAmount, paymentAmount, sessionId });
    throw new Error('Session checkout amount does not match session price');
  }

  const { data: updatedSession, error: sessionUpdateError } = await supabase
    .from('sessions')
    .update({
      payment_status: 'paid',
      stripe_payment_status: 'paid',
      status: 'confirmed',
    })
    .eq('id', sessionId)
    .select('id')
    .single();

  if (sessionUpdateError || !updatedSession) {
    console.error('Failed to mark Stripe session as paid:', sessionUpdateError);
    throw new Error('Failed to mark session as paid');
  }

  // Create the payment exactly once. Retries reuse the payment already linked
  // to this Checkout Session instead of creating a duplicate.
  const { data: existingPayment, error: existingPaymentError } = await supabase
    .from('payments')
    .select('id, invoice_id')
    .eq('reference', stripeSessionId)
    .maybeSingle();

  if (existingPaymentError) {
    console.error('Failed to check existing Stripe payment:', existingPaymentError);
    throw new Error('Failed to check existing Stripe payment');
  }

  let paymentRecord = existingPayment;
  if (!paymentRecord) {
    const { data: insertedPayment, error: paymentInsertError } = await supabase
      .from('payments')
      .insert({
        patient_id: sessionData.patient_id,
        center_id: sessionData.center_id,
        session_id: sessionId,
        amount: paymentAmount,
        payment_method: 'stripe',
        payment_date: new Date().toISOString().split('T')[0],
        reference: stripeSessionId,
        notes: `Pago online - Stripe Checkout`,
      })
      .select('id, invoice_id')
      .single();

    if (paymentInsertError || !insertedPayment) {
      console.error('Failed to register Stripe payment:', paymentInsertError);
      throw new Error('Failed to register Stripe payment');
    }
    paymentRecord = insertedPayment;
  }

  // Update debt if exists. A session can end up with more than one pending
  // debt row (e.g. a stale duplicate created before the invoice dedup fix),
  // so this tolerates multiple rows instead of using .maybeSingle(), which
  // would throw and abort reconciliation after the payment was already
  // recorded above.
  const { data: sessionDebts, error: debtLookupError } = await supabase
    .from('debts')
    .select('id')
    .eq('session_id', sessionId)
    .neq('status', 'paid')
    .order('created_at', { ascending: false });

  if (debtLookupError) {
    console.error('Failed to find session debt:', debtLookupError);
    throw new Error('Failed to find session debt');
  }

  const debtData = sessionDebts && sessionDebts.length > 0 ? sessionDebts[0] : null;
  const duplicateDebtIds = sessionDebts && sessionDebts.length > 1
    ? sessionDebts.slice(1).map((d) => d.id)
    : [];

  if (duplicateDebtIds.length > 0) {
    const { error: dedupeError } = await supabase
      .from('debts')
      .delete()
      .in('id', duplicateDebtIds);
    if (dedupeError) {
      console.error('Failed to clean up duplicate session debts:', dedupeError);
    }
  }

  if (debtData) {
    const { error: debtUpdateError } = await supabase
      .from('debts')
      .update({
        status: 'paid',
        paid_amount: paymentAmount,
        stripe_payment_status: 'paid',
        stripe_checkout_session_id: stripeSessionId,
      })
      .eq('id', debtData.id);

    if (debtUpdateError) {
      console.error('Failed to reconcile session debt:', debtUpdateError);
      throw new Error('Failed to reconcile session debt');
    }
  }

  // Check center settings for auto-invoicing
  const { data: center, error: centerError } = await supabase
    .from('centers')
    .select('id, invoice_on_payment_mode, invoice_send_channel, verifactu_auto_enabled, verifactu_certificate_base64, default_tax_rate')
    .eq('id', sessionData.center_id)
    .single();

  if (centerError || !center) {
    console.error('Failed to load invoice automation settings:', centerError);
    throw new Error('Failed to load invoice automation settings');
  }

  if (center.invoice_on_payment_mode === 'auto') {
    const { data: existingInvoiceItem, error: invoiceLookupError } = await supabase
      .from('invoice_items')
      .select('invoice_id')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle();

    if (invoiceLookupError) {
      console.error('Failed to check existing session invoice:', invoiceLookupError);
      throw new Error('Failed to check existing session invoice');
    }

    const date = new Date(sessionData.session_date).toLocaleDateString('es-ES');
    const description = `Sesión de ${sessionData.session_type || 'terapia'} - ${date}`;
    
    let invoiceId = existingInvoiceItem?.invoice_id || null;

    if (!invoiceId) {
      const invoiceResult = await createInvoice(
        supabase,
        sessionData.center_id,
        sessionData.patient_id,
        description,
        paymentAmount,
        sessionId,
        null
      );
      invoiceId = invoiceResult.invoiceId;

      if (!invoiceId) {
        throw new Error('Automatic invoice creation failed');
      }
    }

    if (paymentRecord.invoice_id !== invoiceId) {
      const { error: paymentInvoiceError } = await supabase
        .from('payments')
        .update({ invoice_id: invoiceId })
        .eq('id', paymentRecord.id);

      if (paymentInvoiceError) {
        console.error('Failed to link Stripe payment to invoice:', paymentInvoiceError);
        throw new Error('Failed to link Stripe payment to invoice');
      }
    }

    if (debtData) {
      const { error: debtInvoiceError } = await supabase
        .from('debts')
        .update({ invoice_id: invoiceId })
        .eq('id', debtData.id);

      if (debtInvoiceError) {
        console.error('Failed to link session debt to invoice:', debtInvoiceError);
        throw new Error('Failed to link session debt to invoice');
      }
    }
  }

  await sendStripePaymentConfirmation(supabase, sessionId, sessionData);
}

async function sendStripePaymentConfirmation(
  supabase: SupabaseClient,
  sessionId: string,
  sessionData: {
    patient_id: string;
    center_id: string;
    session_type: string | null;
    session_date: string;
    start_time: string;
    session_modality: string | null;
    location_id: string | null;
    access_token: string | null;
  },
): Promise<void> {
  const claimedAt = new Date().toISOString();
  const { data: claimedSession, error: claimError } = await supabase
    .from('sessions')
    .update({ stripe_payment_confirmation_sent_at: claimedAt })
    .eq('id', sessionId)
    .is('stripe_payment_confirmation_sent_at', null)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('Failed to claim Stripe payment confirmation:', claimError);
    throw new Error('Failed to claim Stripe payment confirmation');
  }

  // A prior webhook/reconciliation already queued the confirmation.
  if (!claimedSession) return;

  let locationName: string | undefined;
  if (sessionData.location_id) {
    const { data: location, error: locationError } = await supabase
      .from('center_locations')
      .select('name')
      .eq('id', sessionData.location_id)
      .maybeSingle();

    if (locationError) {
      console.warn('Could not load location for Stripe confirmation:', locationError);
    } else {
      locationName = location?.name || undefined;
    }
  }

  const shortSessionPath = sessionData.access_token
    ? await getOrCreatePublicShortLink({
        supabase,
        centerId: sessionData.center_id,
        targetType: "session",
        targetToken: sessionData.access_token,
        expiresAt: null,
      })
    : null;

  const queued = await queueAndSendPatientBookingNotification({
    supabase,
    centerId: sessionData.center_id,
    patientId: sessionData.patient_id,
    sessionId,
    eventType: 'created',
    sessionDate: sessionData.session_date,
    startTime: sessionData.start_time,
    sessionType: sessionData.session_type || undefined,
    sessionModality: sessionData.session_modality || undefined,
    locationName,
    manageUrl: shortSessionPath || (sessionData.access_token ? `/cita/${sessionData.access_token}` : undefined),
    includeAdvancePaymentBlock: false,
  });

  if (queued) return;

  // Release the claim so a Stripe retry or reconciliation can try again.
  const { error: releaseError } = await supabase
    .from('sessions')
    .update({ stripe_payment_confirmation_sent_at: null })
    .eq('id', sessionId)
    .eq('stripe_payment_confirmation_sent_at', claimedAt);

  if (releaseError) {
    console.error('Failed to release Stripe confirmation claim:', releaseError);
  }
  throw new Error('Failed to queue Stripe payment confirmation');
}

async function sessionCheckoutNeedsReconciliation(
  supabase: SupabaseClient,
  checkoutSession: Stripe.Checkout.Session,
): Promise<boolean> {
  const metadata = checkoutSession.metadata || {};
  if (metadata.payment_type === 'debt_payment' || metadata.payment_type === 'bono_purchase') {
    return false;
  }

  const sessionId = metadata.session_id;
  if (!sessionId) return false;

  const [sessionResult, paymentResult] = await Promise.all([
    supabase
      .from('sessions')
      .select('payment_status, stripe_payment_status, status, center_id')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('payments')
      .select('id, invoice_id')
      .eq('reference', checkoutSession.id)
      .maybeSingle(),
  ]);

  if (sessionResult.error) throw sessionResult.error;
  if (paymentResult.error) throw paymentResult.error;
  if (!sessionResult.data || !paymentResult.data) return true;

  const session = sessionResult.data;
  if (
    session.payment_status !== 'paid'
    || session.stripe_payment_status !== 'paid'
    || session.status !== 'confirmed'
  ) {
    return true;
  }

  const { data: center, error: centerError } = await supabase
    .from('centers')
    .select('invoice_on_payment_mode')
    .eq('id', session.center_id)
    .single();

  if (centerError || !center) throw centerError || new Error('Center not found');
  if (center.invoice_on_payment_mode !== 'auto') return false;

  const { data: invoiceItem, error: invoiceItemError } = await supabase
    .from('invoice_items')
    .select('invoice_id')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (invoiceItemError) throw invoiceItemError;
  return !invoiceItem || paymentResult.data.invoice_id !== invoiceItem.invoice_id;
}

interface PendingStripeSession {
  id: string;
  professional_id: string;
  stripe_checkout_session_id: string;
}

async function retrieveCheckoutSession(
  checkoutSessionId: string,
  connectedAccountId: string,
  secretKey: string,
): Promise<Stripe.Checkout.Session> {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(checkoutSessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Stripe-Account': connectedAccountId,
      },
    },
  );

  if (!response.ok) {
    console.error('Stripe Checkout retrieval failed during reconciliation', {
      checkout_session_id: checkoutSessionId,
      connected_account_id: connectedAccountId,
      status: response.status,
    });
    throw new Error(`Stripe Checkout retrieval failed (${response.status})`);
  }

  const checkoutSession = await response.json() as Stripe.Checkout.Session;
  if (checkoutSession.id !== checkoutSessionId || checkoutSession.object !== 'checkout.session') {
    throw new Error('Stripe returned an unexpected Checkout Session');
  }
  return checkoutSession;
}

async function reconcilePendingSessionCheckouts(
  supabase: SupabaseClient,
  secretKey: string,
  requestedLimit: unknown,
): Promise<Record<string, unknown>> {
  const parsedLimit = Number(requestedLimit ?? 50);
  const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 50;

  const { data: pendingSessions, error: pendingError } = await supabase
    .from('sessions')
    .select('id, professional_id, stripe_checkout_session_id')
    .eq('stripe_payment_status', 'pending')
    .not('stripe_checkout_session_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (pendingError) throw pendingError;

  const result = {
    inspected: 0,
    reconciled: 0,
    still_pending: 0,
    skipped: 0,
    failed: 0,
    reconciled_checkout_ids: [] as string[],
  };

  for (const pending of (pendingSessions || []) as PendingStripeSession[]) {
    result.inspected += 1;
    const checkoutSessionId = pending.stripe_checkout_session_id;
    const reconciliationEventId = `reconcile:${checkoutSessionId}`;

    const keyIsTest = secretKey.startsWith('sk_test_');
    const checkoutIsTest = checkoutSessionId.startsWith('cs_test_');
    if (keyIsTest !== checkoutIsTest) {
      console.log('Stripe reconciliation skipped: Checkout mode does not match configured key', {
        session_id: pending.id,
        checkout_session_id: checkoutSessionId,
        configured_mode: keyIsTest ? 'test' : 'live',
      });
      result.skipped += 1;
      continue;
    }

    try {
      const { data: connection, error: connectionError } = await supabase
        .from('oauth_connections')
        .select('stripe_account_id, stripe_account_status')
        .eq('professional_id', pending.professional_id)
        .eq('provider', 'stripe')
        .maybeSingle();

      if (connectionError) throw connectionError;
      if (!connection?.stripe_account_id || connection.stripe_account_status !== 'active') {
        console.warn('Stripe reconciliation skipped: connected account is not active', {
          session_id: pending.id,
          checkout_session_id: checkoutSessionId,
        });
        result.skipped += 1;
        continue;
      }

      const checkoutSession = await retrieveCheckoutSession(
        checkoutSessionId,
        connection.stripe_account_id,
        secretKey,
      );

      if (checkoutSession.metadata?.session_id !== pending.id) {
        throw new Error('Checkout metadata does not match the pending session');
      }

      if (checkoutSession.status !== 'complete' || checkoutSession.payment_status !== 'paid') {
        result.still_pending += 1;
        continue;
      }

      const { data: claimed, error: claimError } = await supabase.rpc('claim_stripe_webhook_event', {
        p_event_id: reconciliationEventId,
        p_event_type: 'checkout.session.reconciled',
        p_connected_account_id: connection.stripe_account_id,
      });
      if (claimError) throw claimError;

      if (!claimed) {
        const needsReconciliation = await sessionCheckoutNeedsReconciliation(supabase, checkoutSession);
        if (!needsReconciliation) {
          result.skipped += 1;
          continue;
        }

        const { error: reopenError } = await supabase
          .from('stripe_webhook_events')
          .update({
            status: 'processing',
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('event_id', reconciliationEventId);
        if (reopenError) throw reopenError;
      }

      const amountTotal = Number(checkoutSession.amount_total ?? 0) / 100;
      await handleSessionCheckout(
        supabase,
        checkoutSession.metadata || {},
        amountTotal,
        checkoutSession.id,
      );

      const { error: completionError } = await supabase
        .from('stripe_webhook_events')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', reconciliationEventId);
      if (completionError) throw completionError;

      result.reconciled += 1;
      result.reconciled_checkout_ids.push(checkoutSessionId);
      console.log('Paid Stripe Checkout reconciled successfully', {
        session_id: pending.id,
        checkout_session_id: checkoutSessionId,
        connected_account_id: connection.stripe_account_id,
      });
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error('Stripe Checkout reconciliation failed', {
        session_id: pending.id,
        checkout_session_id: checkoutSessionId,
        message,
      });
      await supabase
        .from('stripe_webhook_events')
        .upsert({
          event_id: reconciliationEventId,
          event_type: 'checkout.session.reconciled',
          status: 'failed',
          last_error: message,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'event_id' });
    }
  }

  return result;
}

interface StripeSetupIntentResponse {
  payment_method?: string | {
    id: string;
    card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
  };
  customer?: string;
  error?: unknown;
}

// Fase 2 · Incremento 1 — guarda la tarjeta capturada en un Checkout mode=setup
// (mandato de cargos por cancelación) en patient_payment_methods. Idempotente.
async function handleCancellationMandateSetup(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  connectedAccountId: string | null,
): Promise<void> {
  const metadata = session.metadata || {};
  const patientId = metadata.patient_id;
  const centerId = metadata.center_id;
  if (!patientId || !centerId || !connectedAccountId) {
    console.error('[setup] faltan patient_id/center_id/connected account en el evento de setup', session.id);
    return;
  }

  const setupIntentId = typeof session.setup_intent === 'string'
    ? session.setup_intent
    : session.setup_intent?.id;
  if (!setupIntentId) {
    console.error('[setup] la sesión no tiene setup_intent', session.id);
    return;
  }

  // Recupera el SetupIntent en la cuenta conectada para leer el método de pago.
  const resp = await fetch(
    `https://api.stripe.com/v1/setup_intents/${setupIntentId}?expand[]=payment_method`,
    {
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Stripe-Account': connectedAccountId,
      },
    },
  );
  const si = await resp.json() as StripeSetupIntentResponse;
  if (!resp.ok || !si?.payment_method) {
    console.error('[setup] no se pudo recuperar el setup_intent', si?.error);
    return;
  }

  const pm = si.payment_method;
  const stripePaymentMethodId = typeof pm === 'string' ? pm : pm.id;
  const card = (typeof pm === 'object' && pm.card) ? pm.card : {};
  const stripeCustomerId = (typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id) || si.customer || null;

  if (!stripePaymentMethodId || !stripeCustomerId) {
    console.error('[setup] setup_intent sin payment_method/customer', session.id);
    return;
  }

  // Idempotencia: si ya guardamos este PM, no dupliques.
  const { data: existingPm } = await supabase
    .from('patient_payment_methods')
    .select('id, status')
    .eq('stripe_payment_method_id', stripePaymentMethodId)
    .maybeSingle();
  if (existingPm) {
    if (existingPm.status !== 'active') {
      await supabase
        .from('patient_payment_methods')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingPm.id);
    }
    return;
  }

  // Sustituye la tarjeta activa anterior del paciente en esta cuenta conectada.
  await supabase
    .from('patient_payment_methods')
    .update({ status: 'removed', updated_at: new Date().toISOString() })
    .eq('center_id', centerId)
    .eq('patient_id', patientId)
    .eq('connected_account_id', connectedAccountId)
    .eq('status', 'active');

  const { error: insertError } = await supabase
    .from('patient_payment_methods')
    .insert({
      center_id: centerId,
      patient_id: patientId,
      professional_id: metadata.professional_id || null,
      stripe_customer_id: stripeCustomerId,
      stripe_payment_method_id: stripePaymentMethodId,
      connected_account_id: connectedAccountId,
      brand: card.brand || null,
      last4: card.last4 || null,
      exp_month: card.exp_month || null,
      exp_year: card.exp_year || null,
      mandate_policy_version_id: metadata.policy_version_id || null,
      mandate_accepted_at: new Date().toISOString(),
      mandate_ip: metadata.mandate_ip || null,
      status: 'active',
    });
  if (insertError) {
    console.error('[setup] no se pudo guardar el método de pago', insertError);
    throw insertError;
  }
  console.log('[setup] tarjeta guardada para el paciente', patientId);

  // Si la cita se creó en 'draft' (tarjeta obligatoria), promociónala ahora que
  // la tarjeta está guardada, al estado final según la aprobación del centro.
  const sessionId = metadata.session_id;
  if (sessionId) {
    const { data: sess } = await supabase
      .from('sessions')
      .select('id, status, center_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (sess?.status === 'draft') {
      const { data: ctr } = await supabase
        .from('centers')
        .select('portal_require_approval')
        .eq('id', sess.center_id)
        .maybeSingle();
      const finalStatus = ctr?.portal_require_approval ? 'pending_approval' : 'scheduled';
      await supabase.from('sessions').update({ status: finalStatus }).eq('id', sessionId);
      console.log('[setup] cita', sessionId, 'promocionada de draft a', finalStatus);
    }
  }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let claimedEventId: string | null = null;
  let serviceClient: SupabaseClient | null = null;

  try {
    const body = await req.text();

    // Recovery endpoint for paid Checkout Sessions whose webhook was never
    // delivered. It is backend-only and processes only Stripe-confirmed paid
    // sessions through the same idempotent handler as the webhook.
    let recoveryRequest: { action?: unknown; limit?: unknown } | null = null;
    try {
      recoveryRequest = JSON.parse(body) as { action?: unknown; limit?: unknown };
    } catch {
      recoveryRequest = null;
    }

    if (recoveryRequest?.action === 'reconcile_pending') {
      const cronSecret = Deno.env.get('CRON_SECRET');
      const suppliedSecret = req.headers.get('x-cron-secret');
      if (!cronSecret || !suppliedSecret || suppliedSecret !== cronSecret) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      if (!stripeSecretKey) {
        return new Response(
          JSON.stringify({ error: 'Stripe not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const reconciliation = await reconcilePendingSessionCheckouts(
        supabase,
        stripeSecretKey,
        recoveryRequest.limit,
      );
      return new Response(
        JSON.stringify({ success: true, ...reconciliation }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    const webhookSecrets = [
      { destination: 'account', secret: webhookSecret },
      { destination: 'connect', secret: connectWebhookSecret },
    ].filter((entry): entry is { destination: string; secret: string } => Boolean(entry.secret));

    if (webhookSecrets.length === 0) {
      console.error('No Stripe webhook secret configured');
      return new Response(
        JSON.stringify({
          error: 'Webhook secret not configured',
          configured_destinations: { account: false, connect: false },
        }),
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
    try {
      assertStripeEnvironment(stripeSecretKey);
    } catch (environmentError) {
      console.error('Stripe environment mismatch:', environmentError);
      return new Response(
        JSON.stringify({ error: 'Stripe production is not configured with live credentials' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Account and Connect destinations have different signing secrets. Accept
    // only payloads signed by one of the explicitly configured destinations.
    let event: Stripe.Event | null = null;
    let verifiedDestination: string | null = null;
    for (const { destination, secret } of webhookSecrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        verifiedDestination = destination;
        break;
      } catch (verificationError) {
        console.warn(`Stripe signature did not match ${destination} destination`, {
          message: verificationError instanceof Error ? verificationError.message : String(verificationError),
        });
      }
    }

    if (!event) {
      console.error('Stripe webhook signature verification failed for every configured destination');
      event = await retrieveConnectedAccountEvent(body, stripeSecretKey);

      if (!event) {
        return new Response(
          JSON.stringify({
            error: 'Invalid signature',
            configured_destinations: {
              account: Boolean(webhookSecret),
              connect: Boolean(connectWebhookSecret),
            },
          }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      verifiedDestination = 'connect_api_retrieval';
    }

    console.log('Webhook signature verified successfully', {
      source: event.account ? 'connected_account' : 'platform_account',
      verified_destination: verifiedDestination,
    });

    console.log('Verified webhook event type:', event.type);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    serviceClient = supabase;

    const { data: claimed, error: claimError } = await supabase.rpc('claim_stripe_webhook_event', {
      p_event_id: event.id,
      p_event_type: event.type,
      p_connected_account_id: event.account || null,
    });
    if (claimError) throw claimError;
    if (!claimed) {
      const checkoutSession = event.type === 'checkout.session.completed'
        ? event.data.object as Stripe.Checkout.Session
        : null;
      const needsReconciliation = checkoutSession
        ? await sessionCheckoutNeedsReconciliation(supabase, checkoutSession)
        : false;

      if (!shouldReprocessClaimedStripeEvent(event.type, needsReconciliation)) {
        return new Response(
          JSON.stringify({ received: true, duplicate: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.warn('Reprocessing completed Stripe event with incomplete local state', {
        event_id: event.id,
        checkout_session_id: checkoutSession?.id,
      });
      const { error: reopenError } = await supabase
        .from('stripe_webhook_events')
        .update({
          status: 'processing',
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', event.id);
      if (reopenError) throw reopenError;
    }
    claimedEventId = event.id;
    const paymentOutcome = getStripePaymentOutcome(event.type);
    if (paymentOutcome) {
      console.log('Stripe payment outcome:', paymentOutcome);
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const paymentType = metadata.payment_type;
        const amountTotal = (session.amount_total || 0) / 100; // Convert from cents

        console.log('Checkout completed, payment_type:', paymentType);

        // Modo `setup`: no mueve dinero, guarda la tarjeta (mandato de cancelación).
        if (session.mode === 'setup' || metadata.purpose === 'cancellation_mandate') {
          await handleCancellationMandateSetup(supabase, session, event.account || null);
          break;
        }

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

      case 'payment_intent.succeeded': {
        // Cobro off-session del cargo por cancelación (Fase 2 · Inc 2a).
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const metadata = paymentIntent.metadata || {};
        if (metadata.payment_type === 'debt_payment' && metadata.debt_id) {
          const amount = (paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100;
          await handleDebtPayment(supabase, metadata as Record<string, string>, amount, paymentIntent.id);
          if (metadata.cancellation_charge_id) {
            await supabase
              .from('cancellation_charges')
              .update({ status: 'paid', stripe_payment_intent_id: paymentIntent.id, off_session_error: null })
              .eq('id', metadata.cancellation_charge_id);
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const metadata = paymentIntent.metadata || {};
        const sessionId = metadata.session_id;
        const debtId = metadata.debt_id;

        if (sessionId) {
          console.log('Payment failed for session:', sessionId);
          await supabase
            .from('sessions')
            .update({ stripe_payment_status: 'failed' })
            .eq('id', sessionId);
        }

        if (debtId) {
          console.log('Payment failed for debt:', debtId);
          await supabase
            .from('debts')
            .update({ stripe_payment_status: 'failed' })
            .eq('id', debtId);
        }

        // Cobro off-session de cancelación fallido: deja el cargo con el error
        // (la deuda queda pendiente, pagable por enlace).
        if (metadata.cancellation_charge_id) {
          await supabase
            .from('cancellation_charges')
            .update({ off_session_error: paymentIntent.last_payment_error?.message || 'El cobro a la tarjeta falló' })
            .eq('id', metadata.cancellation_charge_id);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const metadata = await resolveRefundMetadata({
          chargeMetadata: charge.metadata || {},
          paymentIntent: charge.payment_intent,
          connectedAccountId: event.account || null,
          stripeSecretKey,
        });
        const sessionId = metadata.session_id;
        const debtId = metadata.debt_id;
        console.log('Refund processed for charge:', charge.id);

        let paymentRefund: { refundedAmount: number; refundDelta: number; fullyRefunded: boolean };
        try {
          paymentRefund = await reconcileRefundedPayment(supabase, metadata, charge, event.created);
        } catch (refundError) {
          const professionalId = await resolveProfessionalIdForConnectedAccount(supabase, event.account || null);
          await logStripeIntegrationError(supabase, {
            professionalId,
            step: 'refund_reconciliation',
            errorCode: 'refund_payment_not_found',
            message: refundError instanceof Error
              ? refundError.message
              : 'No se pudo reconciliar el reembolso con un pago local',
            raw: {
              charge_id: charge.id,
              connected_account: event.account || null,
              metadata,
            },
          });
          // Re-throw so the event is marked failed and Stripe retries.
          throw refundError;
        }

        if (sessionId) {
          const { error: sessionRefundError } = await supabase
            .from('sessions')
            .update({
              payment_status: paymentRefund.fullyRefunded ? 'refunded' : 'partial',
              stripe_payment_status: paymentRefund.fullyRefunded ? 'refunded' : 'paid',
            })
            .eq('id', sessionId);
          if (sessionRefundError) throw sessionRefundError;
        }

        if (debtId) {
          const { data: refundedDebt, error: refundedDebtError } = await supabase
            .from('debts')
            .select('bono_id, paid_amount')
            .eq('id', debtId)
            .maybeSingle();
          if (refundedDebtError) throw refundedDebtError;

          const { error: debtRefundError } = await supabase
            .from('debts')
            .update({
              stripe_payment_status: paymentRefund.fullyRefunded ? 'refunded' : 'paid',
              status: paymentRefund.fullyRefunded ? 'refunded' : 'partial',
              paid_amount: Math.max(0, Number(refundedDebt?.paid_amount || 0) - paymentRefund.refundDelta),
            })
            .eq('id', debtId);
          if (debtRefundError) throw debtRefundError;

          if (paymentRefund.fullyRefunded && metadata.payment_type === 'bono_purchase' && refundedDebt?.bono_id) {
            // A purchased bono can be cancelled automatically only while it is
            // unused. Once it has consumed sessions, we keep it as-is and raise a
            // visible notice for manual review instead of silently doing nothing.
            const { data: bono, error: bonoLookupError } = await supabase
              .from('bonos')
              .select('id, name, used_sessions')
              .eq('id', refundedDebt.bono_id)
              .maybeSingle();
            if (bonoLookupError) throw bonoLookupError;

            if (bono && Number(bono.used_sessions || 0) === 0) {
              const { error: bonoRefundError } = await supabase
                .from('bonos')
                .update({ status: 'cancelled' })
                .eq('id', bono.id);
              if (bonoRefundError) throw bonoRefundError;
            } else if (bono) {
              const professionalId = await resolveProfessionalIdForConnectedAccount(supabase, event.account || null);
              await logStripeIntegrationError(supabase, {
                professionalId,
                step: 'bono_refund_review',
                errorCode: 'bono_refund_needs_review',
                message: `Bono "${bono.name}" reembolsado con ${bono.used_sessions} sesión(es) consumida(s): requiere revisión manual (no se canceló automáticamente).`,
                raw: {
                  bono_id: bono.id,
                  used_sessions: bono.used_sessions,
                  charge_id: charge.id,
                  debt_id: debtId,
                },
              });
            }
          }

          if (
            !paymentRefund.fullyRefunded
            && metadata.payment_type === 'bono_purchase'
            && refundedDebt?.bono_id
          ) {
            // Partial refund of a bono: per product decision we do not alter the
            // bono's available sessions automatically; we register a visible
            // notice so the professional reviews it manually.
            const { data: bono, error: bonoLookupError } = await supabase
              .from('bonos')
              .select('id, name')
              .eq('id', refundedDebt.bono_id)
              .maybeSingle();
            if (bonoLookupError) throw bonoLookupError;
            if (bono) {
              const professionalId = await resolveProfessionalIdForConnectedAccount(supabase, event.account || null);
              await logStripeIntegrationError(supabase, {
                professionalId,
                step: 'bono_partial_refund_review',
                errorCode: 'bono_partial_refund_needs_review',
                message: `Bono "${bono.name}" con reembolso parcial de ${paymentRefund.refundDelta.toFixed(2)} €: revisa manualmente las sesiones disponibles.`,
                raw: {
                  bono_id: bono.id,
                  refund_delta: paymentRefund.refundDelta,
                  refunded_amount: paymentRefund.refundedAmount,
                  charge_id: charge.id,
                  debt_id: debtId,
                },
              });
            }
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    const { error: completionError } = await supabase
      .from('stripe_webhook_events')
      .update({ status: 'completed', processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('event_id', event.id);

    if (completionError) {
      throw completionError;
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    if (serviceClient && claimedEventId) {
      const message = error instanceof Error ? error.message : String(error);
      const { data: failedEvent } = await serviceClient
        .from('stripe_webhook_events')
        .update({
          status: 'failed',
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', claimedEventId)
        .select('attempts, connected_account_id')
        .maybeSingle();

      // Escalate to a visible notice once failures persist across Stripe retries.
      const attempts = Number(failedEvent?.attempts ?? 0);
      if (attempts >= WEBHOOK_FAILURE_ALERT_THRESHOLD) {
        const professionalId = await resolveProfessionalIdForConnectedAccount(
          serviceClient,
          failedEvent?.connected_account_id ?? null,
        );
        await logStripeIntegrationError(serviceClient, {
          professionalId,
          step: 'webhook_processing',
          errorCode: 'webhook_repeated_failure',
          message: `El webhook ${claimedEventId} ha fallado ${attempts} veces: ${message}`,
          raw: { event_id: claimedEventId, attempts },
        });
      }
    }
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
