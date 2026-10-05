// Nombres de los dos miembros en el título de los eventos de Google Calendar.
// En una sesión de pareja {paciente} y {nombre} deben llevar a ambos
// ("Ana López y Luis Pérez" / "Ana y Luis"), no solo al titular.

export interface NamedPerson {
  first_name?: string | null;
  last_name?: string | null;
}

/** Embed `participants:session_participants(patient:patients!…(first_name, last_name))` → personas. */
export function partnersFromEmbed(participants: unknown): NamedPerson[] {
  if (!Array.isArray(participants)) return [];
  return participants
    .map((row) => {
      const patient = (row as { patient?: NamedPerson | NamedPerson[] | null })?.patient;
      return Array.isArray(patient) ? patient[0] : patient;
    })
    .filter((p): p is NamedPerson => !!p && !!(p.first_name || p.last_name));
}

const fullName = (p: NamedPerson) => `${p.first_name || ""} ${p.last_name || ""}`.trim();
const firstName = (p: NamedPerson) => (p.first_name || "").trim() || fullName(p);

function joinNames(names: string[]): string {
  const clean = names.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
}

/** Nombres para {paciente} y {nombre}; null si la sesión no es de pareja. */
export function coupleDisplayNames(patient: NamedPerson | null | undefined, partners: NamedPerson[]): { full: string; first: string } | null {
  if (partners.length === 0) return null;
  const members = patient ? [patient, ...partners] : partners;
  return { full: joinNames(members.map(fullName)), first: joinNames(members.map(firstName)) };
}

/**
 * Para títulos que llegan ya hechos (p. ej. solo el nombre del titular): añade el
 * nombre de pila de la pareja si el título aún no lo incluye.
 */
export function withPartnerNames(title: string, partners: NamedPerson[]): string {
  const missing = partners.map(firstName).filter((name) => name && !title.toLowerCase().includes(name.toLowerCase()));
  if (missing.length === 0) return title;
  return joinNames([title, ...missing]);
}

export const PARTNERS_EMBED =
  "participants:session_participants(patient:patients!session_participants_patient_id_fkey(first_name, last_name))";
