/**
 * Recupera el mensaje real de un error de `supabase.functions.invoke`.
 *
 * Ante una respuesta que no sea 2xx, supabase-js devuelve un `FunctionsHttpError` cuyo
 * `message` es siempre el mismo texto genérico ("Edge Function returned a non-2xx status
 * code"): el cuerpo de la respuesta no se lee. Nuestras edge functions sí devuelven un motivo
 * en español dentro de `{ error: "..." }`, así que sin esto el profesional ve "error de Edge
 * function" en lugar de, por ejemplo, "API key de OpenAI no configurada".
 *
 * El `Response` original viaja en `error.context`. Se clona antes de leerlo para no consumir
 * el cuerpo por si alguien más quiere inspeccionarlo.
 */
export async function describeEdgeFunctionError(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;

  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = (body as { error?: unknown })?.error;
      if (typeof message === 'string' && message.trim()) return message;
    } catch {
      // El cuerpo no era JSON (p. ej. un 504 del proxy): se cae al mensaje genérico.
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
