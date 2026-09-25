// Cancelación de sesiones de pareja con confirmación del otro miembro.
//
// Flujo (decidido con el centro el 2026-09-24):
//   1. Un miembro cancela desde un enlace público o el portal → NO se cancela aún:
//      se crea `couple_cancellation_requests` y se pregunta al otro miembro.
//   2. El otro responde en /pareja/cancelacion/:token:
//        "También cancelo" → se cancela para los dos.
//        "Voy yo solo"     → la sesión pasa a individual a su nombre.
//   3. Sin respuesta antes del plazo → el cron la cancela para los dos.
// El cargo por cancelación tardía se evalúa en el momento de la PRIMERA
// cancelación y, si la sesión acaba cancelada, se imputa a quien canceló primero.
// Si el otro va solo, la sesión se celebra y no hay cargo para nadie.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAlertMessage, formatDateSpanish, formatTime, sendAdminAlert } from "./adminAlerts.ts";
import { queueAndSendPatientBookingNotification } from "./bookingPatientNotifications.ts";
import { isCancellationPolicyEnabled, resolveSignedCancellationPolicyVersionForSession } from "./cancellationPolicy.ts";
import { buildSessionDateTime, evaluateCancellationCharge, resolveCancellationBasePrice } from "./paymentRules.ts";

const HOUR = 60 * 60 * 1000;
/** Plazo normal: el otro miembro tiene hasta 24 h antes de la cita para responder. */
export const RESPONSE_DEADLINE_HOURS_BEFORE = 24;
/** Si la cancelación llega tarde, se le dan al menos estas horas para responder… */
export const MIN_RESPONSE_WINDOW_HOURS = 4;
/** …pero siempre se cierra como muy tarde 1 h antes de la cita. */
export const LAST_CALL_HOURS_BEFORE = 1;

/**
 * Hasta cuándo puede responder el otro miembro. null = ya no hay margen para
 * preguntar (menos de 1 h para la cita): se cancela para los dos en el acto.
 */
export function computeCoupleCancellationDeadline(sessionStart: Date, now: Date): Date | null {
  const lastCall = sessionStart.getTime() - LAST_CALL_HOURS_BEFORE * HOUR;
  if (lastCall <= now.getTime()) return null;
  const normal = sessionStart.getTime() - RESPONSE_DEADLINE_HOURS_BEFORE * HOUR;
  const minimum = now.getTime() + MIN_RESPONSE_WINDOW_HOURS * HOUR;
  return new Date(Math.min(Math.max(normal, minimum), lastCall));
}

export type CoupleCancellationVia = "session_link" | "portal" | "booking_manage";
export type CoupleDecision = "cancel_both" | "attend_alone";

export type StartCoupleCancellationResult =
  | { kind: "not_couple" }
  | { kind: "pending"; requestId: string; deadlineAt: string; otherFirstName: string; message: string }
  | { kind: "cancelled_both"; message: string };

interface SessionRow {
  id: string;
  center_id: string;
  patient_id: string;
  professional_id: string;
  session_date: string;
  start_time: string;
  status: string | null;
  price: number | string | null;
  payment_status: string | null;
  bono_id: string | null;
  session_type: string | null;
  session_type_id: string | null;
  session_modality: string | null;
  cancellation_policy_version_id: string | null;
  google_calendar_event_id: string | null;
}

interface PatientRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

const SESSION_SELECT =
  "id, center_id, patient_id, professional_id, session_date, start_time, status, price, payment_status, bono_id, " +
  "session_type, session_type_id, session_modality, cancellation_policy_version_id, google_calendar_event_id";

const fullName = (p: PatientRow | null | undefined) => `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim() || "Paciente";

async function loadSession(supabase: SupabaseClient, sessionId: string): Promise<SessionRow | null> {
  const { data } = await supabase.from("sessions").select(SESSION_SELECT).eq("id", sessionId).maybeSingle();
  return (data as SessionRow | null) ?? null;
}

async function loadPatient(supabase: SupabaseClient, patientId: string): Promise<PatientRow | null> {
  const { data } = await supabase
    .from("patients")
    .select("id, first_name, last_name, email, phone")
    .eq("id", patientId)
    .maybeSingle();
  return (data as PatientRow | null) ?? null;
}

/** Miembros de la sesión (titular + participantes). */
export async function getCoupleMembers(supabase: SupabaseClient, session: Pick<SessionRow, "id" | "patient_id">) {
  const { data } = await supabase.from("session_participants").select("patient_id").eq("session_id", session.id);
  const participants = ((data ?? []) as { patient_id: string }[]).map((r) => r.patient_id);
  return participants.length > 0 ? [session.patient_id, ...participants] : [session.patient_id];
}

async function centerBaseUrl(supabase: SupabaseClient, centerId: string): Promise<string> {
  const { data: center } = await supabase
    .from("centers")
    .select("custom_domain, public_domain")
    .eq("id", centerId)
    .maybeSingle();
  if (center?.custom_domain) return `https://${center.custom_domain}`;
  if (center?.public_domain) return `https://${center.public_domain}`;
  return Deno.env.get("APP_BASE_URL") || "https://psycma.lovable.app";
}

/**
 * Mensaje libre a un paciente (no hay plantilla de Meta para este caso): email si
 * lo tiene; si no, WhatsApp por Wasender si está conectado; si tampoco, queda en
 * Notificaciones pendiente de envío manual.
 */
async function sendPatientMessage(
  supabase: SupabaseClient,
  args: { centerId: string; patient: PatientRow; sessionId: string; subject: string; message: string },
): Promise<void> {
  let channel: "email" | "whatsapp" | null = args.patient.email ? "email" : null;
  let manual = false;
  if (!channel && args.patient.phone) {
    channel = "whatsapp";
    const { data: center } = await supabase
      .from("centers")
      .select("wasender_enabled, wasender_emergency_stop")
      .eq("id", args.centerId)
      .maybeSingle();
    const { data: wasender } = await supabase
      .from("whatsapp_sessions")
      .select("status")
      .eq("center_id", args.centerId)
      .maybeSingle();
    manual = !(center?.wasender_enabled && !center?.wasender_emergency_stop && wasender?.status === "connected");
  }
  if (!channel) {
    console.warn("[couple-cancellation] Patient without email or phone", args.patient.id);
    return;
  }

  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      center_id: args.centerId,
      patient_id: args.patient.id,
      session_id: args.sessionId,
      type: channel,
      recipient: channel === "email" ? args.patient.email : args.patient.phone,
      subject: channel === "email" ? args.subject : null,
      message: args.message,
      status: "pending",
      scheduled_for: null,
      error_message: manual ? "Envío manual: WhatsApp automático no disponible para este aviso." : null,
    })
    .select("id")
    .single();
  if (error || !notification) {
    console.error("[couple-cancellation] Could not queue patient message", error);
    return;
  }
  if (manual) return;
  const { error: invokeError } = await supabase.functions.invoke("send-notification", {
    body: { notificationId: notification.id },
  });
  if (invokeError) console.error("[couple-cancellation] send-notification failed", invokeError);
}

async function alertCenter(
  supabase: SupabaseClient,
  session: SessionRow,
  args: { subject: string; eventType: string; patient: PatientRow | null; details: string },
) {
  try {
    await sendAdminAlert({
      supabase,
      centerId: session.center_id,
      eventKey: "booking_cancelled",
      subject: args.subject,
      message: buildAlertMessage({
        eventType: args.eventType,
        patientName: fullName(args.patient),
        patientEmail: args.patient?.email ?? undefined,
        patientPhone: args.patient?.phone ?? undefined,
        sessionDate: session.session_date,
        sessionTime: session.start_time,
        modality: session.session_modality ?? undefined,
        details: args.details,
      }),
      patientId: session.patient_id,
      sessionId: session.id,
      professionalId: session.professional_id,
    });
  } catch (error) {
    console.error("[couple-cancellation] Admin alert failed", error);
  }
}

/** Evalúa el cargo para quien cancela, con SU política firmada. */
async function evaluateChargeFor(supabase: SupabaseClient, session: SessionRow, requesterId: string, now: Date) {
  const enabled = await isCancellationPolicyEnabled(supabase, { centerId: session.center_id, patientId: requesterId });
  if (!enabled) return null;
  const policy = await resolveSignedCancellationPolicyVersionForSession(supabase, {
    centerId: session.center_id,
    patientId: requesterId,
    // La versión guardada en la sesión es la del titular.
    policyVersionId: requesterId === session.patient_id ? session.cancellation_policy_version_id : null,
    versionSelect: "id, rules, penalty_invoice_concept",
  }) as { id: string; rules: unknown; penalty_invoice_concept: string | null } | null;
  const sessionStart = buildSessionDateTime(session.session_date, session.start_time);
  if (!policy || !sessionStart) return null;
  const evaluation = evaluateCancellationCharge({
    // deno-lint-ignore no-explicit-any
    rules: policy.rules as any,
    sessionStartsAt: sessionStart,
    cancelledAt: now,
    basePrice: await resolveCancellationBasePrice(supabase, {
      centerId: session.center_id,
      patientId: session.patient_id,
      sessionTypeId: session.session_type_id,
      sessionTypeName: session.session_type,
      sessionDate: session.session_date,
      sessionPrice: session.price,
    }),
  });
  return { policy, evaluation };
}

async function syncGoogleCancellation(session: SessionRow) {
  if (!session.google_calendar_event_id) return;
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/update-google-calendar-event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({
        professional_id: session.professional_id,
        event_id: session.google_calendar_event_id,
        status: "cancelled",
      }),
    });
  } catch (error) {
    console.error("[couple-cancellation] Google Calendar sync failed", error);
  }
}

/**
 * Punto de entrada desde los flujos de cancelación del paciente. Si la sesión no
 * es de pareja devuelve `not_couple` y el llamador sigue con su cancelación normal.
 */
export async function startCoupleCancellation(
  supabase: SupabaseClient,
  args: { sessionId: string; requesterPatientId: string; reason?: string | null; via: CoupleCancellationVia; now?: Date },
): Promise<StartCoupleCancellationResult> {
  const now = args.now ?? new Date();
  const session = await loadSession(supabase, args.sessionId);
  if (!session) throw new Error("Sesión no encontrada");
  const members = await getCoupleMembers(supabase, session);
  if (members.length < 2) return { kind: "not_couple" };
  if (!members.includes(args.requesterPatientId)) throw new Error("No perteneces a esta sesión");
  if (session.status === "cancelled") throw new Error("La sesión ya está cancelada");

  // Si ya había una solicitud abierta del otro miembro, esta cancelación es su respuesta.
  const { data: pending } = await supabase
    .from("couple_cancellation_requests")
    .select("id, requested_by_patient_id, deadline_at")
    .eq("session_id", session.id)
    .eq("status", "pending")
    .maybeSingle();
  if (pending) {
    if (pending.requested_by_patient_id === args.requesterPatientId) {
      const other = await loadPatient(supabase, members.find((m) => m !== args.requesterPatientId)!);
      return {
        kind: "pending",
        requestId: pending.id,
        deadlineAt: pending.deadline_at,
        otherFirstName: other?.first_name ?? "",
        message: `Ya habías cancelado. Estamos esperando la respuesta de ${other?.first_name ?? "tu pareja"}.`,
      };
    }
    await resolveCoupleCancellation(supabase, { requestId: pending.id, decision: "cancel_both", resolvedBy: "partner" });
    return { kind: "cancelled_both", message: "Cita cancelada para los dos." };
  }

  const otherId = members.find((m) => m !== args.requesterPatientId)!;
  const [requester, other] = await Promise.all([
    loadPatient(supabase, args.requesterPatientId),
    loadPatient(supabase, otherId),
  ]);
  const sessionStart = buildSessionDateTime(session.session_date, session.start_time);
  const deadline = sessionStart ? computeCoupleCancellationDeadline(sessionStart, now) : null;
  const charge = await evaluateChargeFor(supabase, session, args.requesterPatientId, now);

  const { data: request, error } = await supabase
    .from("couple_cancellation_requests")
    .insert({
      center_id: session.center_id,
      session_id: session.id,
      requested_by_patient_id: args.requesterPatientId,
      other_patient_id: otherId,
      deadline_at: (deadline ?? now).toISOString(),
      cancellation_reason: args.reason || null,
      requested_via: args.via,
      charge_applies: !!charge?.evaluation.applies,
      charge_amount: charge?.evaluation.applies ? charge.evaluation.amount : null,
      charge_percentage: charge?.evaluation.applies ? charge.evaluation.percentage : null,
      charge_base_price: charge?.evaluation.applies ? charge.evaluation.basePrice : null,
      charge_policy_version_id: charge?.evaluation.applies ? charge.policy.id : null,
      charge_concept: charge?.policy.penalty_invoice_concept || "Cancelacion fuera de plazo segun politica aceptada",
    })
    .select("id, response_token, deadline_at")
    .single();
  if (error || !request) throw error ?? new Error("No se pudo registrar la cancelación");

  // Menos de 1 h para la cita: no da tiempo a preguntar.
  if (!deadline) {
    await resolveCoupleCancellation(supabase, { requestId: request.id, decision: "cancel_both", resolvedBy: "timeout" });
    return { kind: "cancelled_both", message: "Queda menos de una hora para la cita: se ha cancelado para los dos." };
  }

  const baseUrl = await centerBaseUrl(supabase, session.center_id);
  const when = `${formatDateSpanish(session.session_date)} a las ${formatTime(session.start_time)}`;
  const deadlineText = deadline.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  if (other) {
    await sendPatientMessage(supabase, {
      centerId: session.center_id,
      patient: other,
      sessionId: session.id,
      subject: "Tu pareja ha cancelado la sesión conjunta",
      message:
        `Hola ${other.first_name ?? ""}, ${requester?.first_name ?? "tu pareja"} ha cancelado su asistencia a la sesión de pareja del ${when}.\n\n` +
        `¿Quieres asistir tú solo/a o cancelar también? Responde aquí antes del ${deadlineText}:\n` +
        `${baseUrl}/pareja/cancelacion/${request.response_token}\n\n` +
        "Si no respondes a tiempo, la sesión se cancelará para los dos.",
    });
  }

  await alertCenter(supabase, session, {
    subject: `${fullName(requester)} cancela una sesión de pareja`,
    eventType: "Cancelación de sesión de pareja pendiente de respuesta",
    patient: requester,
    details:
      `${fullName(requester)} ha cancelado. Se ha preguntado a ${fullName(other)} si asiste solo/a o cancela también ` +
      `(plazo: ${deadlineText}).${args.reason ? `\nMotivo: ${args.reason}` : ""}` +
      (charge?.evaluation.applies ? `\nSi al final se cancela, cargo estimado a ${fullName(requester)}: ${charge.evaluation.amount.toFixed(2)} EUR.` : ""),
  });

  return {
    kind: "pending",
    requestId: request.id,
    deadlineAt: request.deadline_at,
    otherFirstName: other?.first_name ?? "",
    message:
      `Hemos avisado a ${other?.first_name ?? "tu pareja"} para que confirme si asiste solo/a o cancela también. ` +
      "Te avisaremos del resultado.",
  };
}

/** Tipo individual al que pasa una sesión de pareja. */
async function resolveIndividualType(supabase: SupabaseClient, session: SessionRow) {
  if (session.session_type_id) {
    const { data: coupleType } = await supabase
      .from("session_types")
      .select("individual_fallback_type_id")
      .eq("id", session.session_type_id)
      .maybeSingle();
    if (coupleType?.individual_fallback_type_id) {
      const { data } = await supabase
        .from("session_types")
        .select("id, name")
        .eq("id", coupleType.individual_fallback_type_id)
        .maybeSingle();
      if (data) return data as { id: string; name: string };
    }
  }
  const { data } = await supabase
    .from("session_types")
    .select("id, name")
    .eq("center_id", session.center_id)
    .eq("is_couple", false)
    .neq("is_active", false)
    .order("display_order", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; name: string } | null) ?? null;
}

/** "Voy yo solo": la sesión pasa a individual a nombre de quien asiste. */
async function convertToIndividual(supabase: SupabaseClient, session: SessionRow, attendeeId: string, leaverId: string) {
  // Titular = quien asiste. El trigger swap_participant_on_payer_change deja al
  // antiguo titular como participante; después se elimina a quien se va.
  if (session.patient_id !== attendeeId) {
    const { error } = await supabase.from("sessions").update({ patient_id: attendeeId }).eq("id", session.id);
    if (error) throw error;
  }
  const { error: removeError } = await supabase
    .from("session_participants")
    .delete()
    .eq("session_id", session.id)
    .eq("patient_id", leaverId);
  if (removeError) throw removeError;

  const individualType = await resolveIndividualType(supabase, session);

  // Solo se recalcula el precio si aún no hay nada cobrado, facturado ni bono que
  // no pueda usar quien asiste. Si no, se deja y se avisa al centro para revisar.
  const [{ data: paidDebts }, { data: invoiceItems }, { data: bono }] = await Promise.all([
    supabase.from("debts").select("id").eq("session_id", session.id).or("paid_amount.gt.0,invoice_id.not.is.null").limit(1),
    supabase.from("invoice_items").select("id").eq("session_id", session.id).limit(1),
    session.bono_id
      ? supabase.from("bonos").select("patient_id, shared_with_patient_id").eq("id", session.bono_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const bonoUsable = !session.bono_id
    || (bono && (bono.patient_id === attendeeId || bono.shared_with_patient_id === attendeeId));
  const alreadyPaid = ["paid", "refunded"].includes((session.payment_status || "").toLowerCase()) && !session.bono_id;
  const canReprice = !alreadyPaid && bonoUsable && !(paidDebts?.length) && !(invoiceItems?.length);

  const updates: Record<string, unknown> = {};
  if (individualType) {
    updates.session_type_id = individualType.id;
    updates.session_type = individualType.name;
  }
  let reviewNote: string | null = null;
  if (canReprice && individualType && !session.bono_id) {
    const { data: resolved } = await supabase.rpc("resolve_effective_price", {
      p_patient_id: attendeeId,
      p_target_type: "session_type",
      p_target_id: individualType.id,
      p_reference_date: session.session_date,
    });
    const applied = Number((resolved as { applied_price?: number } | null)?.applied_price);
    if (Number.isFinite(applied)) {
      updates.price = applied;
      updates.base_price_snapshot = Number((resolved as { base_price?: number }).base_price ?? applied);
      updates.pricing_source = (resolved as { pricing_source?: string }).pricing_source ?? "base";
      updates.payment_status = applied > 0 ? "pending" : "paid";
      // Deuda pendiente sin cobrar del antiguo titular: se regenera para el nuevo.
      await supabase
        .from("debts")
        .delete()
        .eq("session_id", session.id)
        .or("paid_amount.is.null,paid_amount.eq.0")
        .is("invoice_id", null);
    }
  } else if (!canReprice) {
    reviewNote = "La sesión ya tenía cobros, factura o un bono que no es de quien asiste: revisa el precio y los cobros a mano.";
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("sessions").update(updates).eq("id", session.id);
    if (error) throw error;
  }
  return { individualType, reviewNote };
}

export async function resolveCoupleCancellation(
  supabase: SupabaseClient,
  args: { requestId: string; decision: CoupleDecision; resolvedBy: "partner" | "timeout" | "professional" },
): Promise<{ status: string; message: string }> {
  // Reclamar la solicitud de forma atómica: solo una resolución gana.
  const finalStatus = args.decision === "attend_alone"
    ? "converted_individual"
    : args.resolvedBy === "timeout" ? "expired_cancelled" : "cancelled_both";
  const { data: request } = await supabase
    .from("couple_cancellation_requests")
    .update({ status: finalStatus, resolved_at: new Date().toISOString(), resolved_by: args.resolvedBy })
    .eq("id", args.requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (!request) {
    return { status: "already_resolved", message: "Esta solicitud ya estaba resuelta." };
  }

  const session = await loadSession(supabase, request.session_id);
  if (!session) throw new Error("Sesión no encontrada");
  const [requester, other] = await Promise.all([
    loadPatient(supabase, request.requested_by_patient_id),
    loadPatient(supabase, request.other_patient_id),
  ]);
  const when = `${formatDateSpanish(session.session_date)} a las ${formatTime(session.start_time)}`;

  if (args.decision === "attend_alone") {
    let conversion: Awaited<ReturnType<typeof convertToIndividual>>;
    try {
      conversion = await convertToIndividual(supabase, session, request.other_patient_id, request.requested_by_patient_id);
    } catch (error) {
      // Se devuelve a pendiente para poder reintentar (o que venza y se cancele).
      await supabase.from("couple_cancellation_requests")
        .update({ status: "pending", resolved_at: null, resolved_by: null })
        .eq("id", request.id);
      throw error;
    }
    const { individualType, reviewNote } = conversion;
    if (reviewNote) {
      await supabase.from("couple_cancellation_requests").update({ resolution_note: reviewNote }).eq("id", request.id);
    }
    if (requester) {
      await sendPatientMessage(supabase, {
        centerId: session.center_id, patient: requester, sessionId: session.id,
        subject: "Cancelación confirmada",
        message: `Hola ${requester.first_name ?? ""}, tu cancelación para la sesión del ${when} está confirmada. ` +
          `${other?.first_name ?? "Tu pareja"} asistirá en sesión individual.`,
      });
    }
    if (other) {
      await sendPatientMessage(supabase, {
        centerId: session.center_id, patient: other, sessionId: session.id,
        subject: "Tu sesión sigue en pie",
        message: `Hola ${other.first_name ?? ""}, tu sesión del ${when} se mantiene como sesión individual.`,
      });
    }
    await alertCenter(supabase, session, {
      subject: `Sesión de pareja pasa a individual: ${fullName(other)}`,
      eventType: "Sesión de pareja convertida en individual",
      patient: other,
      details: `${fullName(requester)} canceló y ${fullName(other)} asistirá solo/a` +
        `${individualType ? ` (tipo: ${individualType.name})` : ""}. No se genera cargo por cancelación.` +
        (reviewNote ? `\n${reviewNote}` : ""),
    });
    return { status: finalStatus, message: "Perfecto, tu sesión se mantiene como sesión individual." };
  }

  // Cancelada para los dos.
  if (session.status !== "cancelled") {
    const { error } = await supabase
      .from("sessions")
      .update({
        status: "cancelled",
        cancellation_origin: "patient",
        cancellation_reason: request.cancellation_reason ||
          (args.resolvedBy === "timeout" ? "Cancelada por un miembro de la pareja; el otro no respondió a tiempo" : "Cancelada por los dos miembros de la pareja"),
      })
      .eq("id", session.id);
    if (error) throw error;
    await syncGoogleCancellation(session);
  }

  if (request.charge_applies && request.charge_policy_version_id) {
    const { error: chargeError } = await supabase.from("cancellation_charges").insert({
      center_id: session.center_id,
      patient_id: request.requested_by_patient_id,
      session_id: session.id,
      policy_version_id: request.charge_policy_version_id,
      status: "pending_review",
      amount: request.charge_amount,
      original_amount: request.charge_amount,
      percentage: request.charge_percentage,
      base_session_price: request.charge_base_price,
      concept: request.charge_concept,
      review_note: `Sesión de pareja cancelada por ${fullName(requester)} (primera cancelación)` +
        (request.cancellation_reason ? `: ${request.cancellation_reason}` : ""),
      origin: "cancel",
    });
    if (chargeError) console.error("[couple-cancellation] Could not create cancellation charge", chargeError);
  }

  // Aviso de cancelación estándar a los dos (reparte a titular y participantes).
  await queueAndSendPatientBookingNotification({
    supabase, centerId: session.center_id, patientId: session.patient_id, sessionId: session.id, eventType: "cancelled",
  });

  await alertCenter(supabase, session, {
    subject: `Sesión de pareja cancelada (${fullName(requester)} y ${fullName(other)})`,
    eventType: "Sesión de pareja cancelada",
    patient: requester,
    details: (args.resolvedBy === "timeout"
      ? `${fullName(other)} no respondió a tiempo; se cancela para los dos.`
      : `${fullName(other)} también cancela.`) +
      (request.charge_applies ? `\nCargo pendiente de revisión a ${fullName(requester)}: ${Number(request.charge_amount).toFixed(2)} EUR.` : ""),
  });
  return { status: finalStatus, message: "La sesión se ha cancelado para los dos." };
}

/** Cron: cancela para los dos las solicitudes cuyo plazo ha vencido. */
export async function expireCoupleCancellations(supabase: SupabaseClient, now = new Date()) {
  const { data } = await supabase
    .from("couple_cancellation_requests")
    .select("id")
    .eq("status", "pending")
    .lte("deadline_at", now.toISOString())
    .limit(50);
  let expired = 0;
  for (const row of (data ?? []) as { id: string }[]) {
    try {
      const result = await resolveCoupleCancellation(supabase, { requestId: row.id, decision: "cancel_both", resolvedBy: "timeout" });
      if (result.status !== "already_resolved") expired++;
    } catch (error) {
      console.error("[couple-cancellation] Could not expire request", row.id, error);
    }
  }
  return { expired };
}
