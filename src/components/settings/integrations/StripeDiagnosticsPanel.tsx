import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useStripeDiagnostics, type StripeDiagnosticEntry } from '@/hooks/useStripeDiagnostics';
import { Icon } from '@/components/ui/icon';

const CODE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  webhook_repeated_failure: {
    label: 'Webhook con fallos repetidos',
    icon: <Icon name="gpp_maybe" className="h-4 w-4 text-red-600" />,
  },
  refund_payment_not_found: {
    label: 'Reembolso sin pago local',
    icon: <Icon name="restart_alt" className="h-4 w-4 text-amber-600" />,
  },
  bono_refund_needs_review: {
    label: 'Bono reembolsado a revisar',
    icon: <Icon name="warning" className="h-4 w-4 text-amber-600" />,
  },
  bono_partial_refund_needs_review: {
    label: 'Bono con reembolso parcial a revisar',
    icon: <Icon name="warning" className="h-4 w-4 text-amber-600" />,
  },
};

function metaFor(entry: StripeDiagnosticEntry) {
  return (
    (entry.error_code && CODE_META[entry.error_code]) || {
      label: entry.error_code || 'Incidencia',
      icon: <Icon name="warning" className="h-4 w-4 text-muted-foreground" />,
    }
  );
}

export function StripeDiagnosticsPanel() {
  const { data: entries, isLoading, isRefetching, refetch } = useStripeDiagnostics();

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-medium">Diagnóstico de pagos</p>
          <p className="text-xs text-muted-foreground">
            Avisos recientes de la integración de Stripe (reembolsos y webhooks)
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading || isRefetching}
          title="Actualizar"
        >
          <Icon name="refresh" className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !entries || entries.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Icon name="check_circle" className="h-4 w-4 text-green-600" />
            Sin incidencias recientes.
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => {
              const meta = metaFor(entry);
              return (
                <li key={entry.id} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.at), "d MMM yyyy, HH:mm", { locale: es })}
                      </span>
                    </div>
                    {entry.message && (
                      <p className="mt-1 break-words text-sm text-muted-foreground">{entry.message}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
