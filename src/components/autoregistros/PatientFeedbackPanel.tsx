import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntryChart } from './EntryChart';
import { formatFieldValue } from '@/lib/autoregistro-format';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import type { PublicAutoregistroEntry } from '@/hooks/usePublicAutoregistro';
import { BarChart3 } from 'lucide-react';

interface PatientFeedbackPanelProps {
  entries: PublicAutoregistroEntry[];
  fields: AutoregistroField[];
  showDate?: boolean;
}

export function PatientFeedbackPanel({ entries, fields, showDate = true }: PatientFeedbackPanelProps) {
  const patientFields = useMemo(() => {
    return fields.filter((f) => f.patientVisible !== false);
  }, [fields]);

  const displayFields = useMemo(() => {
    return patientFields
      .filter((f) => ['number', 'scale', 'select', 'emotion_cards', 'text'].includes(f.type))
      .slice(0, 5);
  }, [patientFields]);

  const chartEntries = useMemo(() => {
    return entries.map((e) => ({
      ...e,
      values: e.values as Record<string, any>,
    }));
  }, [entries]);

  if (entries.length === 0) return null;

  const recentEntries = entries.slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <BarChart3 className="h-4 w-4" />
        <span>Mis registros anteriores</span>
      </div>

      <EntryChart entries={chartEntries as any} fields={patientFields} />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Últimos registros</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {showDate && <TableHead className="text-xs">Fecha</TableHead>}
                {displayFields.map((f) => (
                  <TableHead key={f.label} className="text-xs">{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEntries.map((entry) => (
                <TableRow key={entry.id}>
                  {showDate && (
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(entry.submitted_at), 'dd MMM HH:mm', { locale: es })}
                    </TableCell>
                  )}
                  {displayFields.map((f) => (
                    <TableCell key={f.label} className="text-xs">
                      {formatFieldValue(f, entry.values[f.label])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
