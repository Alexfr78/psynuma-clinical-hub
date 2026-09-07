// Deno twin of src/lib/ai-documents.ts — mirrors its section-rendering logic exactly.
// Duplicated (not imported) because edge functions cannot import from src/.
//
// `renderMarkdown` in particular MUST stay byte-for-byte identical to the client version:
// `send-notification` compares the text it sends to the patient against the mirrored
// `sessions.ai_summary_*` column as an anti-tampering check. If the client's render and this
// server's render ever diverge, patient-facing sends get silently blocked. Keep both in sync.
//
// This file additionally covers the model-facing side that has no client equivalent: turning
// a template's `sections` into a JSON-format instruction for the AI provider, and parsing /
// validating whatever JSON comes back.

export interface AiDocumentSection {
  key: string;
  label: string;
  required: boolean;
  shareable: boolean;
}

/** Normaliza el `sections` jsonb de una plantilla, descartando entradas malformadas. */
export function parseSections(raw: unknown): AiDocumentSection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { key, label, required, shareable } = item as Record<string, unknown>;
    if (typeof key !== 'string' || !key.trim()) return [];
    return [{
      key: key.trim(),
      label: typeof label === 'string' && label.trim() ? label.trim() : key.trim(),
      required: required !== false,
      shareable: shareable === true,
    }];
  });
}

/**
 * Render canónico: un encabezado de nivel 2 por sección con contenido, en el orden que
 * declara la plantilla. Las secciones vacías se omiten por completo. Debe producir
 * EXACTAMENTE el mismo texto que `renderMarkdown` en src/lib/ai-documents.ts.
 */
export function renderMarkdown(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string {
  return sections
    .map((section) => {
      const body = (content?.[section.key] ?? '').trim();
      if (!body) return null;
      return `## ${section.label}\n\n${body}`;
    })
    .filter((block): block is string => block !== null)
    .join('\n\n');
}

/**
 * Construye la instrucción de formato JSON que se anexa al prompt de usuario, a partir de
 * las secciones declaradas por la plantilla. Ver §7 del contrato.
 */
export function buildJsonFormatInstruction(sections: AiDocumentSection[]): string {
  const keysBlock = sections
    .map((section) => {
      const tag = section.required ? 'obligatorio' : 'opcional';
      return `  "${section.key}": "..."   // ${section.label} (${tag})`;
    })
    .join('\n');

  return `Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto antes ni después, sin bloque de código, con exactamente estas claves:

{
${keysBlock}
}

Cada valor es texto en markdown (puedes usar párrafos y listas, nunca encabezados). No añadas claves que no estén en la lista. No dejes vacía ninguna clave obligatoria.`;
}

/**
 * Parsea la respuesta del modelo como JSON, tolerando que venga envuelta en un bloque
 * ```json ... ``` o con texto sobrante antes/después de las llaves. Nunca lanza: si no se
 * puede extraer un objeto válido devuelve `{}`, dejando que `validateSections` señale las
 * claves obligatorias que faltan.
 */
export function parseModelJson(raw: string): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {};

  let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') {
        result[key] = value;
      } else if (value !== null && value !== undefined) {
        result[key] = String(value);
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Keys `required` que faltan o llegan vacías en el JSON parseado. Vacío = respuesta válida. */
export function validateSections(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string[] {
  return sections
    .filter((section) => section.required && !(content?.[section.key] ?? '').trim())
    .map((section) => section.key);
}
