
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionCode: string;
  onConfirm: () => void;
}

export function VerifactuSyncDialog({ open, onOpenChange, versionCode, onConfirm }: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon name="warning" className="h-5 w-5 text-orange-500" />
            Confirmar sincronización con VeriFactu
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Esto actualizará la versión del sistema informático en VeriFactu a{' '}
              <strong className="text-foreground">{versionCode}</strong>.
            </p>
            <p>
              Esta acción afecta a todos los registros futuros de facturación. ¿Confirmas?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmar sincronización</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
