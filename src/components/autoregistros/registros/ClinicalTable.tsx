import { useState, useMemo, useCallback } from 'react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { FieldDisplayMeta, FormattedFieldValue } from '@/lib/autoregistro-field-display';
import { formatFieldForDisplay } from '@/lib/autoregistro-field-display';
import { Icon } from '@/components/ui/icon';

interface ClinicalTableProps {
  entries: AutoregistroEntry[];
  visibleFields: FieldDisplayMeta[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onViewDetail: (entry: AutoregistroEntry) => void;
}

type SortDir = 'asc' | 'desc';

function FieldCell({ formatted }: { formatted: FormattedFieldValue }) {
  switch (formatted.type) {
    case 'boolean':
      return formatted.raw ? (
        <Icon name="check" className="h-4 w-4 text-green-600" />
      ) : (
        <Icon name="close" className="h-4 w-4 text-muted-foreground/40" />
      );

    case 'scale': {
      const pct = formatted.scaleMax && formatted.scaleMax > 0
        ? ((formatted.numericValue ?? 0) - (formatted.scaleMin ?? 0)) / (formatted.scaleMax - (formatted.scaleMin ?? 0))
        : 0;
      const color = pct > 0.75 ? 'bg-red-200 dark:bg-red-900' :
                    pct > 0.5 ? 'bg-amber-200 dark:bg-amber-900' :
                    pct > 0.25 ? 'bg-blue-200 dark:bg-blue-900' :
                    'bg-green-200 dark:bg-green-900';
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full', color)} style={{ width: `${pct * 100}%` }} />
          </div>
          <span className="text-xs tabular-nums">{formatted.text}</span>
        </div>
      );
    }

    case 'emotion':
      return (
        <Badge variant="secondary" className="text-xs font-normal max-w-[120px] truncate">
          {formatted.text}
        </Badge>
      );

    case 'select':
      return (
        <Badge variant="outline" className="text-xs font-normal max-w-[120px] truncate">
          {formatted.text}
        </Badge>
      );

    case 'text-long':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm max-w-[180px] block truncate cursor-help">
                {formatted.text}
              </span>
            </TooltipTrigger>
            {formatted.truncated && (
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="text-xs">{String(formatted.raw)}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      );

    case 'number':
      return <span className="tabular-nums text-sm">{formatted.text}</span>;

    default:
      return <span className="text-sm">{formatted.text}</span>;
  }
}

export function ClinicalTable({
  entries,
  visibleFields,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onViewDetail,
}: ClinicalTableProps) {
  const [sortField, setSortField] = useState<string>('__date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }, [sortField]);

  const sortedEntries = useMemo(() => {
    const sorted = [...entries];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === '__date') {
        cmp = new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
      } else {
        const va = a.values[sortField];
        const vb = b.values[sortField];
        if (va === vb) cmp = 0;
        else if (va == null) cmp = -1;
        else if (vb == null) cmp = 1;
        else if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
        else cmp = String(va).localeCompare(String(vb));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [entries, sortField, sortDir]);

  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <Icon name="swap_vert" className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc'
      ? <Icon name="arrow_upward" className="h-3 w-3" />
      : <Icon name="arrow_downward" className="h-3 w-3" />;
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => onSelectAll(!!v)}
              />
            </TableHead>
            <TableHead className="w-28">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-0 py-0 font-medium text-xs gap-1 hover:bg-transparent"
                onClick={() => handleSort('__date')}
              >
                Fecha <SortIcon field="__date" />
              </Button>
            </TableHead>
            <TableHead className="w-8" />
            {visibleFields.map((meta) => (
              <TableHead key={meta.field.label}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-0 py-0 font-medium text-xs gap-1 hover:bg-transparent"
                  onClick={() => handleSort(meta.field.label)}
                >
                  {meta.shortLabel} <SortIcon field={meta.field.label} />
                </Button>
              </TableHead>
            ))}
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedEntries.map((entry) => {
            const isSelected = selectedIds.has(entry.id);
            const hasAlert = entry.alertSeverity;

            return (
              <TableRow
                key={entry.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  isSelected && 'bg-primary/5',
                  hasAlert === 'critical' && 'bg-red-50/50 dark:bg-red-950/20',
                  hasAlert === 'warning' && 'bg-amber-50/50 dark:bg-amber-950/20',
                )}
                onClick={() => onViewDetail(entry)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(entry.id)}
                  />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.submitted_at), "d MMM HH:mm", { locale: es })}
                </TableCell>
                <TableCell className="w-8">
                  {hasAlert === 'critical' && <Icon name="warning" className="h-3.5 w-3.5 text-red-500" />}
                  {hasAlert === 'warning' && <Icon name="error" className="h-3.5 w-3.5 text-amber-500" />}
                </TableCell>
                {visibleFields.map((meta) => {
                  const formatted = formatFieldForDisplay(meta, entry.values[meta.field.label]);
                  return (
                    <TableCell key={meta.field.label}>
                      <FieldCell formatted={formatted} />
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Icon name="visibility" className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
