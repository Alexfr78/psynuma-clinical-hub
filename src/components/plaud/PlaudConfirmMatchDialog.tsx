import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Icon } from '@/components/ui/icon';

export interface PlaudConfirmMatchTarget {
  patientFirstName: string;
  patientLastName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

interface PlaudConfirmMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PlaudConfirmMatchTarget | null;
  /** Si hay riesgo de mezcla (varias sesiones o solape), exige una casilla extra antes de confirmar. */
  requiresExtraConfirmation: boolean;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/**
 * Último paso antes de escribir `patient_id` en una grabación. Es la puerta que evita que
 * un clic accidental mande el contenido de un paciente a la ficha de otro: cuando la
 * grabación tiene sospecha de varias sesiones o de solape con otra, no basta con el botón
 * de confirmar — hay que marcar explícitamente que se ha comprobado el contenido.
 */
export function PlaudConfirmMatchDialog({
  open,
  onOpenChange,
  target,
  requiresExtraConfirmation,
  onConfirm,
  isSubmitting,
}: PlaudConfirmMatchDialogProps) {
  const [checked, setChecked] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (!next) setChecked(false);
    onOpenChange(next);
  };

  if (!target) return null;

  const canConfirm = !requiresExtraConfirmation || checked;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar emparejamiento</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-foreground">
              <p>
                Esta grabación se asignará a la ficha de{' '}
                <span className="font-medium">
                  {target.patientFirstName} {target.patientLastName}
                </span>
                , en la sesión del{' '}
                <span className="font-medium">
                  {format(parseISO(target.sessionDate), "d 'de' MMMM 'de' yyyy", { locale: es })}
                </span>{' '}
                de {target.startTime.slice(0, 5)} a {target.endTime.slice(0, 5)}.
              </p>
              {requiresExtraConfirmation && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                  <p className="flex items-start gap-2 text-destructive font-medium">
                    <Icon name="warning" className="h-4 w-4 mt-0.5 shrink-0" />
                    Esta grabación tiene sospecha de contener contenido de más de una sesión o
                    de solaparse con otra.
                  </p>
                  <p className="text-muted-foreground">
                    Confirmar sin comprobarlo puede meter el relato de otro paciente en esta
                    ficha. Escucha o revisa la transcripción antes de continuar.
                  </p>
                  <div className="flex items-start gap-2 pt-1">
                    <Checkbox
                      id="plaud-confirm-checked"
                      checked={checked}
                      onCheckedChange={(v) => setChecked(v === true)}
                    />
                    <Label htmlFor="plaud-confirm-checked" className="text-sm font-normal leading-snug cursor-pointer">
                      He comprobado el contenido de esta grabación y confirmo que corresponde
                      solo a esta sesión y a este paciente.
                    </Label>
                  </div>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || isSubmitting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isSubmitting ? 'Confirmando…' : 'Confirmar emparejamiento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
