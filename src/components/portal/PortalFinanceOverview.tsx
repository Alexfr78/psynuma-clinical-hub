import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, Banknote, CalendarClock, CheckCircle2, CreditCard, PackageCheck, ReceiptText, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { redirectTopLevel } from '@/lib/redirect';

export interface PortalDebt {
  id: string;
  amount: number;
  paidAmount: number;
  pendingAmount: number;
  dueDate: string | null;
  status: string | null;
  concept: string;
  paymentPath: string | null;
}

export interface PortalBono {
  id: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  remainingSessions: number;
  totalPrice: number;
  status: string | null;
  expiresAt: string | null;
}

export interface PortalPayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string | null;
  status: string;
  refundedAmount: number;
  concept: string;
}

export interface PortalFinanceData {
  debts: PortalDebt[];
  bonos: PortalBono[];
  payments: PortalPayment[];
}

interface PortalFinanceOverviewProps {
  data: PortalFinanceData;
  loading: boolean;
}

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function displayDate(value: string) {
  return format(new Date(`${value.slice(0, 10)}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: es });
}

function paymentMethodLabel(value: string | null) {
  const labels: Record<string, string> = {
    card: 'Tarjeta',
    stripe: 'Tarjeta',
    cash: 'Efectivo',
    bank_transfer: 'Transferencia',
    transfer: 'Transferencia',
  };
  return value ? labels[value] || value : 'Método no indicado';
}

export function PortalFinanceOverview({ data, loading }: PortalFinanceOverviewProps) {
  if (loading) {
    return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>;
  }

  const pendingDebts = data.debts.filter((debt) => debt.pendingAmount > 0 && !['paid', 'cancelled'].includes(debt.status || ''));
  const pendingTotal = pendingDebts.reduce((sum, debt) => sum + debt.pendingAmount, 0);
  const activeBonos = data.bonos.filter((bono) => bono.remainingSessions > 0 && bono.status !== 'cancelled');
  const remainingSessions = activeBonos.reduce((sum, bono) => sum + bono.remainingSessions, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de pagos y bonos">
        <Card><CardContent className="flex min-h-28 items-center gap-3 p-4"><div className="rounded-lg bg-destructive/10 p-3 text-destructive"><AlertCircle className="h-5 w-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">Pendiente</p><p className="text-xl font-semibold tabular-nums">{money.format(pendingTotal)}</p></div></CardContent></Card>
        <Card><CardContent className="flex min-h-28 items-center gap-3 p-4"><div className="rounded-lg bg-primary/10 p-3 text-primary"><PackageCheck className="h-5 w-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">Sesiones en bonos</p><p className="text-xl font-semibold tabular-nums">{remainingSessions}</p></div></CardContent></Card>
        <Card><CardContent className="flex min-h-28 items-center gap-3 p-4"><div className="rounded-lg bg-muted p-3 text-foreground"><ReceiptText className="h-5 w-5" aria-hidden="true" /></div><div><p className="text-sm text-muted-foreground">Pagos registrados</p><p className="text-xl font-semibold tabular-nums">{data.payments.length}</p></div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Banknote className="h-5 w-5 text-primary" aria-hidden="true" />Importes pendientes</CardTitle><CardDescription>Pagos que todavía están pendientes</CardDescription></CardHeader>
        <CardContent>
          {pendingDebts.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />No tienes pagos pendientes.</div>
          ) : (
            <div className="space-y-3">
              {pendingDebts.map((debt) => (
                <div key={debt.id} className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><p className="font-medium">{debt.concept}</p><p className="mt-1 text-sm text-muted-foreground">{debt.dueDate ? `Vencimiento: ${displayDate(debt.dueDate)}` : 'Sin fecha de vencimiento'}</p></div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end"><p className="text-lg font-semibold tabular-nums">{money.format(debt.pendingAmount)}</p>{debt.paymentPath && <Button className="min-h-11" onClick={() => redirectTopLevel(debt.paymentPath!)}><CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />Pagar</Button>}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><PackageCheck className="h-5 w-5 text-primary" aria-hidden="true" />Mis bonos</CardTitle><CardDescription>Sesiones disponibles y fecha de validez</CardDescription></CardHeader>
        <CardContent>
          {data.bonos.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No tienes bonos asociados.</p> : (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.bonos.map((bono) => {
                const percentage = bono.totalSessions > 0 ? Math.min(100, (bono.usedSessions / bono.totalSessions) * 100) : 0;
                return <div key={bono.id} className="rounded-xl border p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{bono.name}</p><p className="mt-1 text-sm text-muted-foreground">{bono.remainingSessions} de {bono.totalSessions} sesiones disponibles</p></div><Badge variant={bono.remainingSessions > 0 ? 'outline' : 'secondary'}>{bono.status || 'Activo'}</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Sesiones utilizadas de ${bono.name}`} aria-valuemin={0} aria-valuemax={bono.totalSessions} aria-valuenow={bono.usedSessions}><div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} /></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{money.format(bono.totalPrice)}</span>{bono.expiresAt && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />Hasta {displayDate(bono.expiresAt)}</span>}</div></div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" />Historial de pagos</CardTitle><CardDescription>Últimos pagos registrados por el centro</CardDescription></CardHeader>
        <CardContent>
          {data.payments.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay pagos registrados.</p> : (
            <div className="divide-y rounded-xl border">
              {data.payments.map((payment) => {
                const refunded = payment.refundedAmount > 0;
                return <div key={payment.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{payment.concept}</p>{refunded && <Badge variant="outline"><RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />Reembolso</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{displayDate(payment.paymentDate)} - {paymentMethodLabel(payment.paymentMethod)}</p></div><div className="text-left sm:text-right"><p className="font-semibold tabular-nums">{money.format(payment.amount)}</p>{refunded && <p className="text-xs text-muted-foreground">Reembolsado: {money.format(payment.refundedAmount)}</p>}</div></div>;
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
