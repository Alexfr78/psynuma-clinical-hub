import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
  /** Optional: other entries (same patient) to render a mini-sparkline per numeric field */
  allEntries?: AutoregistroEntry[];
}

export function EntryDetailDialog({ open, onOpenChange, entry, allEntries }: EntryDetailDialogProps) {
  const rawFields: AutoregistroField[] = (entry?.template as { fields?: AutoregistroField[] })?.fields ?? [];
  const fields = normalizeAutoregistroFields(rawFields);
  const sorted = useMemo(() => [...fields].sort((a, b) => a.order - b.order), [fields]);

  // History per field (only same template, sorted asc)
  const history = useMemo(() => {
    if (!entry || !allEntries) return [];
    return allEntries
      .filter((e) => e.template_id === entry.template_id)
      .slice()
      .sort((a, b) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
  }, [entry, allEntries]);

  if (!entry) return null;

  const renderSparkline = (field: AutoregistroField) => {
    if (history.length < 2) return null;
    if (field.type !== 'number' && field.type !== 'scale') return null;
    const data = history
      .map((e) => {
        const v = e.values?.[field.label];
        if (v === undefined || v === null) return null;
        return {
          date: format(new Date(e.submitted_at), 'dd/MM', { locale: es }),
          v: Number(v),
        };
      })
      .filter(Boolean) as { date: string; v: number }[];
    if (data.length < 2) return null;
    return (
      <div className="h-16 w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ fontSize: 11, padding: '4px 6px' }}
              labelStyle={{ fontSize: 11 }}
            />
            <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalle del registro</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 mb-4">
          <p className="text-sm font-medium">
            {(entry.patient as { first_name?: string; last_name?: string })?.first_name} {(entry.patient as { first_name?: string; last_name?: string })?.last_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {(entry.template as { name?: string })?.name} · {format(new Date(entry.submitted_at), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
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
              {renderSparkline(field)}
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
