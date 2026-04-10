import { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Calendar,
  Clock,
  User,
  FileText,
  AlertTriangle,
  AlertCircle,
  Check,
  X,
  StickyNote,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';
import {
  buildFieldDisplayMetas,
  formatFieldForDisplay,
  type FieldDisplayMeta,
  type FormattedFieldValue,
} from '@/lib/autoregistro-field-display';

interface EntryDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: AutoregistroEntry | null;
  /** Pre-built metas from parent if available (avoids rebuilding) */
  fieldMetas?: FieldDisplayMeta[];
}

/**
 * Renders a single field value in detail mode — no truncation, no tooltips.
 * Long text fields are shown in full within a readable block.
 */
function DetailFieldValue({
  meta,
  formatted,
}: {
  meta: FieldDisplayMeta;
  formatted: FormattedFieldValue;
}) {
  if (formatted.raw === undefined || formatted.raw === null || formatted.raw === '') {
    return <span className="text-sm text-muted-foreground italic">Sin respuesta</span>;
  }

  switch (formatted.type) {
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          {formatted.raw ? (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Sí</span>
            </>
          ) : (
            <>
              <X className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">No</span>
            </>
          )}
        </div>
      );

    case 'scale': {
      const pct = formatted.scaleMax && formatted.scaleMax > 0
        ? ((formatted.numericValue ?? 0) - (formatted.scaleMin ?? 0)) /
          (formatted.scaleMax - (formatted.scaleMin ?? 0))
        : 0;
      const color =
        pct > 0.75 ? 'bg-red-400 dark:bg-red-600' :
        pct > 0.5 ? 'bg-amber-400 dark:bg-amber-600' :
        pct > 0.25 ? 'bg-blue-400 dark:bg-blue-600' :
        'bg-green-400 dark:bg-green-600';
      return (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', color)}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <span className="text-sm tabular-nums font-semibold shrink-0">
            {formatted.numericValue}
            <span className="text-muted-foreground font-normal"> / {formatted.scaleMax}</span>
          </span>
        </div>
      );
    }

    case 'emotion':
      return (
        <Badge variant="secondary" className="text-sm font-normal">
          {formatted.text}
        </Badge>
      );

    case 'select':
      return (
        <Badge variant="outline" className="text-sm font-normal">
          {formatted.text}
        </Badge>
      );

    case 'text-long':
      return (
        <div className="text-sm whitespace-pre-wrap break-words rounded-md bg-muted/40 border border-dashed px-3 py-2 leading-relaxed">
          {String(formatted.raw)}
        </div>
      );

    case 'number':
      return <span className="text-sm font-medium tabular-nums">{formatted.text}</span>;

    case 'date':
    case 'time':
      return <span className="text-sm font-medium">{formatted.text}</span>;

    default:
      return <span className="text-sm">{String(formatted.raw)}</span>;
  }
}

export function EntryDetailDrawer({
  open,
  onOpenChange,
  entry,
  fieldMetas,
}: EntryDetailDrawerProps) {
  const isMobile = useIsMobile();

  // Build metas from entry template if not provided
  const metas = useMemo<FieldDisplayMeta[]>(() => {
    if (fieldMetas && fieldMetas.length > 0) return fieldMetas;
    if (!entry) return [];
    const rawFields: AutoregistroField[] = (entry.template as any)?.fields ?? [];
    const fields = normalizeAutoregistroFields(rawFields);
    return buildFieldDisplayMetas(fields);
  }, [entry, fieldMetas]);

  // Extra values in entry.values that are not in the template (backwards compat)
  const extraKeys = useMemo(() => {
    if (!entry) return [];
    const templateLabels = new Set(metas.map((m) => m.field.label));
    return Object.keys(entry.values).filter((k) => !templateLabels.has(k));
  }, [entry, metas]);

  if (!entry) return null;

  const patient = (entry.patient as any) ?? {};
  const template = (entry.template as any) ?? {};
  const submittedAt = new Date(entry.submitted_at);
  const alertSeverity = entry.alertSeverity;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'p-0 flex flex-col gap-0',
          isMobile ? 'max-h-[92vh] h-[92vh]' : 'w-full sm:max-w-xl sm:w-[560px]',
        )}
      >
        {/* Header */}
        <SheetHeader
          className={cn(
            'px-5 pt-5 pb-4 border-b text-left shrink-0 space-y-2',
            alertSeverity === 'critical' && 'bg-red-50/60 dark:bg-red-950/30',
            alertSeverity === 'warning' && 'bg-amber-50/60 dark:bg-amber-950/30',
          )}
        >
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base flex items-center gap-2">
                {alertSeverity === 'critical' && (
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                )}
                {alertSeverity === 'warning' && (
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                Detalle del registro
              </SheetTitle>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {patient.first_name} {patient.last_name ?? ''}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{template.name ?? '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {format(submittedAt, "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {format(submittedAt, 'HH:mm', { locale: es })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">
            {metas.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                Esta plantilla no tiene campos definidos.
              </p>
            )}

            {metas.map((meta) => {
              const value = entry.values[meta.field.label];
              const formatted = formatFieldForDisplay(meta, value, Number.MAX_SAFE_INTEGER);
              return (
                <div key={meta.field.label} className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {meta.field.label}
                    </label>
                    {meta.field.required && (
                      <span className="text-[10px] text-muted-foreground/60">
                        obligatorio
                      </span>
                    )}
                  </div>
                  <div>
                    <DetailFieldValue meta={meta} formatted={formatted} />
                  </div>
                </div>
              );
            })}

            {/* Extra legacy values not in template */}
            {extraKeys.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Otros datos
                  </p>
                  {extraKeys.map((key) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-muted-foreground">{key}</label>
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {String(entry.values[key])}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Clinical notes slot — placeholder for future integration */}
            <Separator />
            <div className="space-y-2 rounded-md border border-dashed bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <StickyNote className="h-3.5 w-3.5" />
                <p className="text-xs font-medium uppercase tracking-wide">
                  Notas clínicas del terapeuta
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Las notas clínicas se mostrarán aquí cuando estén disponibles.
              </p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
