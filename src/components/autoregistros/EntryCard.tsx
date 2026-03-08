import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';

interface EntryCardProps {
  entry: AutoregistroEntry;
  onClick: () => void;
}

export function EntryCard({ entry, onClick }: EntryCardProps) {
  const fieldCount = Object.keys(entry.values || {}).length;

  return (
    <Card className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">
              {(entry.patient as any)?.first_name} {(entry.patient as any)?.last_name}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {(entry.template as any)?.name}
            </p>
          </div>
          <p className="text-xs text-muted-foreground shrink-0">
            {format(new Date(entry.submitted_at), 'dd MMM yyyy HH:mm', { locale: es })}
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {fieldCount} campo{fieldCount !== 1 ? 's' : ''} registrado{fieldCount !== 1 ? 's' : ''}
        </p>
      </CardContent>
    </Card>
  );
}
