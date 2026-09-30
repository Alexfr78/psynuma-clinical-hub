/**
 * Paginación de listados en servidor (PostgREST `.range()` + `count: 'exact'`).
 *
 * Los listados no pueden traerse enteros: PostgREST corta en 1.000 filas sin avisar. Cada
 * página pide solo su tramo y el total exacto, y el usuario elige 10, 50 o 100 filas.
 */
export const PAGE_SIZE_OPTIONS = [10, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export interface PageResult<T> {
  rows: T[];
  total: number;
}

export function isPageSize(value: unknown): value is PageSize {
  return PAGE_SIZE_OPTIONS.includes(value as PageSize);
}

/** Tramo inclusivo para `.range(from, to)`. `page` empieza en 0. */
export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = Math.max(0, page) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(0, page), totalPages(total, pageSize) - 1);
}

/**
 * Números de página a mostrar (base 0), con `null` donde va un "…".
 * Siempre la primera y la última, y las vecinas de la actual.
 */
export function pageWindow(current: number, pages: number, siblings = 1): (number | null)[] {
  if (pages <= 5 + siblings * 2) return Array.from({ length: pages }, (_, i) => i);

  const start = Math.max(1, current - siblings);
  const end = Math.min(pages - 2, current + siblings);
  const out: (number | null)[] = [0];
  if (start > 1) out.push(null);
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 2) out.push(null);
  out.push(pages - 1);
  return out;
}
