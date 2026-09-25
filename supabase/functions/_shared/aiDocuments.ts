// Contrato con el modelo para los documentos clínicos generados con IA.
//
// El documento es texto libre en markdown: la estructura (títulos, orden, qué se omite) la
// decide únicamente el prompt de la plantilla. El sistema no conoce apartados: solo añade una
// instrucción técnica de salida y comprueba que la respuesta sea un documento utilizable.

/**
 * Instrucción técnica que se anexa al prompt de usuario. No impone estructura: solo pide que
 * la respuesta sea el documento final, sin envoltorios ni comentarios del modelo.
 */
export function buildOutputInstruction(): string {
  return `Devuelve únicamente el documento final en markdown, listo para que lo lea su destinatario: sin bloque de código que lo envuelva, sin comentarios antes ni después y sin explicar cómo lo has elaborado.`;
}

/**
 * Limpia la respuesta del modelo: quita un posible bloque ```markdown ... ``` que envuelva el
 * documento entero y los espacios sobrantes. Nunca lanza; si no queda texto devuelve ''.
 */
export function cleanModelMarkdown(raw: string): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const fenced = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).trim();
}
