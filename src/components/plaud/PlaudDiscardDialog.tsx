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

interface PlaudDiscardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isSubmitting?: boolean;
}

/** Confirmación explícita antes de descartar una grabación como "no clínica". */
export function PlaudDiscardDialog({ open, onOpenChange, onConfirm, isSubmitting }: PlaudDiscardDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar grabación</AlertDialogTitle>
          <AlertDialogDescription>
            Se marcará como que no corresponde a ninguna sesión clínica (ruido, prueba del
            dispositivo, grabación fuera de consulta, etc.) y saldrá de la bandeja de
            revisión. No se asignará a ningún paciente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSubmitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={isSubmitting}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isSubmitting ? 'Descartando…' : 'Descartar grabación'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
