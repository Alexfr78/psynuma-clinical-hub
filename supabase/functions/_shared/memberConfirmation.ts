// Confirmación de asistencia por miembro.
//
// Cada miembro de la cita (titular + pareja) confirma por separado y queda en
// `session_member_confirmations`. `sessions.status` solo pasa a 'confirmed' cuando
// han confirmado todos; en una sesión individual eso ocurre con la primera
// confirmación, igual que antes.

// 'professional' y 'system' los pone el trigger sync_member_confirmations_on_status
// cuando la cita se confirma desde la agenda u otro proceso.
export type ConfirmationVia = "session_link" | "portal" | "whatsapp" | "professional" | "system";

export interface MemberConfirmationResult {
  allConfirmed: boolean;
  confirmedCount: number;
  totalMembers: number;
  /** true si esta llamada ha pasado la sesión a 'confirmed' (para sincronizar el color de Google). */
  statusChanged: boolean;
}

const UNCONFIRMABLE = ["cancelled", "completed", "no_show"];

export function summarizeConfirmations(memberIds: string[], confirmedIds: string[]) {
  const confirmed = new Set(confirmedIds);
  const confirmedCount = memberIds.filter((id) => confirmed.has(id)).length;
  return { confirmedCount, totalMembers: memberIds.length, allConfirmed: memberIds.length > 0 && confirmedCount === memberIds.length };
}

export interface ConfirmCandidate {
  id: string;
  session_date: string;
  start_time: string;
  /** Miembros de la cita: titular y, si es de pareja, el participante. */
  memberIds: string[];
  /** Miembros que ya han confirmado. */
  confirmedIds: string[];
}

/**
 * Elige qué cita confirma una respuesta de WhatsApp: la más próxima donde quien
 * responde es miembro y todavía no ha confirmado. Nunca una cita de la que no es miembro.
 */
export function pickSessionToConfirm<T extends ConfirmCandidate>(candidates: T[], responderIds: string[]) {
  const responders = new Set(responderIds);
  return [...candidates]
    .sort((a, b) => `${a.session_date}T${a.start_time}`.localeCompare(`${b.session_date}T${b.start_time}`))
    .map((session) => ({ session, patientId: session.memberIds.find((id) => responders.has(id)) }))
    .find(({ session, patientId }) => patientId && !session.confirmedIds.includes(patientId)) ?? null;
}

// Callers use different versions of supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSessionMemberIds(supabase: any, session: { id: string; patient_id: string }): Promise<string[]> {
  const { data, error } = await supabase.from("session_participants").select("patient_id").eq("session_id", session.id);
  if (error) throw error;
  const participants = ((data ?? []) as { patient_id: string }[]).map((r) => r.patient_id).filter((id) => id !== session.patient_id);
  return [session.patient_id, ...participants];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registerMemberConfirmation(supabase: any, args: { sessionId: string; patientId: string; via: ConfirmationVia }): Promise<MemberConfirmationResult> {
  const { data: session, error: sessionError } = await supabase.from("sessions")
    .select("id, patient_id, center_id, status").eq("id", args.sessionId).single();
  if (sessionError || !session) throw sessionError ?? new Error("Sesión no encontrada");
  if (UNCONFIRMABLE.includes(session.status)) throw new Error("La cita ya no se puede confirmar");

  const memberIds = await getSessionMemberIds(supabase, session);
  if (!memberIds.includes(args.patientId)) throw new Error("Esta persona no participa en la cita");

  const { error: upsertError } = await supabase.from("session_member_confirmations").upsert({
    center_id: session.center_id,
    session_id: session.id,
    patient_id: args.patientId,
    via: args.via,
  }, { onConflict: "session_id,patient_id", ignoreDuplicates: true });
  if (upsertError) throw upsertError;

  const { data: rows, error: rowsError } = await supabase.from("session_member_confirmations")
    .select("patient_id").eq("session_id", session.id);
  if (rowsError) throw rowsError;
  const summary = summarizeConfirmations(memberIds, ((rows ?? []) as { patient_id: string }[]).map((r) => r.patient_id));

  let statusChanged = false;
  if (summary.allConfirmed && session.status !== "confirmed") {
    const { error: updateError } = await supabase.from("sessions").update({ status: "confirmed" }).eq("id", session.id);
    if (updateError) throw updateError;
    statusChanged = true;
  }
  return { ...summary, statusChanged };
}

export interface WhatsAppConfirmTarget {
  session: {
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    center_id: string;
    patient_id: string;
    professional_id: string;
    google_calendar_event_id: string | null;
  };
  patientId: string;
}

/**
 * Cita que confirma un "sí" por WhatsApp: la más próxima (hoy → +48 h) donde
 * quien escribe es titular o participante y aún no ha confirmado.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findWhatsAppConfirmTarget(supabase: any, args: { patientIds: string[]; centerId: string; fromDate: string; toDate: string }): Promise<WhatsAppConfirmTarget | null> {
  if (args.patientIds.length === 0) return null;
  const { data: participantRows, error: participantsError } = await supabase.from("session_participants")
    .select("session_id").in("patient_id", args.patientIds).eq("center_id", args.centerId);
  if (participantsError) throw participantsError;
  const participantSessionIds = ((participantRows ?? []) as { session_id: string }[]).map((r) => r.session_id);
  const membership = participantSessionIds.length
    ? `patient_id.in.(${args.patientIds.join(",")}),id.in.(${participantSessionIds.join(",")})`
    : `patient_id.in.(${args.patientIds.join(",")})`;

  const { data: sessions, error } = await supabase.from("sessions")
    .select("id, session_date, start_time, end_time, center_id, patient_id, professional_id, google_calendar_event_id, participants:session_participants(patient_id), confirmations:session_member_confirmations(patient_id)")
    .eq("center_id", args.centerId)
    .eq("status", "scheduled")
    .gte("session_date", args.fromDate)
    .lte("session_date", args.toDate)
    .or(membership)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(10);
  if (error) throw error;

  type Row = WhatsAppConfirmTarget["session"] & { participants: { patient_id: string }[] | null; confirmations: { patient_id: string }[] | null };
  const candidates = ((sessions ?? []) as Row[]).map(({ participants, confirmations, ...session }) => ({
    ...session,
    memberIds: [session.patient_id, ...(participants ?? []).map((p) => p.patient_id)],
    confirmedIds: (confirmations ?? []).map((c) => c.patient_id),
  }));
  const picked = pickSessionToConfirm(candidates, args.patientIds);
  if (!picked?.patientId) return null;
  const { memberIds: _memberIds, confirmedIds: _confirmedIds, ...session } = picked.session;
  return { session, patientId: picked.patientId };
}
