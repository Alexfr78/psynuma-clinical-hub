import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';

interface EntryCardProps {
  entry: AutoregistroEntry;
  onClick: () => void;
  alertSeverity?: 'critical' | 'warning' | null;
}

export function EntryCard({ entry, onClick, alertSeverity }: EntryCardProps) {
  const severity = alertSeverity ?? entry.alertSeverity;
  const fieldCount = Object.keys(entry.values || {}).length;

  return (
    <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {(entry.patient as { first_name?: string; last_name?: string })?.first_name} {(entry.patient as { first_name?: string; last_name?: string })?.last_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {(entry.template as { name?: string })?.name}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {severity === 'critical' && (
              <Badge className="bg-red-500 text-white text-xs hover:bg-red-500">Alerta</Badge>
            )}
            {severity === 'warning' && (
              <Badge className="bg-amber-500 text-white text-xs hover:bg-amber-500">Aviso</Badge>
            )}
            <p className="text-xs text-muted-foreground">
              {format(new Date(entry.submitted_at), 'dd MMM yyyy HH:mm', { locale: es })}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {fieldCount} campo{fieldCount !== 1 ? 's' : ''} registrado{fieldCount !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
}
