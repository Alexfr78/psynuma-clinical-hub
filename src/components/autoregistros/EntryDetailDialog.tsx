import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { formatFieldValue } from '@/lib/autoregistro-format';
import { normalizeAutoregistroFields, getScaleMax } from '@/lib/autoregistro-fields';

interface EntryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: AutoregistroEntry | null;
}

export function EntryDetailDialog({ open, onOpenChange, entry }: EntryDetailDialogProps) {
  if (!entry) return null;

  const rawFields: AutoregistroField[] = (entry.template as any)?.fields ?? [];
  const fields = normalizeAutoregistroFields(rawFields);
  const sorted = [...fields].sort((a, b) => a.order - b.order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del registro</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 mb-4">
          <p className="text-sm font-medium">
            {(entry.patient as any)?.first_name} {(entry.patient as any)?.last_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {(entry.template as any)?.name} · {format(new Date(entry.submitted_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
          </p>
        </div>

        <div className="space-y-3">
          {sorted.map((field) => (
            <div key={field.label} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{field.label}</span>
              <span className="text-sm font-medium">
                {field.type === 'scale' ? (
                  <Badge variant="outline">{entry.values[field.label] ?? '—'} / {getScaleMax(field)}</Badge>
                ) : (
                  formatFieldValue(field, entry.values[field.label])
                )}
              </span>
            </div>
          ))}

          {/* Show any values not in template fields */}
          {Object.keys(entry.values)
            .filter((k) => !sorted.some((f) => f.label === k))
            .map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">{key}</span>
                <span className="text-sm">{String(entry.values[key])}</span>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
