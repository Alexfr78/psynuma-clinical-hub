/**
 * Sesiones de pareja.
 *
 * `sessions.patient_id` es siempre el TITULAR: quien paga y a cuyo nombre va la
 * factura. El otro miembro se guarda en `session_participants`. Los avisos de la
 * cita llegan a los dos; los de pago, solo al titular.
 */

export type CouplePayer = 'patient' | 'partner';

export interface CoupleRolesInput {
  /** Contacto elegido en el formulario. */
  patientId: string;
  /** Segundo miembro (vacío si la sesión es individual). */
  partnerId?: string | null;
  /** Quién paga: el contacto elegido o su pareja. */
  payer?: CouplePayer | null;
  /** El tipo de sesión elegido es de pareja. */
  isCoupleType: boolean;
}

export interface CoupleRoles {
  titularId: string;
  participantId: string | null;
}

export function resolveCoupleRoles({ patientId, partnerId, payer, isCoupleType }: CoupleRolesInput): CoupleRoles {
  const partner = isCoupleType && partnerId && partnerId !== patientId ? partnerId : null;
  if (!partner) return { titularId: patientId, participantId: null };
  return payer === 'partner'
    ? { titularId: partner, participantId: patientId }
    : { titularId: patientId, participantId: partner };
}

/** Pagador por defecto de un vínculo, visto desde el contacto elegido. */
export function defaultPayerFor(patientId: string, defaultPayerPatientId: string | null | undefined): CouplePayer {
  return defaultPayerPatientId && defaultPayerPatientId !== patientId ? 'partner' : 'patient';
}
