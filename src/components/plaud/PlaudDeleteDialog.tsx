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

interface PlaudDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/**
 * Confirmación explícita antes de borrar una grabación por completo. A diferencia de
 * "Descartar" (que la marca como no clínica pero la conserva en el historial), esta acción
 * elimina la fila de la base de datos sin dejar rastro — irreversible.
 */
export function PlaudDeleteDialog({ open, onOpenChange, onConfirm, isSubmitting }: PlaudDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Borrar grabación por completo</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará esta grabación de forma permanente, incluida su transcripción si
            todavía la conserva. No quedará ningún registro en el historial y esta acción no
            se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isSubmitting ? 'Borrando…' : 'Borrar definitivamente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
