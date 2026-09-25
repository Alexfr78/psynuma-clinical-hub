// Cambio tardío: el paciente cancela o reprograma con menos antelación que la
// ventana de la política de cancelación que firmó. Se permite, pero la sesión se
// da por consumida (cargo según la política; si el importe es 0 €, p. ej. una
// primera consulta gratuita, cuenta igualmente como utilizada para el máximo por
// servicio). El paciente tiene que confirmarlo expresamente (acceptLateChange).
//
// Una vez empezada la sesión ya no se puede cambiar online: es una inasistencia
// y la gestiona el centro.
import {
  buildSessionDateTime,
  type CancellationEvaluation,
  type CancellationPolicyRules,
  evaluateCancellationCharge,
  resolveCancellationBasePrice,
} from "./paymentRules.ts";
import { isCancellationPolicyEnabled, resolveSignedCancellationPolicyVersionForSession } from "./cancellationPolicy.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export const LATE_CHANGE_ACK_CODE = "late_change_ack_required";
export const SESSION_STARTED_CODE = "session_started";
export const SESSION_STARTED_MESSAGE =
  "La sesión ya ha comenzado o ha pasado, así que no se puede cambiar desde aquí. Para cualquier cambio, contacta con el centro.";

/** Nota para el centro cuando un paciente reprograma tarde (opción "revisar"). */
export const LATE_RESCHEDULE_STAFF_NOTE =
  "⚠️ Reprogramación fuera de plazo: la sesión original se considera consumida (cargo pendiente de revisión en Cobros). Revisa el tipo y el precio de la nueva cita.";

export type ChangeKind = "cancel" | "reschedule";

export interface LateChangeInfo {
  /** La sesión ya empezó: no se permite el cambio online. */
  started: boolean;
  /** Dentro de la ventana de la política firmada: la sesión se consume. */
  isLate: boolean;
  windowHours: number | null;
  amount: number;
  /** Texto para el paciente cuando isLate (null si no lo es). */
  cancelMessage: string | null;
  rescheduleMessage: string | null;
}

export function sessionHasStarted(sessionDate: string, startTime: string, now: Date = new Date()): boolean {
  const start = buildSessionDateTime(sessionDate, startTime);
  return !!start && start.getTime() <= now.getTime();
}

function formatEuros(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} €`;
}

export function describeLateChange(args: {
  sessionDate: string;
  startTime: string;
  sessionTypeName?: string | null;
  rules?: CancellationPolicyRules | null;
  evaluation?: CancellationEvaluation | null;
  now?: Date;
}): LateChangeInfo {
  const started = sessionHasStarted(args.sessionDate, args.startTime, args.now);
  const evaluation = args.evaluation ?? null;
  const isLate = !started && !!evaluation?.applies;
  const windowHours = evaluation?.matchedTier?.hours_before
    ?? args.rules?.cancellation_window_hours
    ?? null;
  const amount = evaluation?.amount ?? 0;

  if (!isLate) {
    return { started, isLate, windowHours, amount, cancelMessage: null, rescheduleMessage: null };
  }

  const notice = windowHours
    ? `Estás avisando con menos de ${windowHours} h de antelación.`
    : "Estás avisando fuera del plazo de la política de cancelación.";
  const consumed = amount > 0
    ? `se aplicará un cargo de ${formatEuros(amount)}, pendiente de revisión por el centro`
    : `${args.sessionTypeName ? `«${args.sessionTypeName}»` : "esta sesión"} cuenta como utilizada`;
  const base = `${notice} Según la política de cancelación que aceptaste, esta sesión se considera consumida: ${consumed}.`;

  return {
    started,
    isLate,
    windowHours,
    amount,
    cancelMessage: base,
    rescheduleMessage: `${base} Puedes cambiarla igualmente; el centro revisará la nueva cita.`,
  };
}

/**
 * Evalúa desde cero la política firmada de una sesión (para los flujos que no
 * tienen ya su propia vista previa del cargo).
 */
export async function evaluateLateChangeForSession(
  supabase: SupabaseClient,
  session: {
    center_id: string;
    patient_id: string;
    session_date: string;
    start_time: string;
    session_type?: string | null;
    session_type_id?: string | null;
    cancellation_policy_version_id?: string | null;
    price?: number | string | null;
  },
  now: Date = new Date(),
) {
  const policyEnabled = await isCancellationPolicyEnabled(supabase, {
    centerId: session.center_id,
    patientId: session.patient_id,
  });
  const signedCancellationPolicy = policyEnabled
    ? await resolveSignedCancellationPolicyVersionForSession(supabase, {
        centerId: session.center_id,
        patientId: session.patient_id,
        policyVersionId: session.cancellation_policy_version_id,
        versionSelect: "id, rules, penalty_invoice_concept",
      })
    : null;
  const signedPolicyEvaluation = signedCancellationPolicy
    ? evaluateCancellationCharge({
        rules: signedCancellationPolicy.rules,
        sessionStartsAt: buildSessionDateTime(session.session_date, session.start_time)!,
        cancelledAt: now,
        basePrice: await resolveCancellationBasePrice(supabase, {
          centerId: session.center_id,
          patientId: session.patient_id,
          sessionTypeId: session.session_type_id,
          sessionTypeName: session.session_type,
          sessionDate: session.session_date,
          sessionPrice: session.price,
        }),
      })
    : null;
  const lateChange = describeLateChange({
    sessionDate: session.session_date,
    startTime: session.start_time,
    sessionTypeName: session.session_type,
    rules: signedCancellationPolicy?.rules,
    evaluation: signedPolicyEvaluation,
    now,
  });
  return { signedCancellationPolicy, signedPolicyEvaluation, lateChange };
}

/** Respuesta 409 cuando el paciente no ha confirmado el cambio tardío. */
export function lateChangeAckRequiredBody(info: LateChangeInfo, kind: ChangeKind) {
  return {
    error: (kind === "cancel" ? info.cancelMessage : info.rescheduleMessage)
      ?? "Confirma que aceptas que la sesión se considera consumida.",
    code: LATE_CHANGE_ACK_CODE,
    lateChange: info,
  };
}
