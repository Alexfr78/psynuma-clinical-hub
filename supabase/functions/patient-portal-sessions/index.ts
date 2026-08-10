import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendAdminAlert, buildAlertMessage, formatDateSpanish, formatTime } from "../_shared/adminAlerts.ts";
import { logAuditEvent } from "../_shared/auditLogger.ts";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalBooking } from "../_shared/professionalNotification.ts";
import { evaluateCancellationCharge, resolveCancellationBasePrice, resolvePaymentRules } from "../_shared/paymentRules.ts";
import { autoApplyAvailableBonoToSession } from "../_shared/bonoAutomation.ts";
import { resolvePatientCancellationPolicyForSession, resolveSignedCancellationPolicyVersionForSession } from "../_shared/cancellationPolicy.ts";
import { getPublicCancellationPolicy, hasAcceptedCancellationPolicy, recordPortalCancellationPolicyClickwrap } from "../_shared/cancellationPolicyClickwrap.ts";
import { resolveDayAvailability } from "../_shared/availability-core.ts";
import { APP_TZ, buildDayScheduleInput } from "../_shared/special-days-adapter.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

// Use SUPABASE_SERVICE_ROLE_KEY as HMAC secret for verifying tokens
const TOKEN_SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function createServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper functions for time conversion
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

type PortalDayAvailabilityParams = {
  supabase: ReturnType<typeof createServiceClient>;
  centerId: string;
  professionalId: string;
  locationId: string;
  date: string;
  serviceDuration: number;
  step: number;
  minPublicDuration?: number;
  excludeSessionId?: string;
};

/**
 * Single source of truth for patient-portal availability on one day.
 * It deliberately mirrors public-booking, including general closures,
 * professional exceptions and public special-day overrides.
 */
async function resolvePortalDayAvailability({
  supabase,
  centerId,
  professionalId,
  locationId,
  date,
  serviceDuration,
  step,
  minPublicDuration = serviceDuration,
  excludeSessionId,
}: PortalDayAvailabilityParams) {
  const dayOfWeek = new Date(`${date}T12:00:00`).getDay();
  const startOfDay = `${date}T00:00:00`;
  const endOfDay = `${date}T23:59:59`;

  let sessionsQuery = supabase
    .from("sessions")
    .select("id, start_time, end_time")
    .eq("professional_id", professionalId)
    .eq("session_date", date)
    .not("status", "in", '("cancelled","no_show")');
  if (excludeSessionId) sessionsQuery = sessionsQuery.neq("id", excludeSessionId);

  const results = await Promise.all([
    supabase
      .from("availability")
      .select("start_time, end_time")
      .eq("professional_id", professionalId)
      .eq("day_of_week", dayOfWeek)
      .eq("is_available", true),
    supabase
      .from("location_schedules")
      .select("start_time, end_time, is_open")
      .eq("location_id", locationId)
      .eq("day_of_week", dayOfWeek),
    sessionsQuery,
    supabase
      .from("calendar_events")
      .select("id, start_at, end_at, status, all_day, is_converted, deleted")
      .eq("professional_id", professionalId)
      .eq("deleted", false)
      .gte("start_at", startOfDay)
      .lte("start_at", endOfDay),
    supabase
      .from("schedule_exceptions")
      .select("id, scope, professional_id, start_date, end_date, all_day, start_time, end_time, affects_booking")
      .eq("center_id", centerId)
      .eq("affects_booking", true)
      .lte("start_date", date)
      .gte("end_date", date),
    supabase
      .from("special_days")
      .select("id, scope, professional_id, type, start_date, end_date, affects_public_booking, created_at, special_day_slots(start_time, end_time)")
      .eq("center_id", centerId)
      .eq("affects_public_booking", true)
      .lte("start_date", date)
      .gte("end_date", date),
  ]);

  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;

  const [availability, locationSchedules, sessions, calendarEvents, scheduleExceptions, specialDays] = results;
  const input = buildDayScheduleInput({
    date,
    professionalId,
    isPublicContext: true,
    weeklyAvailability: availability.data ?? [],
    locationSchedules: locationSchedules.data ?? [],
    specialDays: specialDays.data ?? [],
    scheduleExceptions: scheduleExceptions.data ?? [],
    sessions: sessions.data ?? [],
    calendarEvents: calendarEvents.data ?? [],
    timezone: APP_TZ,
  });

  return resolveDayAvailability(input, {
    durationMin: serviceDuration,
    stepMin: step,
    minPublicDurationMin: minPublicDuration,
  });
}

function containsRequestedSlot(
  slots: { startMin: number; endMin: number }[],
  startTime: string,
  endTime: string,
) {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  return slots.some((slot) => slot.startMin === startMin && slot.endMin === endMin);
}

// Cryptographic token verification using HMAC-SHA256
async function validateSession(sessionToken: string): Promise<{ valid: boolean; patientId?: string; centerId?: string }> {
  try {
    const [payloadB64, signatureB64] = sessionToken.split(".");
    if (!payloadB64 || !signatureB64) {
      return { valid: false };
    }
    
    const data = atob(payloadB64);
    const encoder = new TextEncoder();
    
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    const signatureBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(data));
    
    if (!isValid) {
      console.error("Token signature verification failed");
      return { valid: false };
    }
    
    const payload = JSON.parse(data);
    
    // Check expiration
    if (payload.exp < Date.now()) {
      console.error("Token expired");
      return { valid: false };
    }
    
    return { valid: true, patientId: payload.patient_id, centerId: payload.center_id };
  } catch (error) {
    console.error("Token validation error:", error);
    return { valid: false };
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createServiceClient();
    const { action, sessionToken, ...params } = await req.json();
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    // Validate session token cryptographically
    const session = await validateSession(sessionToken);
    if (!session.valid || !session.patientId) {
      return new Response(
        JSON.stringify({ error: "Sesión inválida o expirada" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list") {
      // Get ALL patient sessions (including cancelled for history)
      const { data: sessions, error } = await supabase
        .from("sessions")
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          status,
          session_type,
          session_modality,
          notes,
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          ),
          location:center_locations(
            id, name, street, city, location_type
          )
        `)
        .eq("patient_id", session.patientId)
        .order("session_date", { ascending: false })
        .order("start_time", { ascending: false });

      if (error) {
        console.error("Error fetching sessions:", error);
        return new Response(
          JSON.stringify({ error: "Error al obtener las citas" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Separate into upcoming and past
      // Upcoming: future sessions that are NOT cancelled
      // Past: all past sessions (including cancelled ones for history)
      const today = new Date().toISOString().split("T")[0];
      const upcoming = sessions?.filter(s => s.session_date >= today && s.status !== 'cancelled') || [];
      const past = sessions?.filter(s => s.session_date < today || s.status === 'cancelled') || [];

      // Audit: patient viewed their sessions
      logAuditEvent({
        supabase, req,
        userId: null, userRole: 'patient',
        organizationId: session.centerId,
        patientId: session.patientId,
        resourceType: 'sessions', action: 'VIEW',
        routeOrEndpoint: 'patient-portal-sessions/list',
      });

      return new Response(
        JSON.stringify({ upcoming: upcoming.reverse(), past }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-booking-requirements") {
      const activePolicy = await getPublicCancellationPolicy(supabase, session.centerId!);
      const hasAcceptedPolicy = activePolicy
        ? await hasAcceptedCancellationPolicy(supabase, {
            centerId: session.centerId!,
            patientId: session.patientId,
            policyVersionId: activePolicy.id,
          })
        : false;

      return new Response(
        JSON.stringify({ cancellationPolicy: activePolicy, hasAcceptedCancellationPolicy: hasAcceptedPolicy }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "create") {
      const {
        professionalId, sessionTypeId, sessionDate, startTime, endTime, locationId,
        acceptCancellationPolicy, cancellationPolicyVersionId,
      } = params;

      if (!sessionDate || !startTime || !endTime || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Fecha, hora, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CRITICAL: Validate location is public and active
      const { data: location, error: locationError } = await supabase
        .from("center_locations")
        .select("id, name, location_type, is_public, is_active, center_id")
        .eq("id", locationId)
        .eq("center_id", session.centerId)
        .single();

      if (locationError || !location) {
        return new Response(
          JSON.stringify({ error: "Ubicación no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!location.is_public || !location.is_active) {
        return new Response(
          JSON.stringify({ error: "Ubicación no disponible para reservas del portal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_require_approval, portal_default_professional_id, portal_allow_professional_selection, reschedule_slot_duration, default_payment_mode, default_scheduled_hours_before, default_advance_payment_limit_hours")
        .eq("id", session.centerId)
        .single();

      const { data: patientPayment } = await supabase
        .from("patients")
        .select("payment_mode, require_advance_payment_always")
        .eq("id", session.patientId)
        .maybeSingle();

      // Determine professional
      let finalProfessionalId = professionalId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        finalProfessionalId = center?.portal_default_professional_id;
      }

      if (!finalProfessionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional asignado. Contacta con el centro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const activeCancellationPolicy = await getPublicCancellationPolicy(supabase, session.centerId!);
      const alreadyAcceptedPolicy = activeCancellationPolicy
        ? await hasAcceptedCancellationPolicy(supabase, {
            centerId: session.centerId!,
            patientId: session.patientId,
            policyVersionId: activeCancellationPolicy.id,
          })
        : false;

      if (activeCancellationPolicy && !alreadyAcceptedPolicy && !acceptCancellationPolicy) {
        return new Response(
          JSON.stringify({ error: "Debes aceptar la política de cancelación" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (
        activeCancellationPolicy
        && !alreadyAcceptedPolicy
        && cancellationPolicyVersionId !== activeCancellationPolicy.id
      ) {
        return new Response(
          JSON.stringify({ error: "La política de cancelación ha cambiado. Revísala de nuevo." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Get session type details
      const { data: sessionType, error: typeError } = await supabase
        .from("session_types")
        .select("id, name, duration_minutes, default_price")
        .eq("id", sessionTypeId)
        .eq("center_id", session.centerId)
        .single();

      if (typeError || !sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ANTI-RACE-CONDITION: use the same resolver as the availability UI.
      // This also enforces center/professional closures and public special days.
      const serviceDuration = sessionType.duration_minutes;
      const resolvedSlots = await resolvePortalDayAvailability({
        supabase,
        centerId: session.centerId!,
        professionalId: finalProfessionalId,
        locationId,
        date: sessionDate,
        serviceDuration,
        step: 1,
      });

      if (!containsRequestedSlot(resolvedSlots, startTime, endTime)) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse. Por favor, elige otro horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email, phone")
        .eq("id", session.patientId)
        .single();

      if (activeCancellationPolicy && !alreadyAcceptedPolicy) {
        try {
          await recordPortalCancellationPolicyClickwrap(supabase, {
            centerId: session.centerId!,
            patientId: session.patientId,
            professionalId: finalProfessionalId,
            policy: activeCancellationPolicy,
            patientName: patientData
              ? `${patientData.first_name} ${patientData.last_name}`.trim()
              : 'Contacto del portal',
            clientIp,
            userAgent: req.headers.get('user-agent'),
          });
        } catch (acceptanceError) {
          console.error('[patient-portal-sessions] could not record policy acceptance', acceptanceError);
          return new Response(
            JSON.stringify({ error: "No se pudo registrar la aceptación de la política" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      const { data: stripePaymentDefaults, error: stripeDefaultsError } = await supabase
        .from('professional_integrations')
        .select('stripe_enabled, stripe_payment_mode, stripe_scheduled_hours_before')
        .eq('professional_id', finalProfessionalId)
        .maybeSingle();
      if (stripeDefaultsError) {
        console.error('[patient-portal-sessions] could not load Stripe payment defaults', stripeDefaultsError);
      }
      const professionalStripeMode = stripePaymentDefaults?.stripe_enabled
        ? stripePaymentDefaults.stripe_payment_mode
        : null;

      // Determine session modality based on location type
      const sessionModality = location.location_type === 'online' ? 'online' : 'in_person';

      // Create session
      const status = center?.portal_require_approval ? "pending_approval" : "scheduled";
      const paymentRules = resolvePaymentRules({
        patientPaymentMode: patientPayment?.payment_mode,
        patientRequireAdvancePaymentAlways: patientPayment?.require_advance_payment_always,
        // Keep the same precedence as every other session-creation flow:
        // patient override, then center policy, then the legacy Stripe default.
        centerDefaultPaymentMode: center?.default_payment_mode || professionalStripeMode,
        centerDefaultAdvancePaymentLimitHours: center?.default_advance_payment_limit_hours,
        centerDefaultScheduledHoursBefore:
          center?.default_scheduled_hours_before
          ?? stripePaymentDefaults?.stripe_scheduled_hours_before,
        sessionDate,
        startTime,
        price: sessionType.default_price || 0,
      });
      const cancellationPolicyState = await resolvePatientCancellationPolicyForSession(supabase, {
        centerId: session.centerId!,
        patientId: session.patientId,
      });
      
      const { data: newSession, error: createError } = await supabase
        .from("sessions")
        .insert({
          center_id: session.centerId,
          patient_id: session.patientId,
          professional_id: finalProfessionalId,
          session_date: sessionDate,
          start_time: startTime,
          end_time: endTime,
          status,
          session_type: sessionType.name,
          session_modality: sessionModality,
          location_id: locationId,
          price: sessionType.default_price || 0,
          payment_mode: paymentRules.paymentMode,
          payment_status: paymentRules.paymentStatus,
          advance_payment_limit_hours: paymentRules.advancePaymentLimitHours,
          advance_payment_due_at: paymentRules.advancePaymentDueAt,
          ...cancellationPolicyState,
          notes: "Cita solicitada desde el portal de pacientes",
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating session:", createError);
        return new Response(
          JSON.stringify({ error: "Error al crear la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const bonoResult = await autoApplyAvailableBonoToSession(supabase, {
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId: newSession.id,
        shouldApply: status === "scheduled",
      });
      const bonoMessage = bonoResult.applied
        ? `Se ha descontado esta cita de tu bono. Sesiones pendientes: ${bonoResult.remainingSessions ?? 0}.`
        : undefined;

      const paymentRequiredNow = status !== 'pending_approval'
        && !bonoResult.applied
        && paymentRules.paymentMode === 'required_now'
        && Number(sessionType.default_price || 0) > 0;
      let checkoutUrl: string | null = null;
      let checkoutError: string | null = null;

      if (paymentRequiredNow) {
        const { data: checkoutData, error: checkoutInvokeError } = await supabase.functions.invoke(
          'create-stripe-checkout',
          {
            headers: {
              Authorization: `Bearer ${supabaseServiceKey}`,
              apikey: supabaseServiceKey,
            },
            body: { session_id: newSession.id },
          },
        );
        if (checkoutInvokeError || !checkoutData?.checkout_url) {
          checkoutError = checkoutInvokeError?.message || checkoutData?.error || 'No se pudo iniciar el pago seguro';
          console.error('[patient-portal-sessions] required Stripe Checkout failed', {
            sessionId: newSession.id,
            message: checkoutError,
          });
        } else {
          checkoutUrl = checkoutData.checkout_url;
        }
      }

      // Send admin alert for portal session created
      if (patientData) {
        const portalEventType = status === "pending_approval"
          ? 'Nueva solicitud de cita (portal paciente)'
          : paymentRequiredNow
            ? 'Nueva reserva pendiente de pago (portal paciente)'
            : 'Nueva cita reservada (portal paciente)';
        const portalStatus = status === "pending_approval"
          ? 'Pendiente de aprobación'
          : paymentRequiredNow
            ? 'Pendiente de pago'
            : 'Confirmada';
        const alertMessage = buildAlertMessage({
          eventType: portalEventType,
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          patientPhone: patientData.phone,
          sessionDate: sessionDate,
          sessionTime: startTime,
          modality: sessionModality,
          locationName: location.name,
          status: portalStatus,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId!,
          eventKey: 'portal_created',
          subject: `Nueva cita (portal) — ${patientData.first_name} ${patientData.last_name} — ${sessionDate} ${startTime}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId: newSession.id,
          professionalId: finalProfessionalId,
        });
      }

      if (!paymentRequiredNow) {
        // Stripe payments are confirmed and notified only after the webhook marks them paid.
        await new Promise(resolve => setTimeout(resolve, 6000));
        await queueAndSendPatientBookingNotification({
          supabase,
          centerId: session.centerId!,
          patientId: session.patientId!,
          sessionId: newSession.id,
          eventType: 'created',
          sessionDate,
          startTime,
          sessionType: sessionType.name,
          sessionModality,
          locationName: location.name,
          includeAdvancePaymentBlock: status !== "pending_approval" && !bonoResult.applied,
          extraMessage: bonoMessage,
        });

        if (finalProfessionalId) {
          await notifyProfessionalBooking({
            supabase,
            centerId: session.centerId!,
            professionalId: finalProfessionalId,
            patientId: session.patientId!,
            sessionId: newSession.id,
            eventType: 'created',
            sessionDate,
            startTime,
            sessionType: sessionType.name,
            sessionModality,
            locationName: location.name,
          });
        }
      }

      // Audit: patient created a session
      logAuditEvent({
        supabase, req,
        userId: null, userRole: 'patient',
        organizationId: session.centerId,
        patientId: session.patientId,
        resourceType: 'sessions', resourceId: newSession.id,
        action: 'CREATE',
        routeOrEndpoint: 'patient-portal-sessions/create',
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          session: newSession,
          paymentRequired: paymentRequiredNow,
          checkoutUrl,
          checkoutError,
          message: center?.portal_require_approval
            ? "Cita solicitada. Recibirás confirmación pronto."
            : paymentRequiredNow && checkoutError
              ? "Reserva pendiente de pago. No se pudo abrir Stripe; contacta con el centro para completarlo."
              : "Cita creada correctamente."
        }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    async function buildCancellationPreview(sessionId: string) {
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, center_id, patient_id, session_date, start_time, session_type, session_type_id, cancellation_policy, cancellation_policy_version_id, professional_id, price")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return { existingSession: null, signedCancellationPolicy: null, signedPolicyEvaluation: null, response: null };
      }

      const signedCancellationPolicy = await resolveSignedCancellationPolicyVersionForSession(supabase, {
        centerId: existingSession.center_id,
        patientId: session.patientId,
        policyVersionId: existingSession.cancellation_policy_version_id,
        versionSelect: "id, rules, penalty_invoice_concept",
      });

      const sessionDateTime = new Date(`${existingSession.session_date}T${existingSession.start_time}`);
      const now = new Date();

      const signedPolicyEvaluation = signedCancellationPolicy
        ? evaluateCancellationCharge({
          rules: signedCancellationPolicy.rules,
          sessionStartsAt: sessionDateTime,
          cancelledAt: now,
          basePrice: await resolveCancellationBasePrice(supabase, {
            centerId: existingSession.center_id,
            patientId: existingSession.patient_id,
            sessionTypeId: existingSession.session_type_id,
            sessionTypeName: existingSession.session_type,
            sessionDate: existingSession.session_date,
            sessionPrice: existingSession.price,
          }),
        })
        : null;

      const applies = signedPolicyEvaluation?.applies || false;
      const amount = signedPolicyEvaluation?.amount || 0;
      const basePrice = signedPolicyEvaluation?.basePrice || 0;
      const percentage = signedPolicyEvaluation?.percentage || 0;

      return {
        existingSession,
        signedCancellationPolicy,
        signedPolicyEvaluation,
        response: {
          hasSignedPolicy: Boolean(signedCancellationPolicy),
          applies,
          amount,
          basePrice,
          percentage,
          concept: signedCancellationPolicy?.penalty_invoice_concept || "Cancelacion fuera de plazo segun politica aceptada",
          message: applies
            ? `Esta cita esta sujeta a la politica de cancelacion aceptada. Importe estimado sujeto a revision: ${amount.toFixed(2)} EUR.`
            : signedCancellationPolicy
              ? "Esta cita esta cubierta por la politica de cancelacion aceptada. No se estima cargo por cancelacion."
              : "El paciente no tiene politica de cancelacion firmada. No se estima cargo automatico.",
        },
      };
    }

    if (action === "get-cancellation-preview") {
      const { sessionId } = params;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "ID de cita requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { existingSession, response } = await buildCancellationPreview(sessionId);

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "cancel") {
      const { sessionId, reason } = params;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "ID de cita requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const {
        existingSession,
        signedCancellationPolicy,
        signedPolicyEvaluation,
      } = await buildCancellationPreview(sessionId);

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cancellationReviewMessage = signedPolicyEvaluation?.applies
        ? `Cancelacion fuera de plazo. Se ha creado un cargo pendiente de revision por ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : signedCancellationPolicy
          ? "Cancelacion dentro del plazo de la politica firmada. No se crea cargo."
          : "El paciente no tiene politica de cancelacion firmada. No se crea cargo.";
      const patientCancellationPolicyMessage = signedPolicyEvaluation?.applies
        ? `Tu cancelacion queda pendiente de revision segun la politica aceptada. Importe estimado sujeto a revision: ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : undefined;
      const professionalCancellationPolicyMessage = signedPolicyEvaluation?.applies
        ? `Se ha creado una cancelacion pendiente de revision segun la politica aceptada. Importe estimado: ${signedPolicyEvaluation.amount.toFixed(2)} EUR.`
        : undefined;

      // Cancel session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ 
          status: "cancelled",
          cancellation_origin: "patient",
          cancellation_reason: reason || "Cancelada por el paciente desde el portal"
        })
        .eq("id", sessionId);

      if (updateError) {
        console.error("Error cancelling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al cancelar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (signedPolicyEvaluation?.applies && signedCancellationPolicy) {
        const { error: chargeError } = await supabase
          .from("cancellation_charges")
          .insert({
            center_id: existingSession.center_id,
            patient_id: session.patientId!,
            session_id: sessionId,
            policy_version_id: signedCancellationPolicy.id,
            status: "pending_review",
            amount: signedPolicyEvaluation.amount,
            original_amount: signedPolicyEvaluation.amount,
            percentage: signedPolicyEvaluation.percentage,
            base_session_price: signedPolicyEvaluation.basePrice,
            concept: signedCancellationPolicy.penalty_invoice_concept || "CancelaciÃ³n fuera de plazo segÃºn polÃ­tica aceptada",
            review_note: reason || "CancelaciÃ³n solicitada por el paciente desde el portal",
          });

        if (chargeError) {
          console.error("Error creating cancellation charge:", chargeError);
        }
      }

      // Send admin alert for cancellation
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email")
        .eq("id", session.patientId)
        .single();

      if (patientData && session.centerId) {
        const alertMessage = buildAlertMessage({
          eventType: 'Cita cancelada desde el portal del paciente',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          sessionDate: existingSession.session_date,
          sessionTime: existingSession.start_time,
          details: `${reason || 'Sin motivo especificado'}\n\n${cancellationReviewMessage}`,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId,
          eventKey: 'portal_cancelled',
          subject: `Cita cancelada (portal) — ${patientData.first_name} ${patientData.last_name} — ${existingSession.session_date}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId: sessionId,
          professionalId: existingSession.professional_id,
        });

        // Notify professional (email or WhatsApp depending on center config)
        if (existingSession.professional_id) {
          await notifyProfessionalBooking({
            supabase,
            centerId: session.centerId,
            professionalId: existingSession.professional_id,
            patientId: session.patientId,
            sessionId,
            eventType: 'cancelled',
            sessionDate: existingSession.session_date,
            startTime: existingSession.start_time,
            reason: reason || undefined,
            extraMessage: professionalCancellationPolicyMessage,
          });
        }
      }

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Send patient cancellation notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId: sessionId,
        eventType: 'cancelled',
        sessionDate: existingSession.session_date,
        startTime: existingSession.start_time,
        reason: reason || undefined,
        extraMessage: patientCancellationPolicyMessage,
      });

      // Audit: patient cancelled a session
      logAuditEvent({
        supabase, req,
        userId: null, userRole: 'patient',
        organizationId: session.centerId,
        patientId: session.patientId,
        resourceType: 'sessions', resourceId: sessionId,
        action: 'DELETE',
        routeOrEndpoint: 'patient-portal-sessions/cancel',
        metadata: { reason: reason || null },
      });

      return new Response(
        JSON.stringify({
          success: true,
          message: signedPolicyEvaluation?.applies
            ? "Cita cancelada. Tu profesional revisara la politica de cancelacion aplicable."
            : "Cita cancelada correctamente",
          cancellationChargePendingReview: signedPolicyEvaluation?.applies || false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "confirm") {
      const { sessionId } = params;

      if (!sessionId) {
        return new Response(
          JSON.stringify({ error: "ID de cita requerido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session belongs to patient
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, patient_id, status, professional_id, google_calendar_event_id")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (existingSession.status !== "pending_confirmation") {
        return new Response(
          JSON.stringify({ error: "Esta cita no requiere confirmación" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Confirm session
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ status: "confirmed" })
        .eq("id", sessionId);

      if (updateError) {
        console.error("Error confirming session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al confirmar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update Google Calendar event color to sage green (colorId "2") to signal confirmation
      if (existingSession.google_calendar_event_id) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "apikey": supabaseServiceKey,
            },
            body: JSON.stringify({
              professional_id: existingSession.professional_id,
              event_id: existingSession.google_calendar_event_id,
              color_id: "2",
            }),
          });
        } catch (googleError) {
          console.error("Error updating Google Calendar color on confirm:", googleError);
          // Non-fatal — confirmation is already saved in DB
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Cita confirmada correctamente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "reschedule") {
      const { sessionId, newDate, newStartTime, newEndTime, newLocationId } = params;

      if (!sessionId || !newDate || !newStartTime || !newEndTime) {
        return new Response(
          JSON.stringify({ error: "Datos incompletos para reprogramar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify session belongs to patient
      const { data: existingSession } = await supabase
        .from("sessions")
        .select("id, patient_id, session_date, start_time, end_time, status, session_type, session_modality, location_id, professional_id, center_id, cancellation_policy, google_calendar_event_id, zoom_meeting_id")
        .eq("id", sessionId)
        .eq("patient_id", session.patientId)
        .single();

      if (!existingSession) {
        return new Response(
          JSON.stringify({ error: "Cita no encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if session can be rescheduled
      if (['cancelled', 'completed', 'no_show'].includes(existingSession.status)) {
        return new Response(
          JSON.stringify({ error: "Esta cita no se puede reprogramar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sessionDateTime = new Date(`${existingSession.session_date}T${existingSession.start_time}`);
      if (sessionDateTime < new Date()) {
        return new Response(
          JSON.stringify({ error: "No se pueden reprogramar citas pasadas" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check cancellation policy (same rules apply to reschedule)
      const now = new Date();
      const hoursUntilSession = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
      const policyHours: Record<string, number> = {
        "not_allowed": Infinity,
        "until_start": 0,
        "1_hour": 1,
        "2_hours": 2,
        "24_hours": 24,
        "48_hours": 48,
        "72_hours": 72,
      };
      const requiredHours = policyHours[existingSession.cancellation_policy || "24_hours"] || 24;
      
      if (hoursUntilSession < requiredHours) {
        return new Response(
          JSON.stringify({ 
            error: requiredHours === Infinity 
              ? "Esta cita no se puede reprogramar" 
              : `La cita debe reprogramarse con al menos ${requiredHours} horas de antelación` 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolve target location (defaults to existing). Validate same center + active + public.
      const targetLocationId = newLocationId || existingSession.location_id;
      let targetLocation: any = null;
      if (targetLocationId) {
        const { data: loc, error: locErr } = await supabase
          .from("center_locations")
          .select("id, name, location_type, street, number_details, city, postal_code, is_active, is_public, center_id")
          .eq("id", targetLocationId)
          .eq("center_id", session.centerId)
          .maybeSingle();
        if (locErr || !loc) {
          return new Response(
            JSON.stringify({ error: "Ubicación no encontrada" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (!loc.is_active || !loc.is_public) {
          return new Response(
            JSON.stringify({ error: "Ubicación no disponible para reservas del portal" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        targetLocation = loc;
      }

      // Compute new modality preserving zoom/google_meet sub-type when applicable
      const prevModality = existingSession.session_modality;
      let newModality: string | null = prevModality;
      if (targetLocation) {
        if (targetLocation.location_type === 'online') {
          newModality = (prevModality === 'zoom' || prevModality === 'google_meet') ? prevModality : 'online';
        } else {
          newModality = 'in_person';
        }
      }

      // Validate against the same complete rules used by the portal calendar.
      const requestedDuration = timeToMinutes(newEndTime) - timeToMinutes(newStartTime);
      const resolvedSlots = targetLocationId && requestedDuration > 0
        ? await resolvePortalDayAvailability({
            supabase,
            centerId: session.centerId!,
            professionalId: existingSession.professional_id,
            locationId: targetLocationId,
            date: newDate,
            serviceDuration: requestedDuration,
            step: 1,
            excludeSessionId: sessionId,
          })
        : [];

      if (!containsRequestedSlot(resolvedSlots, newStartTime, newEndTime)) {
        return new Response(
          JSON.stringify({ error: "Ese hueco acaba de ocuparse. Elige otro horario." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center config for reschedule_require_confirmation
      const { data: centerConfig } = await supabase
        .from("centers")
        .select("reschedule_require_confirmation, name")
        .eq("id", session.centerId)
        .single();

      const newStatus = centerConfig?.reschedule_require_confirmation ? "pending_approval" : "scheduled";

      // Store old values for notification
      const oldDate = existingSession.session_date;
      const oldTime = existingSession.start_time;
      const oldLocationId = existingSession.location_id;

      // Update session (incl. location + modality)
      const updatePayload: Record<string, any> = {
        session_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        status: newStatus,
      };
      if (targetLocationId) updatePayload.location_id = targetLocationId;
      if (newModality) updatePayload.session_modality = newModality;

      const { data: updatedSession, error: updateError } = await supabase
        .from("sessions")
        .update(updatePayload)
        .eq("id", sessionId)
        .select("id, session_date, start_time, status")
        .single();

      if (updateError || !updatedSession) {
        console.error("Error rescheduling session:", updateError);
        return new Response(
          JSON.stringify({ error: "Error al reprogramar la cita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (newModality === 'zoom' && existingSession.zoom_meeting_id) {
        try {
          const zoomSyncResponse = await fetch(`${supabaseUrl}/functions/v1/update-zoom-meeting`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "apikey": supabaseServiceKey,
            },
            body: JSON.stringify({
              professional_id: existingSession.professional_id,
              meeting_id: existingSession.zoom_meeting_id,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
            }),
          });
          if (!zoomSyncResponse.ok) {
            console.error("[PORTAL-RESCHEDULE] Zoom sync failed:", await zoomSyncResponse.text());
          }
        } catch (zoomError) {
          console.error("[PORTAL-RESCHEDULE] Error syncing to Zoom:", zoomError);
        }
      }

      // Build human-readable location string for Google Calendar
      function buildGcalLocationString(loc: any): string | undefined {
        if (!loc) return undefined;
        if (loc.location_type === 'online') return 'Sesión online';
        const street = loc.street ? `${loc.street}${loc.number_details ? ' ' + loc.number_details : ''}` : '';
        const tail = [loc.postal_code, loc.city].filter(Boolean).join(' ');
        const addr = [street, tail].filter(Boolean).join(', ');
        return addr ? `${loc.name} — ${addr}` : loc.name;
      }
      const gcalLocation = buildGcalLocationString(targetLocation);

      // Sync to Google Calendar
      if (existingSession.google_calendar_event_id) {
        try {
          const { data: patientForGcal } = await supabase
            .from("patients")
            .select("first_name, last_name")
            .eq("id", session.patientId)
            .single();
          
          const patientName = patientForGcal ? `${patientForGcal.first_name} ${patientForGcal.last_name}` : 'Paciente';
          
          await fetch(`${supabaseUrl}/functions/v1/update-google-calendar-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
              "apikey": supabaseServiceKey,
            },
            body: JSON.stringify({
              professional_id: existingSession.professional_id,
              event_id: existingSession.google_calendar_event_id,
              psycma_session_id: sessionId,
              session_date: newDate,
              start_time: newStartTime,
              end_time: newEndTime,
              title: `${existingSession.session_type || 'Sesión'} - ${patientName}`,
              location: gcalLocation,
              create_if_not_exists: true,
            }),
          });
        } catch (googleError) {
          console.error("[PORTAL-RESCHEDULE] Google Calendar sync error:", googleError);
        }
      }

      // Get location name for notification (use the *new* one)
      let locationName: string | undefined = targetLocation?.name;
      let oldLocationName: string | undefined;
      if (oldLocationId && oldLocationId !== targetLocationId) {
        const { data: oldLoc } = await supabase
          .from("center_locations")
          .select("name")
          .eq("id", oldLocationId)
          .single();
        oldLocationName = oldLoc?.name || undefined;
      }
      const locationChanged = !!newLocationId && newLocationId !== oldLocationId;

      // Send admin alert
      const { data: patientData } = await supabase
        .from("patients")
        .select("first_name, last_name, email, phone")
        .eq("id", session.patientId)
        .single();

      if (patientData && session.centerId) {
        const alertMessage = buildAlertMessage({
          eventType: locationChanged
            ? 'Cita reprogramada desde el portal del paciente (cambio de ubicación)'
            : 'Cita reprogramada desde el portal del paciente',
          patientName: `${patientData.first_name} ${patientData.last_name}`,
          patientEmail: patientData.email,
          modality: newModality || existingSession.session_modality,
          locationName,
          oldDate,
          oldTime,
          newDate,
          newTime: newStartTime,
          details: locationChanged
            ? `Ubicación anterior: ${oldLocationName || 'N/D'}. Nueva ubicación: ${locationName || 'N/D'}.`
            : undefined,
        });

        await sendAdminAlert({
          supabase,
          centerId: session.centerId,
          eventKey: 'portal_rescheduled',
          subject: `Cita reprogramada (portal) — ${patientData.first_name} ${patientData.last_name} — ${newDate} ${newStartTime}`,
          message: alertMessage,
          patientId: session.patientId,
          sessionId,
          professionalId: existingSession.professional_id,
        });

        // Notify professional (email or WhatsApp depending on center config)
        if (existingSession.professional_id) {
          await notifyProfessionalBooking({
            supabase,
            centerId: session.centerId,
            professionalId: existingSession.professional_id,
            patientId: session.patientId,
            sessionId,
            eventType: 'rescheduled',
            sessionDate: newDate,
            startTime: newStartTime,
            sessionType: existingSession.session_type,
            sessionModality: newModality || existingSession.session_modality,
            locationName,
            oldDate,
            oldTime,
          });
        }
      }

      // Wait 6s to respect WasenderAPI rate limit (1 msg per 5s)
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Send patient reschedule notification
      await queueAndSendPatientBookingNotification({
        supabase,
        centerId: session.centerId!,
        patientId: session.patientId!,
        sessionId,
        eventType: 'rescheduled',
        sessionDate: newDate,
        startTime: newStartTime,
        sessionType: existingSession.session_type,
        sessionModality: newModality || existingSession.session_modality,
        locationName,
        oldDate,
        oldTime,
      });

      return new Response(
        JSON.stringify({ 
          success: true,
          message: centerConfig?.reschedule_require_confirmation 
            ? "Reprogramación enviada para aprobación" 
            : "Cita reprogramada correctamente"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-month-availability") {
      const { month, professionalId: requestedProfId, sessionTypeId, locationId } = params;

      if (!month || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Mes, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_default_professional_id, portal_allow_professional_selection, reschedule_slot_duration")
        .eq("id", session.centerId)
        .single();

      let professionalId = requestedProfId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        professionalId = center?.portal_default_professional_id;
      }

      if (!professionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: sessionType } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("id", sessionTypeId)
        .single();

      if (!sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;
      const slotDuration = center?.reschedule_slot_duration || 30;

      // Get minPublicDuration for scoring
      const { data: allPublicTypes } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("center_id", session.centerId)
        .eq("is_active", true);

      const minPublicDuration = allPublicTypes?.length
        ? Math.min(...allPublicTypes.map((t: any) => t.duration_minutes))
        : serviceDuration;

      // Get all professional availability (all days)
      const { data: profAvailability } = await supabase
        .from("availability")
        .select("day_of_week, start_time, end_time")
        .eq("professional_id", professionalId)
        .eq("is_available", true);

      // Get all location schedules (all days)
      const { data: locationSchedule } = await supabase
        .from("location_schedules")
        .select("day_of_week, start_time, end_time, is_open")
        .eq("location_id", locationId);

      if (!locationSchedule?.length) {
        return new Response(
          JSON.stringify({ availability: {} }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Build day-of-week lookups
      const profByDay: Record<number, { start_time: string; end_time: string }[]> = {};
      for (const slot of profAvailability || []) {
        if (!profByDay[slot.day_of_week]) profByDay[slot.day_of_week] = [];
        profByDay[slot.day_of_week].push({ start_time: slot.start_time, end_time: slot.end_time });
      }
      const locByDay: Record<number, { start_time: string; end_time: string; is_open: boolean | null }[]> = {};
      for (const slot of locationSchedule) {
        if (!locByDay[slot.day_of_week]) locByDay[slot.day_of_week] = [];
        locByDay[slot.day_of_week].push({ start_time: slot.start_time, end_time: slot.end_time, is_open: slot.is_open });
      }

      // Generate all dates in the month
      const [yearStr, monthStr] = month.split("-");
      const year = parseInt(yearStr);
      const monthNum = parseInt(monthStr) - 1;
      const firstDay = new Date(year, monthNum, 1);
      const lastDay = new Date(year, monthNum + 1, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const monthStartStr = `${month}-01`;
      const monthEndStr = `${month}-${lastDay.getDate().toString().padStart(2, "0")}`;

      const { data: existingSessions } = await supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time")
        .eq("professional_id", professionalId)
        .gte("session_date", monthStartStr)
        .lte("session_date", monthEndStr)
        .not("status", "in", '("cancelled","no_show")');

      const { data: calendarEvents } = await supabase
        .from("calendar_events")
        .select("id, start_at, end_at, status, all_day, is_converted, deleted")
        .eq("professional_id", professionalId)
        .eq("deleted", false)
        .gte("start_at", `${monthStartStr}T00:00:00`)
        .lte("start_at", `${monthEndStr}T23:59:59`);

      const { data: scheduleExceptions } = await supabase
        .from("schedule_exceptions")
        .select("id, scope, professional_id, start_date, end_date, all_day, start_time, end_time, affects_booking")
        .eq("center_id", session.centerId)
        .eq("affects_booking", true)
        .lte("start_date", monthEndStr)
        .gte("end_date", monthStartStr);

      const { data: specialDays } = await supabase
        .from("special_days")
        .select("id, scope, professional_id, type, start_date, end_date, affects_public_booking, created_at, special_day_slots(start_time, end_time)")
        .eq("center_id", session.centerId)
        .eq("affects_public_booking", true)
        .lte("start_date", monthEndStr)
        .gte("end_date", monthStartStr);

      const centerTimezone = 'Europe/Madrid';
      const availability: Record<string, number> = {};

      for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        if (d < today) continue;

        const dateStr = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
        const dayOfWeek = d.getDay();

        const profSlots = profByDay[dayOfWeek] || [];
        const locSlots = locByDay[dayOfWeek] || [];

        const daySessions = existingSessions?.filter(s => s.session_date === dateStr) || [];
        const dayEvents = calendarEvents?.filter(e => {
          const eventDate = new Date(e.start_at);
          const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: centerTimezone });
          return formatter.format(eventDate) === dateStr;
        }) || [];

        const input = buildDayScheduleInput({
          date: dateStr,
          professionalId,
          isPublicContext: true,
          weeklyAvailability: profSlots,
          locationSchedules: locSlots,
          specialDays: specialDays ?? [],
          scheduleExceptions: scheduleExceptions ?? [],
          sessions: daySessions,
          calendarEvents: dayEvents,
          timezone: APP_TZ,
        });
        const slots = resolveDayAvailability(input, {
          durationMin: serviceDuration,
          stepMin: slotDuration,
          minPublicDurationMin: minPublicDuration,
        });
        const optimalCount = slots.filter((slot) => slot.isOptimal).length;
        const slotCount = optimalCount > 0 ? optimalCount : slots.length;

        if (slotCount > 0) {
          availability[dateStr] = slotCount;
        }
      }

      return new Response(
        JSON.stringify({ availability }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-availability") {
      const { date, professionalId: requestedProfId, sessionTypeId, locationId } = params;

      if (!date || !sessionTypeId || !locationId) {
        return new Response(
          JSON.stringify({ error: "Fecha, tipo de sesión y ubicación son requeridos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get center configuration
      const { data: center } = await supabase
        .from("centers")
        .select("portal_default_professional_id, portal_allow_professional_selection, reschedule_slot_duration")
        .eq("id", session.centerId)
        .single();

      // Determine professional
      let professionalId = requestedProfId;
      if (!center?.portal_allow_professional_selection || !professionalId) {
        professionalId = center?.portal_default_professional_id;
      }

      if (!professionalId) {
        return new Response(
          JSON.stringify({ error: "No hay profesional configurado" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get session type for duration
      const { data: sessionType } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("id", sessionTypeId)
        .single();

      if (!sessionType) {
        return new Response(
          JSON.stringify({ error: "Tipo de sesión no válido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const serviceDuration = sessionType.duration_minutes;
      const slotDuration = center?.reschedule_slot_duration || 30;

      // Get minPublicDuration for scoring
      const { data: allPublicTypes } = await supabase
        .from("session_types")
        .select("duration_minutes")
        .eq("center_id", session.centerId)
        .eq("is_active", true);

      const minPublicDuration = allPublicTypes?.length
        ? Math.min(...allPublicTypes.map((t: any) => t.duration_minutes))
        : serviceDuration;

      const resolvedSlots = await resolvePortalDayAvailability({
        supabase,
        centerId: session.centerId!,
        professionalId,
        locationId,
        date,
        serviceDuration,
        step: slotDuration,
        minPublicDuration,
      });

      // Filter past slots
      const now = new Date();
      const futureSlots = resolvedSlots.filter((slot) => {
        const slotDateTime = new Date(`${date}T${minutesToTime(slot.startMin)}:00`);
        return slotDateTime > now;
      });

      return new Response(
        JSON.stringify({ 
          slots: futureSlots.map((slot) => minutesToTime(slot.startMin)),
          serviceDuration,
          step: slotDuration
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Acción no válida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in patient-portal-sessions:", error);
    return new Response(
      JSON.stringify({ error: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
