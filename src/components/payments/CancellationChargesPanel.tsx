import { AlertTriangle, Calendar, CheckCircle2, Loader2, User, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CancellationCharge,
  useCancellationCharges,
  useConfirmCancellationCharge,
  useForgiveCancellationCharge,
} from '@/hooks/useCancellationCharges';

function patientName(charge: CancellationCharge) {
  return `${charge.patients?.first_name || ''} ${charge.patients?.last_name || ''}`.trim() || 'Paciente';
}

function sessionLabel(charge: CancellationCharge) {
  if (!charge.sessions?.session_date) return 'Cita cancelada';
  const date = format(new Date(charge.sessions.session_date), "d MMM yyyy", { locale: es });
  const time = charge.sessions.start_time?.slice(0, 5);
  return `${date}${time ? ` · ${time}` : ''}`;
}

export function CancellationChargesPanel() {
  const { data: charges = [], isLoading } = useCancellationCharges();
  const confirmCharge = useConfirmCancellationCharge();
  const forgiveCharge = useForgiveCancellationCharge();
  const isMutating = confirmCharge.isPending || forgiveCharge.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando cancelaciones pendientes...
      </div>
    );
  }

  if (charges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-semibold">Sin cancelaciones pendientes</h3>
        <p className="text-sm text-muted-foreground">
          No hay cargos por cancelación esperando revisión.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {charges.map((charge) => (
        <Card key={charge.id}>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Pendiente de revisión
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Creado {format(new Date(charge.created_at), "d MMM yyyy · HH:mm", { locale: es })}
                  </span>
                  <span className="font-semibold">{charge.amount.toFixed(2)} EUR</span>
                  <span className="text-sm text-muted-foreground">
                    {charge.percentage}% de {charge.base_session_price.toFixed(2)} EUR
                  </span>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    {patientName(charge)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {sessionLabel(charge)}
                  </span>
                </div>

                <p className="text-sm">{charge.concept}</p>
                {charge.review_note && (
                  <p className="text-xs text-muted-foreground">{charge.review_note}</p>
                )}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                <Button
                  variant="outline"
                  onClick={() => forgiveCharge.mutate(charge.id)}
                  disabled={isMutating}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Perdonar
                </Button>
                <Button
                  onClick={() => confirmCharge.mutate(charge)}
                  disabled={isMutating}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Generar deuda
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
