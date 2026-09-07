import type { AiDocumentSection } from '@/types/ai-documents';

/**
 * Utilidades de secciones tipadas para los documentos clínicos generados con IA.
 *
 * El render de markdown es *canónico*: el mismo algoritmo vive en
 * `supabase/functions/_shared/aiDocuments.ts` para el servidor. Los dos deben producir
 * exactamente el mismo texto, porque `send-notification` compara el mensaje que envía
 * contra `sessions.ai_summary_patient` como control antimanipulación: si el render del
 * cliente y el del servidor divergen, los envíos al paciente se bloquean.
 *
 * La duplicación es deliberada — el cliente no puede importar de `supabase/functions/`.
 */

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
 * declara la plantilla. Las secciones vacías se omiten por completo.
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

/** Solo las secciones marcadas como compartibles con el paciente. */
export function renderShareableMarkdown(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string {
  return renderMarkdown(sections.filter((s) => s.shareable), content);
}

/** Keys obligatorias que faltan o llegan vacías. Vacío = la respuesta es válida. */
export function findMissingSections(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string[] {
  return sections
    .filter((s) => s.required && !(content?.[s.key] ?? '').trim())
    .map((s) => s.key);
}

/** El contenido vigente de un documento: la edición del profesional si existe, si no el original. */
export function effectiveSections(doc: {
  content_sections: Record<string, string>;
  edited_sections?: Record<string, string> | null;
}): Record<string, string> {
  return doc.edited_sections ?? doc.content_sections;
}

/** El markdown vigente de un documento, con la misma precedencia que `effectiveSections`. */
export function effectiveMarkdown(doc: {
  content_markdown: string;
  edited_markdown?: string | null;
}): string {
  return doc.edited_markdown ?? doc.content_markdown;
}
