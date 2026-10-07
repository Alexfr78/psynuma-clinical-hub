import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useSetPatientBookingBlock } from '@/hooks/usePatientStatus';
import { Icon } from '@/components/ui/icon';

interface PatientBookingBlockToggleProps {
  patientId: string;
  blocked: boolean;
}

export function PatientBookingBlockToggle({ patientId, blocked }: PatientBookingBlockToggleProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const setBlock = useSetPatientBookingBlock();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setReason('');
  };

  const handleConfirm = async () => {
    await setBlock.mutateAsync({ patientId, blocked: !blocked, reason });
    handleOpenChange(false);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={setBlock.isPending}
        className="gap-2"
      >
        {setBlock.isPending ? (
          <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
        ) : (
          <Icon name={blocked ? 'event_available' : 'event_busy'} className="h-4 w-4" />
        )}
        {blocked ? 'Desbloquear reservas' : 'Bloquear reservas'}
      </Button>

      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {blocked ? '¿Desbloquear las reservas online?' : '¿Bloquear las reservas online?'}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {blocked ? (
                  <p>El contacto podrá volver a reservar y reprogramar citas desde la web, el portal y los enlaces de cita.</p>
                ) : (
                  <>
                    <p>
                      El contacto no podrá reservar ni reprogramar citas desde la web, el portal ni los enlaces de cita.
                      Verá un mensaje neutro pidiéndole que contacte con el centro; no se le dirá que está bloqueado.
                    </p>
                    <p>
                      Seguirá pudiendo entrar al portal para ver facturas y documentos. Sus citas ya reservadas no se
                      cancelan: hazlo desde la agenda si no vas a atenderlas.
                    </p>
                    <p>
                      Si alguien reserva con otro email pero con su mismo teléfono o nombre completo, la cita quedará
                      pendiente de tu aprobación.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!blocked && (
            <div className="space-y-2">
              <Label htmlFor="booking-block-reason">Motivo (solo interno, opcional)</Label>
              <Textarea
                id="booking-block-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {blocked ? 'Desbloquear' : 'Bloquear reservas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
