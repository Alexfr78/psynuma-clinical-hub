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
import { Icon } from '@/components/ui/icon';

interface LateChangeConfirmDialogProps {
  /** Mensaje del servidor; null = cerrado. */
  message: string | null;
  kind: 'cancel' | 'reschedule';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación del paciente cuando cancela o reprograma fuera de plazo: la
 * sesión se considera consumida según la política que aceptó.
 */
export function LateChangeConfirmDialog({ message, kind, loading, onConfirm, onCancel }: LateChangeConfirmDialogProps) {
  return (
    <AlertDialog open={!!message} onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon name="warning" className="h-5 w-5 text-amber-600" />
            Aviso fuera de plazo
          </AlertDialogTitle>
          <AlertDialogDescription className="pt-2 text-sm leading-relaxed">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Volver</AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {kind === 'cancel' ? 'Entiendo, cancelar igualmente' : 'Entiendo, cambiar igualmente'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
