export interface SessionRecipient {
  id: string;
  patientId: string;
  isPayer: boolean;
  center_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

// Callers use different versions of supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSessionRecipients(supabase: any, sessionId: string): Promise<SessionRecipient[]> {
  const { data: session, error } = await supabase.from("sessions")
    .select("patient_id, center_id, patient:patients!sessions_patient_id_fkey(id, center_id, first_name, last_name, email, phone)")
    .eq("id", sessionId).single();
  if (error) throw error;
  const { data: participants, error: participantsError } = await supabase.from("session_participants")
    .select("patient:patients!session_participants_patient_id_fkey(id, center_id, first_name, last_name, email, phone)")
    .eq("session_id", sessionId).eq("center_id", session.center_id);
  if (participantsError) throw participantsError;
  const recipients: SessionRecipient[] = [];
  for (const [isPayer, rows] of [[true, [session]], [false, participants || []]] as const) {
    for (const row of rows) {
      const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
      if (!patient || patient.center_id !== session.center_id || recipients.some(r => r.patientId === patient.id)) continue;
      recipients.push({ ...patient, patientId: patient.id, isPayer });
    }
  }
  return recipients;
}

export function recipientsFor<T extends { isPayer: boolean }>(kind: 'appointment' | 'payment', recipients: T[]): T[] {
  return kind === 'appointment' ? recipients : recipients.filter(recipient => recipient.isPayer);
}

// Scope membership to the session and center, never to a general couple relationship.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function patientSessionFilter(supabase: any, patientId: string, centerId: string): Promise<string> {
  const { data, error } = await supabase.from("session_participants")
    .select("session_id").eq("patient_id", patientId).eq("center_id", centerId);
  if (error) throw error;
  const ids = (data || []).map((row: { session_id: string }) => row.session_id);
  return ids.length ? `patient_id.eq.${patientId},id.in.(${ids.join(',')})` : `patient_id.eq.${patientId}`;
}
