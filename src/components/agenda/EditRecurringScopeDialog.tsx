import { useState } from 'react';

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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { EditScope } from '@/types/recurring';
import { Icon } from '@/components/ui/icon';

interface EditRecurringScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: EditScope) => void;
  action: 'edit' | 'cancel';
  isLoading?: boolean;
}

export function EditRecurringScopeDialog({
  open,
  onOpenChange,
  onConfirm,
  action,
  isLoading = false,
}: EditRecurringScopeDialogProps) {
  const [scope, setScope] = useState<EditScope>('this');

  const handleConfirm = () => {
    onConfirm(scope);
  };

  const isEdit = action === 'edit';
  const title = isEdit ? 'Editar cita recurrente' : 'Cancelar cita recurrente';
  const description = isEdit
    ? '¿A qué citas quieres aplicar los cambios?'
    : '¿Qué citas quieres cancelar?';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Icon name="refresh" className="h-5 w-5 text-primary" />
            <AlertDialogTitle>{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as EditScope)}
          className="space-y-3 py-4"
        >
          <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50">
            <RadioGroupItem value="this" id="scope-this" className="mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="scope-this" className="font-medium cursor-pointer">
                Solo esta cita
              </Label>
              <p className="text-sm text-muted-foreground">
                {isEdit
                  ? 'Los cambios solo se aplicarán a esta cita.'
                  : 'Solo se cancelará esta cita. Las demás permanecerán programadas.'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50">
            <RadioGroupItem value="this_and_following" id="scope-following" className="mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="scope-following" className="font-medium cursor-pointer">
                Esta y las siguientes
              </Label>
              <p className="text-sm text-muted-foreground">
                {isEdit
                  ? 'Los cambios se aplicarán a esta cita y todas las posteriores de la serie.'
                  : 'Se cancelarán esta cita y todas las posteriores de la serie.'}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 rounded-lg border p-3 hover:bg-muted/50">
            <RadioGroupItem value="all" id="scope-all" className="mt-0.5" />
            <div className="space-y-1">
              <Label htmlFor="scope-all" className="font-medium cursor-pointer">
                Toda la serie
              </Label>
              <p className="text-sm text-muted-foreground">
                {isEdit
                  ? 'Los cambios se aplicarán a todas las citas futuras de la serie (excepto las modificadas individualmente).'
                  : 'Se cancelarán todas las citas futuras de la serie.'}
              </p>
            </div>
          </div>
        </RadioGroup>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={action === 'cancel' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {isLoading ? 'Procesando...' : isEdit ? 'Aplicar cambios' : 'Cancelar citas'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
