import { createElement, type ReactNode } from 'react';

/**
 * Utilidades para los documentos clínicos generados con IA.
 *
 * Un documento es texto libre en markdown: la estructura la marca el prompt de la plantilla
 * y el sistema no conoce apartados. Se guarda el original de la IA (`content_markdown`) y,
 * si el profesional lo edita, su versión (`edited_markdown`).
 */

/**
 * Renderiza el subconjunto de formato permitido en la edición interna del profesional.
 * Al paciente se le envía siempre el texto literal, sin este formato.
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

/** El markdown vigente de un documento: la edición del profesional si existe, si no el original. */
export function effectiveMarkdown(doc: {
  content_markdown: string;
  edited_markdown?: string | null;
}): string {
  return doc.edited_markdown ?? doc.content_markdown;
}
