import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clampPage, PAGE_SIZE_OPTIONS, pageWindow, totalPages, type PageSize } from '@/lib/pagination';

interface ListPaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  /** Nombre de los elementos en singular y plural, p. ej. ['contacto', 'contactos']. */
  itemLabel?: [string, string];
  isFetching?: boolean;
}

/** Barra de paginación: "Mostrando X–Y de Z", filas por página (10/50/100) y navegación. */
export function ListPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  itemLabel = ['registro', 'registros'],
  isFetching = false,
}: ListPaginationProps) {
  const pages = totalPages(total, pageSize);

  // Si el total baja (se borró algo, o cambió el filtro) y la página ya no existe, ir a la última.
  useEffect(() => {
    const clamped = clampPage(page, total, pageSize);
    if (clamped !== page) onPageChange(clamped);
  }, [page, total, pageSize, onPageChange]);

  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  const label = total === 1 ? itemLabel[0] : itemLabel[1];

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-2">
        <span>
          Mostrando {first}–{last} de {total} {label}
        </span>
        {isFetching && <Icon name="progress_activity" className="h-4 w-4 animate-spin" />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">Filas por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v) as PageSize)}>
            <SelectTrigger className="h-8 w-[72px]" aria-label="Filas por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav className="flex items-center gap-1" aria-label="Paginación">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            aria-label="Página anterior"
          >
            <Icon name="chevron_left" className="h-4 w-4" />
          </Button>
          <div className="hidden items-center gap-1 sm:flex">
            {pageWindow(page, pages).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} className="px-1">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 min-w-8 px-2"
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p + 1}
                </Button>
              ),
            )}
          </div>
          <span className="px-2 sm:hidden">
            {page + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= pages - 1}
            onClick={() => onPageChange(page + 1)}
            aria-label="Página siguiente"
          >
            <Icon name="chevron_right" className="h-4 w-4" />
          </Button>
        </nav>
      </div>
    </div>
  );
}
