/**
 * Códigos con los que `process-transcription-job` deja un job en espera por un
 * problema de la cuenta del proveedor (sin saldo, clave inválida o sin configurar):
 * se reintenta cada hora sin gastar intentos. Deben coincidir con
 * ACCOUNT_BLOCKED_CODES de esa edge function.
 */
export const ACCOUNT_BLOCKED_CODES = [
  'stt_insufficient_quota',
  'stt_authentication_failed',
  'stt_invalid_api_key',
  'openai_key_not_configured',
] as const;

export function isAccountBlockedCode(code: string | null | undefined): boolean {
  return !!code && (ACCOUNT_BLOCKED_CODES as readonly string[]).includes(code);
}
