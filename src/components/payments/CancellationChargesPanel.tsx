import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Loader2, User, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

function CancellationChargeList({ status }: { status: CancellationCharge['status'] }) {
  const { data: charges = [], isLoading } = useCancellationCharges(status);
  const confirmCharge = useConfirmCancellationCharge();
  const forgiveCharge = useForgiveCancellationCharge();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const isMutating = confirmCharge.isPending || forgiveCharge.isPending;
  const isPendingReview = status === 'pending_review';

  useEffect(() => {
    setAmounts((current) => {
      const next = { ...current };
      charges.forEach((charge) => {
        if (next[charge.id] === undefined) next[charge.id] = charge.amount.toFixed(2);
      });
      return next;
    });
    setNotes((current) => {
      const next = { ...current };
      charges.forEach((charge) => {
        if (next[charge.id] === undefined) next[charge.id] = charge.review_note || '';
      });
      return next;
    });
  }, [charges]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-lg border py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Cargando cancelaciones...
      </div>
    );
  }

  if (charges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-semibold">Sin cancelaciones</h3>
        <p className="text-sm text-muted-foreground">
          No hay cargos por cancelación en esta vista.
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
                    {status === 'pending_review' ? 'Pendiente de revisión' : status === 'confirmed' ? 'Deuda generada' : 'Perdonado'}
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
                {isPendingReview ? (
                  <div className="grid gap-3 pt-2 md:grid-cols-[160px_1fr]">
                    <div className="space-y-1.5">
                      <Label htmlFor={`charge-amount-${charge.id}`} className="text-xs">
                        Importe a generar
                      </Label>
                      <Input
                        id={`charge-amount-${charge.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={amounts[charge.id] ?? charge.amount.toFixed(2)}
                        onChange={(event) => setAmounts((current) => ({
                          ...current,
                          [charge.id]: event.target.value,
                        }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`charge-note-${charge.id}`} className="text-xs">
                        Nota de resolución
                      </Label>
                      <Textarea
                        id={`charge-note-${charge.id}`}
                        rows={2}
                        value={notes[charge.id] ?? ''}
                        onChange={(event) => setNotes((current) => ({
                          ...current,
                          [charge.id]: event.target.value,
                        }))}
                        placeholder="Motivo de la decisión, ajuste aplicado..."
                      />
                    </div>
                  </div>
                ) : charge.review_note ? (
                  <p className="text-xs text-muted-foreground">{charge.review_note}</p>
                ) : null}
              </div>

              {isPendingReview && (
                <div className="flex flex-col gap-2 sm:flex-row lg:shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => forgiveCharge.mutate({
                      chargeId: charge.id,
                      reviewNote: notes[charge.id],
                    })}
                    disabled={isMutating}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Perdonar
                  </Button>
                  <Button
                    onClick={() => confirmCharge.mutate({
                      charge,
                      amount: Number(amounts[charge.id] ?? charge.amount),
                      reviewNote: notes[charge.id],
                    })}
                    disabled={isMutating || Number(amounts[charge.id] ?? charge.amount) <= 0}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Generar deuda
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function CancellationChargesPanel() {
  const { data: pendingCharges = [] } = useCancellationCharges('pending_review');

  return (
    <Tabs defaultValue="pending" className="space-y-4">
      <TabsList>
        <TabsTrigger value="pending">
          Pendientes
          {pendingCharges.length > 0 && (
            <span className="ml-1 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] leading-none text-destructive-foreground">
              {pendingCharges.length}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="confirmed">Generadas</TabsTrigger>
        <TabsTrigger value="forgiven">Perdonadas</TabsTrigger>
      </TabsList>

      <TabsContent value="pending">
        <CancellationChargeList status="pending_review" />
      </TabsContent>
      <TabsContent value="confirmed">
        <CancellationChargeList status="confirmed" />
      </TabsContent>
      <TabsContent value="forgiven">
        <CancellationChargeList status="forgiven" />
      </TabsContent>
    </Tabs>
  );
}
