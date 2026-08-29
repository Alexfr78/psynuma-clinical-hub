import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { DebtWithRelations } from '@/hooks/useDebts';
import { getDebtStatusDisplay } from '@/lib/payment-status';
import { Icon } from '@/components/ui/icon';

interface DebtCardProps {
  debt: DebtWithRelations;
  onRecordPayment?: (debtInfo: {
    debtId: string;
    patientId: string;
    pendingAmount: number;
    description?: string;
  }) => void;
  onDelete?: (debtId: string) => void;
  onSendReminder?: (debt: DebtWithRelations) => void;
  onAssignBono?: (debt: DebtWithRelations) => void;
}

export function DebtCard({ debt, onRecordPayment, onDelete, onSendReminder, onAssignBono }: DebtCardProps) {
  const navigate = useNavigate();
  const status = getDebtStatusDisplay(debt.status);
  const remaining = Number(debt.amount) - Number(debt.paid_amount);
  const isOverdue = debt.due_date && new Date(debt.due_date) < new Date();
  const canAssignBono =
    !!debt.session_id &&
    !debt.bono_id &&
    !debt.invoice_id &&
    Number(debt.paid_amount || 0) === 0 &&
    debt.status === 'pending';

  return (
    <Card className={isOverdue ? 'border-destructive/50' : ''}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${isOverdue ? 'bg-destructive/10' : 'bg-primary/10'}`}>
                <Icon name="error" className={`h-5 w-5 ${isOverdue ? 'text-destructive' : 'text-primary'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon name="person" className="h-4 w-4 text-muted-foreground" />
                  <span
                    className="font-semibold hover:text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/pacientes/${debt.patient_id}`);
                    }}
                  >
                    {debt.patients.first_name} {debt.patients.last_name}
                  </span>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                {debt.invoices && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <Icon name="description" className="h-3 w-3" />
                    <span>
                      Factura:{' '}
                      <span
                        className="hover:text-primary hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/facturas?invoiceId=${debt.invoice_id}`);
                        }}
                      >
                        {debt.invoices.invoice_number}
                      </span>
                    </span>
                  </div>
                )}

                {debt.due_date && (
                  <div className="flex items-center gap-1 text-sm mt-1">
                    <Icon name="schedule" className="h-3 w-3" />
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

            <div className="text-right sm:text-right">
              <p className="text-xl font-bold text-destructive">{remaining.toFixed(2)}€</p>
              {Number(debt.paid_amount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Total: {Number(debt.amount).toFixed(2)}€ · Pagado: {Number(debt.paid_amount).toFixed(2)}€
                </p>
              )}
            </div>
          </div>
          
          {(debt.status === 'pending' || debt.status === 'partial') && (
            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t mt-2">
              {onSendReminder && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onSendReminder(debt)}
                >
                  <Icon name="chat" className="h-4 w-4 mr-2" />
                  Recordar
                </Button>
              )}
              {canAssignBono && onAssignBono && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onAssignBono(debt)}
                >
                  <Icon name="package_2" className="h-4 w-4 mr-2" />
                  Asignar bono
                </Button>
              )}
              <Button 
                size="sm"
                onClick={() => onRecordPayment?.({
                  debtId: debt.id,
                  patientId: debt.patient_id,
                  pendingAmount: remaining,
                  description: debt.notes || undefined,
                })}
              >
                Registrar pago
              </Button>
              {onDelete && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => onDelete(debt.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Icon name="delete" className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
