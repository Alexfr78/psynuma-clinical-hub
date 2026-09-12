import { createElement, type ReactNode } from 'react';
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

/** Construye el texto editable combinado, conservando también las secciones vacías. */
export function buildCombinedEditableText(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string {
  return sections
    .map((section) => `## ${section.label}\n\n${content?.[section.key] ?? ''}`)
    .join('\n\n');
}

/** Divide el texto editable combinado respetando las secciones conocidas y sin perder texto. */
export function splitCombinedEditableText(
  sections: AiDocumentSection[],
  text: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const sectionByHeader = new Map(sections.map((section) => [`## ${section.label}`, section.key]));
  const lines = text.split('\n');
  const chunks = new Map<string, string[]>();
  const firstKey = sections[0]?.key;
  let currentKey = firstKey;

  for (const line of lines) {
    const nextKey = sectionByHeader.get(line);
    if (nextKey) {
      currentKey = nextKey;
      if (!chunks.has(currentKey)) chunks.set(currentKey, []);
      continue;
    }
    if (currentKey) {
      const chunk = chunks.get(currentKey) ?? [];
      chunk.push(line);
      chunks.set(currentKey, chunk);
    }
  }

  for (const section of sections) {
    result[section.key] = (chunks.get(section.key) ?? []).join('\n').trim();
  }
  return result;
}

/** Solo las secciones marcadas como compartibles con el paciente. */
export function renderShareableMarkdown(
  sections: AiDocumentSection[],
  content: Record<string, string>,
): string {
  return renderMarkdown(sections.filter((s) => s.shareable), content);
}

/**
 * Renderiza el subconjunto de formato permitido en la edición interna del profesional.
 * No forma parte del render canónico: las secciones compartibles siguen siendo texto literal.
 */
export function renderEditableMarkdown(text: string): ReactNode[] {
  const renderRange = (value: string, keyPrefix: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let nodeIndex = 0;

    while (cursor < value.length) {
      const openingMatch = /(\*\*|==)/.exec(value.slice(cursor));
      if (!openingMatch || openingMatch.index === undefined) {
        nodes.push(value.slice(cursor));
        break;
      }

      const openingStart = cursor + openingMatch.index;
      const delimiter = openingMatch[0];
      const closingStart = value.indexOf(delimiter, openingStart + delimiter.length);
      if (closingStart === -1) {
        nodes.push(value.slice(cursor));
        break;
      }

      if (openingStart > cursor) nodes.push(value.slice(cursor, openingStart));

      const inner = value.slice(openingStart + delimiter.length, closingStart);
      const key = `${keyPrefix}-${nodeIndex++}`;
      nodes.push(
        delimiter === '**'
          ? createElement('strong', { key }, renderRange(inner, key))
          : createElement(
              'mark',
              { key, className: 'bg-yellow-200/70 dark:bg-yellow-500/30' },
              renderRange(inner, key),
            ),
      );
      cursor = closingStart + delimiter.length;
    }

    return nodes;
  };

  return renderRange(text, 'formatted');
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
