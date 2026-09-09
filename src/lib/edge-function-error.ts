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
    let raw = '';
    try {
      raw = await context.clone().text();
    } catch {
      // Cuerpo ilegible: queda al menos el código de estado, más abajo.
    }

    // Caso normal: la función devolvió su propio motivo en español.
    try {
      const message = (JSON.parse(raw) as { error?: unknown })?.error;
      if (typeof message === 'string' && message.trim()) return message;
    } catch {
      // No era JSON.
    }

    // Cuando falla la plataforma y no la función —sin memoria, tiempo agotado, arranque
    // fallido— el cuerpo no es JSON y no lo escribimos nosotros. Sin el estado y el texto
    // crudo el fallo es indiagnosticable, así que se muestran tal cual.
    const detail = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    return `${context.status} ${context.statusText || ''}`.trim() + (detail ? ` — ${detail}` : '');
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
