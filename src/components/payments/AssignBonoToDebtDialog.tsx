import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle, Calendar, Loader2, Package } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useApplyBonoToSession, usePatientActiveBonos } from '@/hooks/useBonos';
import type { DebtWithRelations } from '@/hooks/useDebts';
import { toast } from 'sonner';

interface AssignBonoToDebtDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debt: DebtWithRelations | null;
}

function isDebtAssignableToBono(debt: DebtWithRelations | null) {
  if (!debt) return false;
  return (
    !!debt.session_id &&
    !debt.bono_id &&
    !debt.invoice_id &&
    Number(debt.paid_amount || 0) === 0 &&
    debt.status === 'pending'
  );
}

export function AssignBonoToDebtDialog({ open, onOpenChange, debt }: AssignBonoToDebtDialogProps) {
  const [selectedBonoId, setSelectedBonoId] = useState('');
  const { data: bonos = [], isLoading } = usePatientActiveBonos(open ? debt?.patient_id : undefined);
  const applyBonoToSession = useApplyBonoToSession();

  const canAssign = isDebtAssignableToBono(debt);
  const patientName = debt ? `${debt.patients.first_name} ${debt.patients.last_name}` : '';
  const sessionDate = debt?.sessions?.session_date
    ? format(new Date(debt.sessions.session_date), "d 'de' MMMM yyyy", { locale: es })
    : null;
  const pendingAmount = debt ? Number(debt.amount) - Number(debt.paid_amount || 0) : 0;

  const selectedBono = useMemo(
    () => bonos.find((bono) => bono.id === selectedBonoId),
    [bonos, selectedBonoId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedBonoId('');
      return;
    }
    if (bonos.length > 0 && !selectedBonoId) {
      setSelectedBonoId(bonos[0].id);
    }
  }, [bonos, open, selectedBonoId]);

  const handleClose = (nextOpen: boolean) => {
    if (applyBonoToSession.isPending) return;
    onOpenChange(nextOpen);
  };

  const handleAssign = async () => {
    if (!debt?.session_id || !selectedBonoId || !canAssign) return;

    await applyBonoToSession.mutateAsync({
      bonoId: selectedBonoId,
      sessionId: debt.session_id,
    });

    toast.success('Bono asignado', {
      description: 'La sesión se ha liquidado con el bono seleccionado.',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Asignar bono
          </DialogTitle>
          <DialogDescription>
            Liquida esta deuda consumiendo una sesión de un bono activo del contacto.
          </DialogDescription>
        </DialogHeader>

        {debt && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="font-medium">{patientName}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {sessionDate && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {sessionDate}
                  </span>
                )}
                <span>Pendiente: {pendingAmount.toFixed(2)}€</span>
              </div>
            </div>

            {!canAssign && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Esta deuda no se puede liquidar con bono porque tiene factura, pagos parciales o no pertenece a una sesión pendiente.
                </AlertDescription>
              </Alert>
            )}

            {canAssign && (
              <div className="space-y-2">
                <Label htmlFor="bono-select">Bono disponible</Label>
                <Select
                  value={selectedBonoId}
                  onValueChange={setSelectedBonoId}
                  disabled={isLoading || applyBonoToSession.isPending || bonos.length === 0}
                >
                  <SelectTrigger id="bono-select">
                    <SelectValue placeholder={isLoading ? 'Cargando bonos...' : 'Seleccionar bono'} />
                  </SelectTrigger>
                  <SelectContent>
                    {bonos.map((bono) => {
                      const remaining = (bono.total_sessions || 0) - (bono.used_sessions || 0);
                      return (
                        <SelectItem key={bono.id} value={bono.id}>
                          {bono.name} · {remaining} sesiones restantes
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedBono && (
                  <p className="text-xs text-muted-foreground">
                    Se descontará 1 sesión de este bono y la deuda dejará de aparecer como pendiente.
                  </p>
                )}
              </div>
            )}

            {canAssign && !isLoading && bonos.length === 0 && (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  Este contacto no tiene bonos activos con sesiones disponibles.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={applyBonoToSession.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!canAssign || !selectedBonoId || bonos.length === 0 || applyBonoToSession.isPending}
          >
            {applyBonoToSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Asignar bono
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
