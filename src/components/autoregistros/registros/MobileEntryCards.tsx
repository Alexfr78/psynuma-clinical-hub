import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertTriangle, AlertCircle, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { FieldDisplayMeta } from '@/lib/autoregistro-field-display';
import { formatFieldForDisplay } from '@/lib/autoregistro-field-display';

interface MobileEntryCardsProps {
  entries: AutoregistroEntry[];
  visibleFields: FieldDisplayMeta[];
  allFields: FieldDisplayMeta[];
  onViewDetail: (entry: AutoregistroEntry) => void;
}

function MobileFieldValue({ meta, value }: { meta: FieldDisplayMeta; value: any }) {
  const formatted = formatFieldForDisplay(meta, value, 80);

  if (formatted.type === 'boolean') {
    return formatted.raw ? (
      <Check className="h-4 w-4 text-green-600" />
    ) : (
      <X className="h-4 w-4 text-muted-foreground/40" />
    );
  }

  if (formatted.type === 'scale') {
    const pct = formatted.scaleMax && formatted.scaleMax > 0
      ? ((formatted.numericValue ?? 0) - (formatted.scaleMin ?? 0)) / (formatted.scaleMax - (formatted.scaleMin ?? 0))
      : 0;
    return (
      <div className="flex items-center gap-1.5">
        <div className="w-10 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full',
              pct > 0.75 ? 'bg-red-300' : pct > 0.5 ? 'bg-amber-300' : pct > 0.25 ? 'bg-blue-300' : 'bg-green-300',
            )}
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <span className="text-xs tabular-nums font-medium">{formatted.text}</span>
      </div>
    );
  }

  if (formatted.type === 'emotion' || formatted.type === 'select') {
    return <Badge variant="secondary" className="text-xs font-normal">{formatted.text}</Badge>;
  }

  return <span className="text-sm font-medium">{formatted.text}</span>;
}

function EntryCard({
  entry,
  visibleFields,
  allFields,
  onViewDetail,
}: {
  entry: AutoregistroEntry;
  visibleFields: FieldDisplayMeta[];
  allFields: FieldDisplayMeta[];
  onViewDetail: (entry: AutoregistroEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Show primary fields collapsed, all non-detail fields expanded
  const expandableFields = allFields.filter(
    (m) => !m.detailOnly && !visibleFields.some((v) => v.field.label === m.field.label),
  );

  const hasAlert = entry.alertSeverity;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-colors',
        hasAlert === 'critical' && 'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-950/20',
        hasAlert === 'warning' && 'border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20',
      )}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-muted/30 cursor-pointer"
        onClick={() => onViewDetail(entry)}
      >
        <div className="flex items-center gap-2">
          {hasAlert === 'critical' && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
          {hasAlert === 'warning' && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
          <span className="text-xs font-medium text-muted-foreground">
            {format(new Date(entry.submitted_at), "d MMM yyyy · HH:mm", { locale: es })}
          </span>
        </div>
      </div>

      {/* Primary fields (always visible) */}
      <div className="px-3 py-2 space-y-1.5">
        {visibleFields.map((meta) => (
          <div key={meta.field.label} className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground shrink-0 max-w-[40%] truncate">
              {meta.shortLabel}
            </span>
            <div className="flex-1 flex justify-end">
              <MobileFieldValue meta={meta} value={entry.values[meta.field.label]} />
            </div>
          </div>
        ))}
      </div>

      {/* Expandable secondary fields */}
      {expandableFields.length > 0 && (
        <>
          {expanded && (
            <div className="px-3 pb-2 space-y-1.5 border-t border-dashed pt-2">
              {expandableFields.map((meta) => (
                <div key={meta.field.label} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground shrink-0 max-w-[40%] truncate">
                    {meta.shortLabel}
                  </span>
                  <div className="flex-1 flex justify-end">
                    <MobileFieldValue meta={meta} value={entry.values[meta.field.label]} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs text-muted-foreground gap-1 rounded-none"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? (
                <><ChevronUp className="h-3 w-3" /> Menos campos</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> +{expandableFields.length} campos</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function MobileEntryCards({
  entries,
  visibleFields,
  allFields,
  onViewDetail,
}: MobileEntryCardsProps) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          visibleFields={visibleFields}
          allFields={allFields}
          onViewDetail={onViewDetail}
        />
      ))}
    </div>
  );
}
