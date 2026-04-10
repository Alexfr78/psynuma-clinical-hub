import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowDown, ArrowUp, Minus, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { FieldDisplayMeta } from '@/lib/autoregistro-field-display';
import { formatFieldForDisplay } from '@/lib/autoregistro-field-display';

interface CompareRegistrosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: AutoregistroEntry[];
  fieldMetas: FieldDisplayMeta[];
}

/**
 * Side-by-side comparison of up to 4 registros.
 * Entries are compared column-by-column, with diff indicators for numeric
 * fields (arrow up/down) and change highlighting for categorical fields.
 */
export function CompareRegistrosDialog({
  open,
  onOpenChange,
  entries,
  fieldMetas,
}: CompareRegistrosDialogProps) {
  // Sort entries chronologically (oldest → newest) so trends read left-to-right
  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime(),
      ),
    [entries],
  );

  // Only comparable fields (exclude system) and sorted by priority
  const comparableFields = useMemo(
    () =>
      fieldMetas
        .filter((m) => m.comparable && m.visibility !== 'system')
        .sort((a, b) => a.priority - b.priority),
    [fieldMetas],
  );

  if (sortedEntries.length === 0) return null;

  const count = sortedEntries.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Comparar registros</DialogTitle>
          <DialogDescription>
            Comparando {count} registro{count !== 1 ? 's' : ''} ordenado
            {count !== 1 ? 's' : ''} cronológicamente (más antiguo a la izquierda).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="border-b">
                  <th className="text-left font-medium text-xs text-muted-foreground py-3 px-4 w-[200px] sticky left-0 bg-background z-20 border-r">
                    Campo
                  </th>
                  {sortedEntries.map((entry, i) => (
                    <th
                      key={entry.id}
                      className={cn(
                        'text-left py-3 px-4 font-medium min-w-[160px]',
                        i === sortedEntries.length - 1 && 'bg-primary/5',
                      )}
                    >
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">
                          #{i + 1}
                          {i === sortedEntries.length - 1 && (
                            <Badge variant="secondary" className="ml-2 text-[9px] h-4 px-1">
                              Más reciente
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs font-semibold">
                          {format(new Date(entry.submitted_at), "d MMM yyyy", { locale: es })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(entry.submitted_at), 'HH:mm', { locale: es })}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparableFields.length === 0 && (
                  <tr>
                    <td
                      colSpan={count + 1}
                      className="text-center text-sm text-muted-foreground py-8"
                    >
                      No hay campos comparables en esta plantilla.
                    </td>
                  </tr>
                )}
                {comparableFields.map((meta) => {
                  const label = meta.field.label;
                  const values = sortedEntries.map((e) => e.values[label]);

                  return (
                    <tr
                      key={label}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4 align-top sticky left-0 bg-background border-r group-hover:bg-muted/30">
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium">{meta.shortLabel}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {meta.field.type}
                          </div>
                        </div>
                      </td>
                      {values.map((value, i) => {
                        const formatted = formatFieldForDisplay(meta, value, 120);
                        const prevValue = i > 0 ? values[i - 1] : undefined;
                        const isEmpty =
                          value === undefined || value === null || value === '';

                        return (
                          <td
                            key={i}
                            className={cn(
                              'py-3 px-4 align-top',
                              i === sortedEntries.length - 1 && 'bg-primary/5',
                            )}
                          >
                            {isEmpty ? (
                              <span className="text-xs text-muted-foreground italic">
                                Sin respuesta
                              </span>
                            ) : (
                              <CompareCellValue
                                meta={meta}
                                formatted={formatted}
                                prevValue={prevValue}
                                currentValue={value}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface CompareCellValueProps {
  meta: FieldDisplayMeta;
  formatted: ReturnType<typeof formatFieldForDisplay>;
  prevValue: any;
  currentValue: any;
}

function CompareCellValue({
  meta,
  formatted,
  prevValue,
  currentValue,
}: CompareCellValueProps) {
  const hasPrev = prevValue !== undefined && prevValue !== null && prevValue !== '';

  // Numeric diff (scale / number)
  if ((formatted.type === 'scale' || formatted.type === 'number') && hasPrev) {
    const curr = Number(currentValue);
    const prev = Number(prevValue);
    const diff = curr - prev;
    const rounded = Math.round(diff * 100) / 100;

    const DiffIcon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
    const diffColor =
      diff === 0
        ? 'text-muted-foreground'
        : diff > 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-green-600 dark:text-green-400';

    return (
      <div className="space-y-1">
        {formatted.type === 'scale' ? (
          <ScaleBadge formatted={formatted} />
        ) : (
          <span className="text-sm font-medium tabular-nums">{formatted.text}</span>
        )}
        <div className={cn('flex items-center gap-0.5 text-[10px]', diffColor)}>
          <DiffIcon className="h-2.5 w-2.5" />
          <span className="tabular-nums">
            {diff > 0 ? '+' : ''}
            {rounded}
          </span>
        </div>
      </div>
    );
  }

  // Scale without diff context
  if (formatted.type === 'scale') {
    return <ScaleBadge formatted={formatted} />;
  }

  // Boolean
  if (formatted.type === 'boolean') {
    const changed = hasPrev && !!prevValue !== !!currentValue;
    return (
      <div className="flex items-center gap-1.5">
        {currentValue ? (
          <Check className="h-4 w-4 text-green-600" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground" />
        )}
        {changed && (
          <Badge variant="outline" className="text-[9px] h-4 px-1">
            cambio
          </Badge>
        )}
      </div>
    );
  }

  // Categorical (select / emotion)
  if (formatted.type === 'emotion' || formatted.type === 'select') {
    const changed = hasPrev && String(prevValue) !== String(currentValue);
    return (
      <div className="flex items-center gap-1.5">
        <Badge
          variant={formatted.type === 'emotion' ? 'secondary' : 'outline'}
          className={cn(
            'text-xs font-normal',
            changed && 'ring-1 ring-primary/30',
          )}
        >
          {formatted.text}
        </Badge>
      </div>
    );
  }

  // Long text — render in full (no truncation in comparison view)
  if (formatted.type === 'text-long') {
    return (
      <div className="text-xs whitespace-pre-wrap break-words max-w-[240px] leading-relaxed">
        {String(currentValue)}
      </div>
    );
  }

  return <span className="text-sm">{formatted.text}</span>;
}

function ScaleBadge({ formatted }: { formatted: ReturnType<typeof formatFieldForDisplay> }) {
  const pct =
    formatted.scaleMax && formatted.scaleMax > 0
      ? ((formatted.numericValue ?? 0) - (formatted.scaleMin ?? 0)) /
        (formatted.scaleMax - (formatted.scaleMin ?? 0))
      : 0;
  const color =
    pct > 0.75
      ? 'bg-red-300 dark:bg-red-700'
      : pct > 0.5
        ? 'bg-amber-300 dark:bg-amber-700'
        : pct > 0.25
          ? 'bg-blue-300 dark:bg-blue-700'
          : 'bg-green-300 dark:bg-green-700';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums font-medium">
        {formatted.numericValue}
        <span className="text-muted-foreground font-normal">/{formatted.scaleMax}</span>
      </span>
    </div>
  );
}
