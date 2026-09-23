// DNI/NIE del firmante en consentimientos.
//
// Al crear un consentimiento, las variables `{dni_paciente}` y `{dni_tutor}` se
// sustituyen con lo que haya en la ficha. Si falta el dato, la variable se deja
// SIN sustituir en `content_snapshot`: eso es lo que hace que la página pública
// de firma pida el DNI antes de firmar, y que `update-consent-identity` lo
// escriba en el documento.
//
// Menores: el DNI que se exige es el del tutor. Si la plantilla solo usa
// `{dni_paciente}`, se añade al final un párrafo con los datos del representante
// legal que incluye `{dni_tutor}`.
//
// Lógica pura (sin imports de Deno) para compartirla con el frontend: la
// reexporta `src/lib/consent-identity.ts`.

export const PATIENT_DNI_PLACEHOLDER = "{dni_paciente}";
export const GUARDIAN_DNI_PLACEHOLDER = "{dni_tutor}";

export type IdentityField = "patient" | "guardian";

const NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

/** Quita espacios, guiones y puntos y pasa a mayúsculas. */
export function normalizeIdentityDocument(value: string): string {
  return value.replace(/[\s\-.]/g, "").toUpperCase();
}

/**
 * Valida un DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra) con su
 * letra de control. Devuelve un mensaje en castellano si no es válido.
 */
export function validateIdentityDocument(value: string): { valid: boolean; message?: string } {
  const normalized = normalizeIdentityDocument(value);
  if (!normalized) return { valid: false, message: "Indica el DNI/NIE" };

  let digits: string | null = null;
  let letter: string | null = null;

  const dni = normalized.match(/^(\d{8})([A-Z])$/);
  const nie = normalized.match(/^([XYZ])(\d{7})([A-Z])$/);
  if (dni) {
    digits = dni[1];
    letter = dni[2];
  } else if (nie) {
    digits = `${"XYZ".indexOf(nie[1])}${nie[2]}`;
    letter = nie[3];
  } else {
    return { valid: false, message: "Formato no válido: 8 cifras y letra (DNI) o X/Y/Z, 7 cifras y letra (NIE)" };
  }

  const expected = NIF_LETTERS[parseInt(digits, 10) % 23];
  if (expected !== letter) {
    return { valid: false, message: `La letra no es correcta. Debería ser «${expected}»` };
  }
  return { valid: true };
}

/** Campos de identidad que el firmante aún debe completar en este documento. */
export function getPendingIdentityFields(contentSnapshot: string | null | undefined): IdentityField[] {
  const content = contentSnapshot || "";
  const fields: IdentityField[] = [];
  if (content.includes(PATIENT_DNI_PLACEHOLDER)) fields.push("patient");
  if (content.includes(GUARDIAN_DNI_PLACEHOLDER)) fields.push("guardian");
  return fields;
}

function placeholderFor(field: IdentityField): string {
  return field === "patient" ? PATIENT_DNI_PLACEHOLDER : GUARDIAN_DNI_PLACEHOLDER;
}

/** Sustituye en el documento los DNI indicados (ya normalizados y validados). */
export function fillIdentityPlaceholders(
  content: string,
  values: Partial<Record<IdentityField, string>>,
): string {
  let result = content;
  for (const field of ["patient", "guardian"] as IdentityField[]) {
    const value = values[field];
    if (value) result = result.split(placeholderFor(field)).join(value);
  }
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const GUARDIAN_RELATIONSHIP_LABELS: Record<string, string> = {
  mother: "madre",
  father: "padre",
  guardian: "tutor legal",
};

/** Texto en castellano del valor guardado en `patients.guardian_relationship`. */
export function guardianRelationshipLabel(value: string | null | undefined): string {
  const key = value?.trim() || "";
  if (!key || key === "other") return "";
  return GUARDIAN_RELATIONSHIP_LABELS[key] ?? key;
}

export interface IdentityPatientData {
  tax_id: string | null;
  guardian_tax_id: string | null;
  guardian_name: string | null;
  guardian_relationship: string | null;
  is_minor: boolean | null;
}

/**
 * Resuelve `{dni_paciente}` y `{dni_tutor}` al crear el consentimiento.
 * Lo que falta en la ficha se deja como variable para pedirlo al firmar.
 */
export function resolveIdentityPlaceholders(content: string, patient: IdentityPatientData): string {
  const isMinor = Boolean(patient.is_minor);
  const patientDni = patient.tax_id?.trim() || "";
  const guardianDni = patient.guardian_tax_id?.trim() || "";
  const usesPatientDni = content.includes(PATIENT_DNI_PLACEHOLDER);
  const usesGuardianDni = content.includes(GUARDIAN_DNI_PLACEHOLDER);

  let result = content;

  if (usesPatientDni) {
    // Un menor puede no tener DNI: no se le pide, se exige el del tutor.
    const value = patientDni ? escapeHtml(patientDni) : isMinor ? "—" : PATIENT_DNI_PLACEHOLDER;
    result = result.split(PATIENT_DNI_PLACEHOLDER).join(value);
  }

  if (isMinor && usesPatientDni && !usesGuardianDni) {
    const name = patient.guardian_name?.trim() ? escapeHtml(patient.guardian_name.trim()) : "—";
    const relationshipLabel = guardianRelationshipLabel(patient.guardian_relationship);
    const relationship = relationshipLabel ? ` (${escapeHtml(relationshipLabel)})` : "";
    result += `<p>Representante legal: <strong>${name}</strong>${relationship}, con DNI/NIE <strong>${GUARDIAN_DNI_PLACEHOLDER}</strong>.</p>`;
  }

  if (result.includes(GUARDIAN_DNI_PLACEHOLDER)) {
    // Sin menor no hay tutor al que pedírselo.
    const value = guardianDni ? escapeHtml(guardianDni) : isMinor ? GUARDIAN_DNI_PLACEHOLDER : "";
    result = result.split(GUARDIAN_DNI_PLACEHOLDER).join(value);
  }

  return result;
}
