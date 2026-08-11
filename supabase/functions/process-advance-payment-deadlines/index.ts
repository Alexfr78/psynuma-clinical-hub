import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueAndSendPatientBookingNotification } from "../_shared/bookingPatientNotifications.ts";
import { notifyProfessionalBooking } from "../_shared/professionalNotification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface OverdueSession {
  id: string;
  center_id: string;
  patient_id: string;
  professional_id: string;
  session_date: string;
  start_time: string;
  session_type: string | null;
  session_modality: string | null;
  location_id: string | null;
  payment_status: string | null;
  advance_payment_send_at: string | null;
  advance_payment_due_at: string | null;
  advance_payment_notification_sent_at: string | null;
  advance_payment_notification_failed_at: string | null;
  advance_payment_notification_error: string | null;
  patient: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  professional: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  center: {
    name: string | null;
    auto_cancel_unpaid_advance_sessions: boolean | null;
    unpaid_advance_cancellation_alert_threshold: number | null;
  } | null;
  location: {
    name: string | null;
  } | null;
}

function patientName(session: OverdueSession): string {
  return `${session.patient?.first_name || ""} ${session.patient?.last_name || ""}`.trim() || "Paciente";
}

function professionalName(session: OverdueSession): string {
  return `${session.professional?.first_name || ""} ${session.professional?.last_name || ""}`.trim() || "Profesional";
}

function formatSessionLine(session: OverdueSession): string {
  return `${session.session_date} a las ${(session.start_time || "").substring(0, 5)}`;
}

async function createAndSendProfessionalNotification(
  supabase: SupabaseClient,
  session: OverdueSession,
  subject: string,
  message: string,
): Promise<boolean> {
  const professional = session.professional;
  const channel: "whatsapp" | "email" | null = professional?.phone ? "whatsapp" : professional?.email ? "email" : null;
  const recipient = channel === "whatsapp" ? professional?.phone : professional?.email;

  if (!channel || !recipient) {
    console.log(`[advance-payment] No professional recipient for session=${session.id}`);
    return false;
  }

  const { data: notification, error: insertError } = await supabase
    .from("notifications")
    .insert({
      center_id: session.center_id,
      patient_id: session.patient_id,
      session_id: session.id,
      type: channel,
      recipient,
      subject: channel === "email" ? subject : null,
      message,
      status: "pending",
      scheduled_for: null,
    })
    .select("id")
    .single();

  if (insertError || !notification) {
    console.error("[advance-payment] Error creating professional notification:", insertError);
    return false;
  }

  try {
    const { error: sendError } = await supabase.functions.invoke("send-notification", {
      body: { notificationId: notification.id },
    });
    if (sendError) {
      console.error("[advance-payment] Error sending professional notification:", sendError);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[advance-payment] Exception sending professional notification:", error);
    return false;
  }
}

async function alertProfessionalPaymentOverdue(supabase: SupabaseClient, session: OverdueSession, detail: string) {
  const subject = `Pago anticipado vencido - ${patientName(session)} - ${formatSessionLine(session)}`;
  const message = [
    `Hola ${professionalName(session)},`,
    "",
    `La cita de ${patientName(session)} tiene el pago anticipado vencido.`,
    `Fecha: ${formatSessionLine(session)}`,
    session.session_type ? `Tipo: ${session.session_type}` : null,
    session.location?.name ? `Ubicacion: ${session.location.name}` : null,
    "",
    detail,
  ].filter(Boolean).join("\n");

  await createAndSendProfessionalNotification(supabase, session, subject, message);
}

async function alertProfessionalRepeatedNonPayment(supabase: SupabaseClient, session: OverdueSession, count: number) {
  const threshold = session.center?.unpaid_advance_cancellation_alert_threshold || 2;
  if (count < threshold) return;

  const subject = `Paciente con ${count} cancelaciones por falta de pago - ${patientName(session)}`;
  const message = [
    `Hola ${professionalName(session)},`,
    "",
    `${patientName(session)} acumula ${count} cancelaciones por falta de pago en su historial.`,
    "Puedes revisar si quieres marcar a este paciente como pago anticipado siempre.",
  ].join("\n");

  await createAndSendProfessionalNotification(supabase, session, subject, message);
}

async function countPatientNonPaymentCancellations(supabase: SupabaseClient, patientId: string): Promise<number> {
  const { count, error } = await supabase
    .from("sessions")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("cancelled_for_non_payment", true);

  if (error) {
    console.error("[advance-payment] Error counting non-payment cancellations:", error);
    return 0;
  }

  return count || 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const cronSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[advance-payment] CRON_SECRET not configured");
    return new Response(
      JSON.stringify({ error: "Function not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (cronSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const nowIso = new Date().toISOString();

    const { data: scheduledPayments, error: scheduledPaymentsError } = await supabase
      .from("sessions")
      .select("id, center_id, patient_id, session_date, start_time, session_type, session_modality")
      .eq("status", "scheduled")
      .eq("payment_mode", "scheduled_before")
      .in("payment_status", ["pending", "reminder_sent"])
      .not("advance_payment_send_at", "is", null)
      .lte("advance_payment_send_at", nowIso)
      .is("advance_payment_notification_sent_at", null);

    if (scheduledPaymentsError) throw scheduledPaymentsError;

    let scheduledPaymentLinksSent = 0;
    let scheduledPaymentLinkFailures = 0;

    for (const scheduled of scheduledPayments || []) {
      const sent = await queueAndSendPatientBookingNotification({
        supabase,
        centerId: scheduled.center_id,
        patientId: scheduled.patient_id,
        sessionId: scheduled.id,
        eventType: "created",
        sessionDate: scheduled.session_date,
        startTime: scheduled.start_time,
        sessionType: scheduled.session_type || undefined,
        sessionModality: scheduled.session_modality || undefined,
        includeAdvancePaymentBlock: true,
        extraMessage: "Ya puedes completar el pago de esta cita con el enlace que encontrarás a continuación.",
      });

      const { data: notificationState } = await supabase
        .from("sessions")
        .select("advance_payment_notification_sent_at")
        .eq("id", scheduled.id)
        .maybeSingle();

      if (sent && notificationState?.advance_payment_notification_sent_at) {
        scheduledPaymentLinksSent++;
      } else {
        scheduledPaymentLinkFailures++;
      }
    }

    const { data: sessions, error } = await supabase
      .from("sessions")
      .select(`
        id,
        center_id,
        patient_id,
        professional_id,
        session_date,
        start_time,
        session_type,
        session_modality,
        location_id,
        payment_status,
        advance_payment_send_at,
        advance_payment_due_at,
        advance_payment_notification_sent_at,
        advance_payment_notification_failed_at,
        advance_payment_notification_error,
        patient:patients(first_name, last_name, email, phone),
        professional:profiles!sessions_professional_id_fkey(first_name, last_name, email, phone),
        center:centers(name, auto_cancel_unpaid_advance_sessions, unpaid_advance_cancellation_alert_threshold),
        location:center_locations(name)
      `)
      .eq("status", "scheduled")
      .in("payment_status", ["pending", "reminder_sent", "overdue"])
      .not("advance_payment_due_at", "is", null)
      .lte("advance_payment_due_at", nowIso);

    if (error) throw error;

    let markedOverdue = 0;
    let cancelled = 0;
    let therapistAlerts = 0;
    let skippedWithoutPatientNotice = 0;

    for (const rawSession of sessions || []) {
      const session = rawSession as unknown as OverdueSession;
      const patientWasNotified = !!session.advance_payment_notification_sent_at;

      await supabase
        .from("sessions")
        .update({ payment_status: "overdue", updated_at: nowIso })
        .eq("id", session.id);
      markedOverdue++;

      if (!patientWasNotified) {
        skippedWithoutPatientNotice++;
        const detail = session.advance_payment_notification_failed_at
          ? `No se cancela automaticamente porque falló la notificacion previa al paciente: ${session.advance_payment_notification_error || "sin detalle"}`
          : "No se cancela automaticamente porque no consta una notificacion previa al paciente.";
        await alertProfessionalPaymentOverdue(supabase, session, detail);
        therapistAlerts++;
        continue;
      }

      if (session.center?.auto_cancel_unpaid_advance_sessions) {
        const { error: cancelError } = await supabase
          .from("sessions")
          .update({
            status: "cancelled",
            cancellation_reason: "Falta de pago",
          cancellation_origin: "system",
            cancelled_for_non_payment: true,
            payment_status: "overdue",
            updated_at: nowIso,
          })
          .eq("id", session.id)
          .eq("status", "scheduled");

        if (cancelError) {
          console.error(`[advance-payment] Error cancelling session=${session.id}:`, cancelError);
          await alertProfessionalPaymentOverdue(
            supabase,
            session,
            "El sistema intentó cancelar la cita por falta de pago, pero se produjo un error. Revisa la cita manualmente.",
          );
          therapistAlerts++;
          continue;
        }

        cancelled++;

        await queueAndSendPatientBookingNotification({
          supabase,
          centerId: session.center_id,
          patientId: session.patient_id,
          sessionId: session.id,
          eventType: "cancelled",
          sessionDate: session.session_date,
          startTime: session.start_time,
          reason: "Falta de pago",
        });

        await notifyProfessionalBooking({
          supabase,
          centerId: session.center_id,
          professionalId: session.professional_id,
          patientId: session.patient_id,
          sessionId: session.id,
          eventType: "cancelled",
          sessionDate: session.session_date,
          startTime: session.start_time,
          sessionType: session.session_type || undefined,
          sessionModality: session.session_modality || undefined,
          locationName: session.location?.name || undefined,
          reason: "Falta de pago",
        });

        const count = await countPatientNonPaymentCancellations(supabase, session.patient_id);
        await alertProfessionalRepeatedNonPayment(supabase, session, count);
        continue;
      }

      await alertProfessionalPaymentOverdue(
        supabase,
        session,
        "La cita no se ha cancelado automaticamente porque el centro tiene esa opcion desactivada.",
      );
      therapistAlerts++;
    }

    let reconciliation: Record<string, unknown> | null = null;
    try {
      const reconcileResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": expectedSecret,
          },
          body: JSON.stringify({ action: "reconcile_pending", limit: 100 }),
        },
      );
      reconciliation = await reconcileResponse.json();
      if (!reconcileResponse.ok) {
        console.error("[advance-payment] Stripe reconciliation failed:", reconciliation);
      }
    } catch (reconciliationError) {
      console.error("[advance-payment] Stripe reconciliation exception:", reconciliationError);
      reconciliation = { success: false, error: "Stripe reconciliation request failed" };
    }

    return new Response(
      JSON.stringify({
        success: true,
        scheduled_payment_links_checked: scheduledPayments?.length || 0,
        scheduled_payment_links_sent: scheduledPaymentLinksSent,
        scheduled_payment_link_failures: scheduledPaymentLinkFailures,
        checked: sessions?.length || 0,
        marked_overdue: markedOverdue,
        cancelled,
        therapist_alerts: therapistAlerts,
        skipped_without_patient_notice: skippedWithoutPatientNotice,
        stripe_reconciliation: reconciliation,
        timestamp: nowIso,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[advance-payment] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
