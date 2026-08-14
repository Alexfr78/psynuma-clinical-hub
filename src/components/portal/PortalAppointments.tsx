import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, User, MapPin, Loader2, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SESSION_STATUS_LABELS } from '@/lib/payment-status';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Session {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  session_type: string;
  session_modality: string;
  notes: string | null;
  professional: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  location: {
    id: string;
    name: string;
    street: string;
    city: string;
  } | null;
}

interface PortalAppointmentsProps {
  sessions: Session[];
  loading: boolean;
  onCancel?: (sessionId: string) => Promise<void>;
  onCancellationPreview?: (sessionId: string) => Promise<CancellationPolicyPreview | null>;
  onConfirm?: (sessionId: string) => Promise<void>;
  onReschedule?: (session: Session) => void;
  isPast?: boolean;
  emptyMessage?: string;
}

interface CancellationPolicyPreview {
  hasSignedPolicy: boolean;
  applies: boolean;
  amount: number;
  basePrice: number;
  percentage: number;
  concept: string | null;
  message: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle }> = {
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, variant: 'secondary', icon: Calendar },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, variant: 'default', icon: CheckCircle },
  pending_approval: { label: SESSION_STATUS_LABELS.pending_approval, variant: 'outline', icon: AlertCircle },
  completed: { label: SESSION_STATUS_LABELS.completed, variant: 'default', icon: CheckCircle },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, variant: 'destructive', icon: XCircle },
  no_show: { label: SESSION_STATUS_LABELS.no_show, variant: 'destructive', icon: XCircle },
};

export function PortalAppointments({
  sessions,
  loading,
  onCancel,
  onCancellationPreview,
  onConfirm,
  onReschedule,
  isPast = false,
  emptyMessage = 'No hay citas',
}: PortalAppointmentsProps) {
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);
  const [cancellationPreview, setCancellationPreview] = useState<CancellationPolicyPreview | null>(null);
  const [cancellationPreviewLoading, setCancellationPreviewLoading] = useState(false);

  const handleCancelDialogOpenChange = async (open: boolean, sessionId: string) => {
    setCancelDialogSessionId(open ? sessionId : null);
    if (!open) return;

    setCancellationPreview(null);
    if (!onCancellationPreview) return;

    setCancellationPreviewLoading(true);
    try {
      setCancellationPreview(await onCancellationPreview(sessionId));
    } finally {
      setCancellationPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const status = statusConfig[session.status] || statusConfig.scheduled;
        const StatusIcon = status.icon;
        const canCancel = !isPast && ['scheduled', 'confirmed', 'pending_approval'].includes(session.status);
        const canConfirm = !isPast && session.status === 'scheduled';
        const canReschedule = !isPast && ['scheduled', 'confirmed'].includes(session.status);

        return (
          <div
            key={session.id}
            className="border rounded-lg p-4 space-y-3 hover:border-primary/50 transition-colors"
          >
            {/* Date and Status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {format(new Date(session.session_date), "EEEE, d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <Badge variant={status.variant} className="flex items-center gap-1">
                <StatusIcon className="h-3 w-3" />
                <span className="text-xs">{status.label}</span>
              </Badge>
            </div>

            {/* Time and Type */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>
                  {session.start_time.substring(0, 5)} - {session.end_time.substring(0, 5)}
                </span>
              </div>
              {session.professional && (
                <div className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  <span>
                    {session.professional.first_name} {session.professional.last_name}
                  </span>
                </div>
              )}
            </div>

            {/* Session Type and Location */}
            <div className="flex flex-wrap gap-4 text-sm">
              <Badge variant="outline">{session.session_type}</Badge>
              {session.location && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{session.location.name}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            {!isPast && (canCancel || canConfirm || canReschedule) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {canConfirm && onConfirm && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => onConfirm(session.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Confirmar
                  </Button>
                )}
                {canReschedule && onReschedule && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReschedule(session)}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reprogramar
                  </Button>
                )}
                {canCancel && onCancel && (
                  <AlertDialog
                    open={cancelDialogSessionId === session.id}
                    onOpenChange={(open) => handleCancelDialogOpenChange(open, session.id)}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La cita del {format(new Date(session.session_date), "d 'de' MMMM", { locale: es })} a las {session.start_time.substring(0, 5)} será cancelada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <AlertDescription>
                          {cancellationPreviewLoading ? (
                            'Comprobando la política de cancelación...'
                          ) : cancellationPreview?.applies ? (
                            <>
                              Esta cita está sujeta a la política de cancelación aceptada. Al cancelarla fuera de plazo, tu profesional revisará si corresponde aplicar un cargo.
                              <span className="mt-2 block font-medium">
                                Importe estimado sujeto a revisión: {Number(cancellationPreview.amount || 0).toFixed(2)} EUR
                                {cancellationPreview.percentage > 0 && cancellationPreview.basePrice > 0
                                  ? ` (${cancellationPreview.percentage}% de ${Number(cancellationPreview.basePrice).toFixed(2)} EUR)`
                                  : ''}
                              </span>
                            </>
                          ) : cancellationPreview?.hasSignedPolicy ? (
                            'Esta cita está cubierta por la política de cancelación aceptada. Según el plazo actual, no se estima cargo por cancelación.'
                          ) : (
                            'Se avisará al centro de la cancelación. Si tienes dudas sobre la política aplicable, contacta con tu profesional.'
                          )}
                        </AlertDescription>
                      </Alert>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Volver</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onCancel(session.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Cancelar cita
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
