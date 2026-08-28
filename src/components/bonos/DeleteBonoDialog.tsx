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
import { Badge } from '@/components/ui/badge';

import { BonoWithPatient, useDeleteBono } from '@/hooks/useBonos';
import { Icon } from '@/components/ui/icon';

interface DeleteBonoDialogProps {
  bono: BonoWithPatient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DeleteBonoDialog({ bono, open, onOpenChange, onSuccess }: DeleteBonoDialogProps) {
  const deleteBono = useDeleteBono();

  if (!bono) return null;

  const usedSessions = bono.used_sessions || 0;
  const availableSessions = bono.total_sessions - usedSessions;
  const hasConsumedSessions = usedSessions > 0;

  const handleConfirm = async () => {
    const result = await deleteBono.mutateAsync(bono.id);
    if (result.success) {
      onSuccess?.();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icon name="warning" className="h-5 w-5 text-destructive" />
            Eliminar bono
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Info del bono */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Icon name="package_2" className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{bono.name}</span>
                </div>
                {bono.patients && (
                  <div className="flex items-center gap-2 text-sm">
                    <Icon name="person" className="h-4 w-4 text-muted-foreground" />
                    <span>{bono.patients.first_name} {bono.patients.last_name}</span>
                  </div>
                )}
              </div>

              {/* Resumen de sesiones */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-muted/30 rounded-md p-3">
                  <p className="text-lg font-bold">{bono.total_sessions}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="bg-muted/30 rounded-md p-3">
                  <p className="text-lg font-bold text-primary">{usedSessions}</p>
                  <p className="text-xs text-muted-foreground">Consumidas</p>
                </div>
                <div className="bg-muted/30 rounded-md p-3">
                  <p className="text-lg font-bold">{availableSessions}</p>
                  <p className="text-xs text-muted-foreground">Restantes</p>
                </div>
              </div>

              {/* Mensaje de advertencia según el caso */}
              {hasConsumedSessions ? (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-medium">
                    <Icon name="warning" className="h-4 w-4" />
                    <span>Este bono tiene sesiones consumidas</span>
                  </div>
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    El bono se marcará como <Badge variant="outline" className="mx-1">Cancelado</Badge> 
                    para mantener el historial de facturación y sesiones. Las sesiones y cobros 
                    asociados no se verán afectados.
                  </p>
                </div>
              ) : (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-destructive font-medium">
                    <Icon name="warning" className="h-4 w-4" />
                    <span>Eliminación permanente</span>
                  </div>
                  <p className="text-sm text-destructive/80">
                    Como no hay sesiones consumidas, el bono se eliminará permanentemente 
                    y las sesiones vinculadas serán desasociadas.
                  </p>
                </div>
              )}

              <p className="text-sm text-center text-muted-foreground">
                ¿Estás seguro de que deseas continuar?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteBono.isPending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleteBono.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteBono.isPending ? 'Eliminando...' : hasConsumedSessions ? 'Cancelar bono' : 'Eliminar bono'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
