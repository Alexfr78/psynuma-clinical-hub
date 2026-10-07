// Bloqueo de reservas online por paciente (patients.booking_blocked).
//
// Un paciente bloqueado no puede reservar ni reprogramar online, pero sigue
// entrando al portal (facturas, documentos). Si alguien reserva con otro email
// y coincide por teléfono o nombre completo con un paciente bloqueado, la cita
// no se rechaza: queda pendiente de aprobación para que el profesional decida.
//
// La parte pura (sin Deno) se reexporta en src/lib/booking-block.ts para test.
// deno-lint-ignore-file no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/** Mensaje neutro: no se le dice al paciente que está bloqueado. */
export const BOOKING_BLOCKED_MESSAGE =
  "No es posible completar la reserva online. Por favor, contacta con el centro.";
export const BOOKING_BLOCKED_CODE = "booking_blocked";

export interface BlockedPatientCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export interface BookingIdentity {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}

/** Últimos 9 dígitos del teléfono (quita prefijo internacional y espacios). */
export function normalizePhoneForMatch(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/** Nombre completo sin tildes, en minúsculas y con espacios simples. */
export function normalizeNameForMatch(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const full = `${firstName ?? ""} ${lastName ?? ""}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  // Un nombre suelto ("ana") daría demasiados falsos positivos.
  return full.includes(" ") ? full : null;
}

/**
 * Devuelve el paciente bloqueado con el que coincide la reserva (teléfono o
 * nombre completo), o null. `excludeId` es el paciente ya identificado por
 * email, que no debe compararse consigo mismo.
 */
export function findSuspectedBlockedPatient(
  identity: BookingIdentity,
  blocked: BlockedPatientCandidate[],
  excludeId?: string | null,
): { patientId: string; matchedBy: "phone" | "name" } | null {
  const phone = normalizePhoneForMatch(identity.phone);
  const name = normalizeNameForMatch(identity.firstName, identity.lastName);
  for (const candidate of blocked) {
    if (candidate.id === excludeId) continue;
    if (phone && normalizePhoneForMatch(candidate.phone) === phone) {
      return { patientId: candidate.id, matchedBy: "phone" };
    }
    if (name && normalizeNameForMatch(candidate.first_name, candidate.last_name) === name) {
      return { patientId: candidate.id, matchedBy: "name" };
    }
  }
  return null;
}

export async function isPatientBookingBlocked(
  supabase: SupabaseClient,
  patientId: string | null | undefined,
): Promise<boolean> {
  if (!patientId) return false;
  const { data, error } = await supabase
    .from("patients")
    .select("booking_blocked")
    .eq("id", patientId)
    .maybeSingle();
  if (error) throw error;
  return data?.booking_blocked === true;
}

/** ¿Alguno de los pacientes está bloqueado? (p. ej. los dos miembros de una pareja). */
export async function isAnyPatientBookingBlocked(
  supabase: SupabaseClient,
  patientIds: string[],
): Promise<boolean> {
  const ids = patientIds.filter(Boolean);
  if (ids.length === 0) return false;
  const { data, error } = await supabase
    .from("patients")
    .select("id")
    .in("id", ids)
    .eq("booking_blocked", true)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function listBlockedPatients(
  supabase: SupabaseClient,
  centerId: string,
): Promise<BlockedPatientCandidate[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone")
    .eq("center_id", centerId)
    .eq("booking_blocked", true);
  if (error) throw error;
  return (data ?? []) as BlockedPatientCandidate[];
}
