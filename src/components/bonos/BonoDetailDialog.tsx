import { useState } from 'react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getBonoStatusDisplay, SESSION_STATUS_LABELS } from '@/lib/payment-status';
import {
  Calendar,
  User,
  Package,
  Check,
  X,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { BonoWithPatient, useBonoSessions } from '@/hooks/useBonos';
import { DeleteBonoDialog } from './DeleteBonoDialog';

interface BonoDetailDialogProps {
  bono: BonoWithPatient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sessionStatusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, className: 'text-blue-600 dark:text-blue-400' },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, className: 'text-emerald-600 dark:text-emerald-400' },
  completed: { label: SESSION_STATUS_LABELS.completed, className: 'text-muted-foreground' },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, className: 'text-destructive' },
  no_show: { label: SESSION_STATUS_LABELS.no_show, className: 'text-amber-600 dark:text-amber-400' },
};

export function BonoDetailDialog({ bono, open, onOpenChange }: BonoDetailDialogProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useBonoSessions(bono?.id);

  if (!bono) return null;

  const usedSessions = bono.used_sessions || 0;
  const availableSessions = bono.total_sessions - usedSessions;
  const progress = (usedSessions / bono.total_sessions) * 100;
  const status = getBonoStatusDisplay(bono.status);

  const isExpired = bono.expires_at && isPast(new Date(bono.expires_at));
  const daysUntilExpiry = bono.expires_at 
    ? differenceInDays(new Date(bono.expires_at), new Date()) 
    : null;

  const canDelete = bono.status !== 'cancelled';

  const handleDeleteSuccess = () => {
    setDeleteDialogOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <DialogTitle className="text-xl">{bono.name}</DialogTitle>
                {bono.patients && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{bono.patients.first_name} {bono.patients.last_name}</span>
                  </div>
                )}
              </div>
              <Badge variant={status.variant} className="text-sm">
                {status.label}
              </Badge>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6">
              {/* Resumen del bono */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-primary">{availableSessions}</p>
                  <p className="text-sm text-muted-foreground">Disponibles</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold">{usedSessions}</p>
                  <p className="text-sm text-muted-foreground">Consumidas</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold">{bono.total_sessions}</p>
                  <p className="text-sm text-muted-foreground">Total</p>
                </div>
              </div>

              {/* Barra de progreso */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progreso de uso</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Advertencia de expiración */}
              {daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && bono.status === 'active' && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-sm bg-amber-50 dark:bg-amber-950/30 rounded-md p-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>Este bono expira en {daysUntilExpiry} días</span>
                </div>
              )}

              {/* Información de precios y fechas */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Precios</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio por sesión</span>
                      <span className="font-medium">{bono.price_per_session.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio total</span>
                      <span className="font-medium">{bono.total_price.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium text-sm">Fechas</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Creado:</span>
                      <span>{format(new Date(bono.created_at), "d MMM yyyy", { locale: es })}</span>
                    </div>
                    {bono.expires_at && (
                      <div className={`flex items-center gap-2 ${isExpired ? 'text-destructive' : ''}`}>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{isExpired ? 'Expiró:' : 'Expira:'}</span>
                        <span>{format(new Date(bono.expires_at), "d MMM yyyy", { locale: es })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Sesiones vinculadas */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  <h4 className="font-medium">Sesiones vinculadas</h4>
                  <span className="text-sm text-muted-foreground">
                    ({sessions?.length || 0})
                  </span>
                </div>

                {sessionsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : sessionsError ? (
                  <div className="text-center py-8 text-destructive bg-destructive/10 rounded-lg">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
                    <p className="font-medium">Error al cargar sesiones</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      No se pudieron cargar las sesiones vinculadas. Intenta recargar la página.
                    </p>
                  </div>
                ) : !sessions || sessions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay sesiones vinculadas a este bono</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => {
                      const sessionStatus = sessionStatusConfig[session.session_status] || {
                        label: session.session_status,
                        className: 'text-muted-foreground',
                      };
                      
                      return (
                        <div
                          key={session.session_id}
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {format(new Date(session.session_date), "EEEE d MMM yyyy", { locale: es })}
                              </span>
                              <span className={`text-xs ${sessionStatus.className}`}>
                                {sessionStatus.label}
                              </span>
                            </div>
                            {session.professional_name && (
                              <p className="text-xs text-muted-foreground">
                                {session.professional_name}
                              </p>
                            )}
                            {session.session_type_name && (
                              <p className="text-xs text-muted-foreground">
                                {session.session_type_name}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {session.consumes_bono ? (
                              <Badge variant="default" className="gap-1">
                                <Check className="h-3 w-3" />
                                Consume bono
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-muted-foreground">
                                <X className="h-3 w-3" />
                                No consume
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          {/* Acciones */}
          {canDelete && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar bono
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DeleteBonoDialog
        bono={bono}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}
