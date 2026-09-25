/**
 * Cambio tardío (cancelar o reprogramar con menos antelación que la política
 * firmada). Espejo de `supabase/functions/_shared/lateChange.ts`.
 *
 * El servidor responde 409 con `code: late_change_ack_required` si el paciente
 * no ha confirmado que la sesión se considera consumida; la pantalla muestra el
 * mensaje y repite la llamada con `acceptLateChange: true`.
 */
export const LATE_CHANGE_ACK_CODE = 'late_change_ack_required';
export const SESSION_STARTED_CODE = 'session_started';

export interface LateChangeInfo {
  started: boolean;
  isLate: boolean;
  windowHours: number | null;
  amount: number;
  cancelMessage: string | null;
  rescheduleMessage: string | null;
}

/** Lanzado por los hooks cuando hace falta la confirmación del paciente. */
export class LateChangeRequiredError extends Error {
  readonly lateChange: LateChangeInfo | null;
  constructor(message: string, lateChange: LateChangeInfo | null) {
    super(message);
    this.name = 'LateChangeRequiredError';
    this.lateChange = lateChange;
  }
}

export function isLateChangeRequiredError(error: unknown): error is LateChangeRequiredError {
  return error instanceof LateChangeRequiredError;
}

interface EdgeErrorBody {
  error?: string;
  code?: string;
  lateChange?: LateChangeInfo;
}

/**
 * Lee el cuerpo JSON de un error de `supabase.functions.invoke` (supabase-js no
 * lo expone en los 4xx; viaja en `error.context`).
 */
export async function readEdgeFunctionErrorBody(error: unknown): Promise<EdgeErrorBody | null> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return null;
  try {
    return (await context.clone().json()) as EdgeErrorBody;
  } catch {
    return null;
  }
}

/**
 * Convierte el error de una llamada en el error adecuado: LateChangeRequiredError
 * si falta la confirmación, o un Error con el motivo real del servidor.
 */
export async function toPatientChangeError(error: unknown, data: EdgeErrorBody | null | undefined, fallback: string): Promise<Error> {
  const body = data?.error ? data : await readEdgeFunctionErrorBody(error);
  if (body?.code === LATE_CHANGE_ACK_CODE) {
    return new LateChangeRequiredError(body.error || fallback, body.lateChange ?? null);
  }
  if (body?.error) return new Error(body.error);
  if (error instanceof Error && error.message) return error;
  return new Error(fallback);
}
