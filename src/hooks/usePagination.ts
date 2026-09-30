import { useCallback, useState } from 'react';
import { DEFAULT_PAGE_SIZE, isPageSize, pageRange, type PageSize } from '@/lib/pagination';

const storageKey = (listKey: string) => `psycma:page-size:${listKey}`;

function readStoredSize(listKey: string, fallback: PageSize): PageSize {
  try {
    const stored = Number(localStorage.getItem(storageKey(listKey)));
    return isPageSize(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Estado de paginación de un listado.
 *
 * - `listKey` identifica el listado para recordar el tamaño de página elegido (por navegador).
 * - `resetOn`: al cambiar cualquiera de estos valores (filtros, búsqueda) se vuelve a la página 1.
 */
export function usePagination(listKey: string, resetOn: unknown[] = [], defaultSize: PageSize = DEFAULT_PAGE_SIZE) {
  const resetKey = JSON.stringify(resetOn);
  const [state, setState] = useState(() => ({
    page: 0,
    pageSize: readStoredSize(listKey, defaultSize),
    resetKey,
  }));

  // Estado derivado: volver a la primera página en el mismo render en que cambian los filtros,
  // sin un render intermedio que pida la página vieja con los filtros nuevos.
  let current = state;
  if (state.resetKey !== resetKey) {
    current = { ...state, page: 0, resetKey };
    setState(current);
  }

  const setPage = useCallback((page: number) => setState((s) => ({ ...s, page: Math.max(0, page) })), []);

  const setPageSize = useCallback((pageSize: PageSize) => {
    try {
      localStorage.setItem(storageKey(listKey), String(pageSize));
    } catch {
      // Solo es una preferencia: si no se puede guardar, se usa en esta visita.
    }
    setState((s) => ({ ...s, pageSize, page: 0 }));
  }, [listKey]);

  return {
    page: current.page,
    pageSize: current.pageSize,
    setPage,
    setPageSize,
    ...pageRange(current.page, current.pageSize),
  };
}
