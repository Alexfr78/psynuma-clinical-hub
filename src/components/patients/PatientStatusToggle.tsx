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

import { useSetPatientDischarged, useRemovePatientDischarged } from '@/hooks/usePatientStatus';
import { Icon } from '@/components/ui/icon';

interface PatientStatusToggleProps {
  patientId: string;
  currentStatus: 'active' | 'inactive' | 'discharged' | string;
  statusSource?: 'manual' | 'auto' | string | null;
}

export function PatientStatusToggle({ 
  patientId, 
  currentStatus, 
  statusSource 
}: PatientStatusToggleProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const setDischarged = useSetPatientDischarged();
  const removeDischarged = useRemovePatientDischarged();

  const isDischargedManual = currentStatus === 'discharged' && statusSource === 'manual';
  const isPending = setDischarged.isPending || removeDischarged.isPending;

  const handleClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirm = async () => {
    if (isDischargedManual) {
      await removeDischarged.mutateAsync(patientId);
    } else {
      await setDischarged.mutateAsync(patientId);
    }
    setShowConfirmDialog(false);
  };

  return (
    <>
      <Button
        variant={isDischargedManual ? "outline" : "secondary"}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="gap-2"
      >
        {isPending ? (
          <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
        ) : isDischargedManual ? (
          <Icon name="restart_alt" className="h-4 w-4" />
        ) : (
          <Icon name="how_to_reg" className="h-4 w-4" />
        )}
        {isDischargedManual ? 'Quitar Alta' : 'Marcar Alta'}
      </Button>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isDischargedManual 
                ? '¿Quitar estado de Alta?' 
                : '¿Marcar contacto como Alta?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isDischargedManual 
                ? 'El estado del contacto volverá a calcularse automáticamente en base a su actividad (citas futuras y sesiones recientes).'
                : 'El contacto quedará marcado como Alta de forma manual. Este estado no se modificará automáticamente hasta que lo quites.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {isDischargedManual ? 'Quitar Alta' : 'Marcar Alta'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
