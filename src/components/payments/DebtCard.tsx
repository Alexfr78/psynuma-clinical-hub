import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, User, FileText, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DebtWithRelations } from '@/hooks/useDebts';

interface DebtCardProps {
  debt: DebtWithRelations;
  onRecordPayment?: (debtInfo: {
    debtId: string;
    patientId: string;
    pendingAmount: number;
    description?: string;
  }) => void;
}

const statusConfig = {
  pending: { label: 'Pendiente', variant: 'destructive' as const },
  partial: { label: 'Parcial', variant: 'default' as const },
  paid: { label: 'Pagada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'secondary' as const },
};

export function DebtCard({ debt, onRecordPayment }: DebtCardProps) {
  const status = statusConfig[debt.status] || statusConfig.pending;
  const remaining = Number(debt.amount) - Number(debt.paid_amount);
  const isOverdue = debt.due_date && new Date(debt.due_date) < new Date();

  return (
    <Card className={isOverdue ? 'border-destructive/50' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-lg p-2 ${isOverdue ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <AlertCircle className={`h-5 w-5 ${isOverdue ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">
                  {debt.patients.first_name} {debt.patients.last_name}
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              
              {debt.invoices && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <FileText className="h-3 w-3" />
                  <span>Factura: {debt.invoices.invoice_number}</span>
                </div>
              )}

              {debt.due_date && (
                <div className="flex items-center gap-1 text-sm mt-1">
                  <Clock className="h-3 w-3" />
                  <span className={isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                    {isOverdue ? 'Vencida: ' : 'Vence: '}
                    {format(new Date(debt.due_date), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-1">
                Creada: {format(new Date(debt.created_at), "d MMM yyyy", { locale: es })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-bold text-destructive">{remaining.toFixed(2)}€</p>
              {Number(debt.paid_amount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total: {Number(debt.amount).toFixed(2)}€ · Pagado: {Number(debt.paid_amount).toFixed(2)}€
                </p>
              )}
            </div>
            
            {(debt.status === 'pending' || debt.status === 'partial') && (
              <Button onClick={() => onRecordPayment?.({
                debtId: debt.id,
                patientId: debt.patient_id,
                pendingAmount: remaining,
                description: debt.notes || undefined,
              })}>
                Registrar pago
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
