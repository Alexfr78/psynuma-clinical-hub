import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, User, MapPin, Loader2, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  onConfirm?: (sessionId: string) => Promise<void>;
  onReschedule?: (session: Session) => void;
  isPast?: boolean;
  emptyMessage?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle }> = {
  scheduled: { label: 'Programada', variant: 'secondary', icon: Calendar },
  confirmed: { label: 'Confirmada', variant: 'default', icon: CheckCircle },
  pending_approval: { label: 'Pendiente aprobación', variant: 'outline', icon: AlertCircle },
  completed: { label: 'Completada', variant: 'default', icon: CheckCircle },
  cancelled: { label: 'Cancelada', variant: 'destructive', icon: XCircle },
  no_show: { label: 'No asistió', variant: 'destructive', icon: XCircle },
};

export function PortalAppointments({
  sessions,
  loading,
  onCancel,
  onConfirm,
  onReschedule,
  isPast = false,
  emptyMessage = 'No hay citas',
}: PortalAppointmentsProps) {
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
            {!isPast && (canCancel || canConfirm) && (
              <div className="flex gap-2 pt-2 border-t">
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
                {canCancel && onCancel && (
                  <AlertDialog>
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
