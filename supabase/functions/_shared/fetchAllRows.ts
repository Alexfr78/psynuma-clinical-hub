/**
 * Lecturas completas para exportaciones e informes, que sí necesitan todas las filas.
 *
 * PostgREST corta cada respuesta en 1.000 filas sin dar error, y un `.in('id', [...])` con
 * cientos de UUID supera la longitud máxima de la URL. Estas dos utilidades sortean ambos
 * límites sin cambiar el resultado.
 */
type PageResponse<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

export const MAX_ROWS_PER_REQUEST = 1000;
/** ~200 UUID (36 caracteres + separador) caben con margen en una URL. */
export const IN_FILTER_CHUNK_SIZE = 200;

/**
 * Lee todas las filas pidiendo tramos sucesivos con `.range(from, to)`.
 * La consulta DEBE tener un orden estable (incluir un desempate único, p. ej. `id`):
 * sin él, dos tramos pueden repetir o saltarse filas.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PageResponse<T>,
  pageSize = MAX_ROWS_PER_REQUEST,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/**
 * Ejecuta una consulta `.in(columna, ids)` por tandas y concatena los resultados, en el orden
 * de las tandas. Cada tanda se lee completa con `fetchAllRows` (una tanda puede devolver más
 * de 1.000 filas si la relación es de uno a muchos).
 */
export async function fetchInChunks<T>(
  ids: readonly string[],
  build: (chunk: string[], from: number, to: number) => PageResponse<T>,
  chunkSize = IN_FILTER_CHUNK_SIZE,
): Promise<T[]> {
  const unique = Array.from(new Set(ids));
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    rows.push(...(await fetchAllRows((from, to) => build(chunk, from, to))));
  }
  return rows;
}
