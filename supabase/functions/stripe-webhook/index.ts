import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import Stripe from "https://esm.sh/stripe@14.9.0";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature, x-cron-secret',
};

// Initialize Stripe with the secret key
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const connectWebhookSecret = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET');

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
  series_type: string;
  is_default: boolean;
  is_archived: boolean;
}

interface WebhookEventClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<unknown>;
    };
  };
}

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
    const { data: compatibleSeries, error: seriesError } = await supabase
      .from('invoice_series')
      .select('*')
      .eq('center_id', centerId)
      .eq('series_type', 'ordinary')
      .eq('invoice_type', 'simplified')
      .eq('is_archived', false)
      .order('name');

    if (seriesError || !compatibleSeries || compatibleSeries.length === 0) {
      console.error('No invoice series found:', seriesError);
      return { invoiceId: null, accessToken: null };
    }

    const defaultSeries = compatibleSeries.find((candidate: InvoiceSeries) => candidate.is_default);
    if (!defaultSeries && compatibleSeries.length > 1) {
      console.error('Several simplified series exist but none is configured as default');
      return { invoiceId: null, accessToken: null };
    }

    const series = (defaultSeries || compatibleSeries[0]) as InvoiceSeries;

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
        invoice_type: 'simplified',
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

  // SECURITY: Re-validate entities from database - don't trust metadata alone
  const { data: debt, error: debtError } = await supabase
    .from('debts')
    .select('id, patient_id, center_id, session_id, amount, status, stripe_checkout_session_id')
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

  // SECURITY: Verify payment amount matches expected debt amount (with small tolerance for rounding)
  const expectedAmount = debt.amount;
  const amountDifference = Math.abs(paymentAmount - expectedAmount);
  if (amountDifference > 0.01) { // Allow 1 cent tolerance for rounding
    console.error('Amount mismatch:', { expected: expectedAmount, received: paymentAmount });
    throw new Error('Payment amount does not match debt amount');
  }

  // SECURITY: Check if already paid (idempotency)
  if (debt.status === 'paid') {
    console.log('Debt already paid, skipping duplicate webhook:', debtId);
    return;
  }

  // Update debt to paid
  const { error: updateError } = await supabase
    .from('debts')
    .update({
      status: 'paid',
      paid_amount: paymentAmount,
      stripe_payment_status: 'paid',
      stripe_checkout_session_id: stripeSessionId,
    })
    .eq('id', debtId)
    .eq('status', 'pending'); // Only update if still pending (prevent race condition)

  if (updateError) {
    console.error('Error updating debt:', updateError);
    throw new Error('Failed to update debt');
  }

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

  // Update debt if exists
  const { data: debtData, error: debtLookupError } = await supabase
    .from('debts')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (debtLookupError) {
    console.error('Failed to find session debt:', debtLookupError);
    throw new Error('Failed to find session debt');
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
  supabase: any,
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
    manageUrl: sessionData.access_token ? `/cita/${sessionData.access_token}` : undefined,
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
  supabase: any,
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
  supabase: any,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let claimedEventId: string | null = null;
  let serviceClient: WebhookEventClient | null = null;

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
    serviceClient = supabase as unknown as WebhookEventClient;

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

      if (!needsReconciliation) {
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
      await serviceClient
        .from('stripe_webhook_events')
        .update({
          status: 'failed',
          last_error: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq('event_id', claimedEventId);
    }
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
