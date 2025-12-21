import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Video, 
  CheckCircle2, 
  XCircle, 
  CalendarClock,
  AlertCircle,
  Loader2,
  Building2,
  Ban
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
} from "@/components/ui/alert-dialog";
import { usePublicSession, useUpdatePublicSession, canCancelSession } from '@/hooks/usePublicSession';
import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
  draft: { label: 'Borrador', variant: 'secondary', icon: null },
  scheduled: { label: 'Programada', variant: 'outline', icon: <Clock className="h-4 w-4" /> },
  confirmed: { label: 'Confirmada', variant: 'default', icon: <CheckCircle2 className="h-4 w-4" /> },
  completed: { label: 'Completada', variant: 'secondary', icon: <CheckCircle2 className="h-4 w-4" /> },
  cancelled: { label: 'Cancelada', variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
  no_show: { label: 'No asistió', variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
  reschedule_requested: { label: 'Reprogramación solicitada', variant: 'outline', icon: <CalendarClock className="h-4 w-4" /> },
  blocked: { label: 'Bloqueado', variant: 'outline', icon: <Ban className="h-4 w-4" /> },
};

const modalityLabels: Record<string, string> = {
  in_person: 'Presencial',
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  custom: 'Videollamada',
};

export default function SessionManagement() {
  const { token } = useParams<{ token: string }>();
  const { data: session, isLoading, error } = usePublicSession(token);
  const updateSession = useUpdatePublicSession();
  const [cancellationReason, setCancellationReason] = useState('');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando información de la cita...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Cita no encontrada</CardTitle>
            <CardDescription>
              El enlace no es válido o la cita ya no está disponible.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const sessionDate = parseISO(session.session_date);
  const formattedDate = format(sessionDate, "EEEE, d 'de' MMMM yyyy", { locale: es });
  const formattedTime = `${session.start_time.slice(0, 5)} - ${session.end_time.slice(0, 5)}`;
  const status = session.status || 'scheduled';
  const statusInfo = statusConfig[status] || statusConfig.scheduled;

  const cancellationCheck = canCancelSession(
    session.session_date, 
    session.start_time, 
    session.cancellation_policy
  );

  const isPast = new Date(`${session.session_date}T${session.start_time}`) < new Date();
  const canTakeAction = !isPast && !['completed', 'cancelled', 'no_show'].includes(status);
  const isOnline = session.session_modality !== 'in_person';

  const handleConfirm = () => {
    if (token) {
      updateSession.mutate({ token, status: 'confirmed' });
    }
  };

  const handleCancel = () => {
    if (token) {
      updateSession.mutate({ 
        token, 
        status: 'cancelled',
        cancellation_reason: cancellationReason || 'Cancelada por el paciente'
      });
    }
  };

  const handleReschedule = () => {
    if (token) {
      updateSession.mutate({ token, status: 'reschedule_requested' });
    }
  };

  const buildLocationString = () => {
    if (!session.location) return null;
    const parts = [session.location.street];
    if (session.location.number_details) parts[0] += ` ${session.location.number_details}`;
    parts.push(session.location.city);
    if (session.location.postal_code) parts.push(session.location.postal_code);
    return parts.join(', ');
  };

  const buildCenterAddress = () => {
    // First try from center data
    const center = session.center;
    if (center?.address) {
      const parts = [center.address];
      if (center.address_details) parts[0] += ` ${center.address_details}`;
      if (center.city) parts.push(center.city);
      if (center.postal_code) parts.push(center.postal_code);
      return parts.join(', ');
    }
    // Fallback from secure function
    if (session.centerFallback?.center_address) {
      return session.centerFallback.center_address;
    }
    return null;
  };

  const getCenterName = () => {
    return session.center?.name || session.centerFallback?.center_name || null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Calendar className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Tu cita</CardTitle>
          <Badge variant={statusInfo.variant} className="mx-auto mt-2 gap-1">
            {statusInfo.icon}
            {statusInfo.label}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Session Details */}
          <div className="space-y-4">
            {/* Date & Time */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium capitalize">{formattedDate}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedTime}
                </p>
              </div>
            </div>

            {/* Professional */}
            {session.professional && (
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Profesional</p>
                  <p className="font-medium">
                    {session.professional.first_name} {session.professional.last_name}
                  </p>
                </div>
              </div>
            )}

            {/* Session Type */}
            {session.session_type && (
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tipo de sesión</p>
                  <p className="font-medium capitalize">{session.session_type}</p>
                </div>
              </div>
            )}

            {/* Location or Video Link */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {isOnline ? (
                  <Video className="h-5 w-5 text-primary" />
                ) : (
                  <MapPin className="h-5 w-5 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {modalityLabels[session.session_modality || 'in_person']}
                </p>
                {isOnline ? (
                  session.video_call_link ? (
                    <a 
                      href={session.video_call_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Acceder a la videollamada
                    </a>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      El enlace estará disponible antes de la cita
                    </p>
                  )
                ) : (
                  <p className="font-medium">
                    {session.location?.name || getCenterName() || 'Ubicación por confirmar'}
                  </p>
                )}
                {!isOnline && (session.location || buildCenterAddress()) && (
                  <p className="text-sm text-muted-foreground">
                    {buildLocationString() || buildCenterAddress()}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Actions */}
          {canTakeAction ? (
            <div className="space-y-3">
              {/* Confirm Button */}
              {status !== 'confirmed' && status !== 'reschedule_requested' && (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={handleConfirm}
                  disabled={updateSession.isPending}
                >
                  {updateSession.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Confirmar asistencia
                </Button>
              )}

              {/* Reschedule Button */}
              {status !== 'reschedule_requested' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="w-full" size="lg">
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Solicitar nueva fecha
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Solicitar reprogramación</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tu solicitud será enviada al centro y te contactarán para coordinar una nueva fecha.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReschedule}>
                        Solicitar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Cancel Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" 
                    size="lg"
                    disabled={!cancellationCheck.allowed}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar cita
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Si necesitas reprogramar, usa la opción "Solicitar nueva fecha".
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-4">
                    <label className="text-sm font-medium">Motivo (opcional)</label>
                    <Textarea
                      placeholder="Indica el motivo de la cancelación..."
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Volver</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-destructive hover:bg-destructive/90"
                    >
                      Sí, cancelar cita
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Cancellation Policy Warning */}
              {!cancellationCheck.allowed && cancellationCheck.reason && (
                <Alert variant="default" className="bg-muted">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {cancellationCheck.reason}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              {isPast ? (
                <p className="text-muted-foreground">
                  Esta cita ya ha pasado. Si necesitas ayuda, contacta al centro.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  No hay acciones disponibles para esta cita.
                </p>
              )}
            </div>
          )}

          {/* Success Message for Confirmed */}
          {status === 'confirmed' && canTakeAction && (
            <Alert className="bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                ¡Perfecto! Tu cita está confirmada. Te esperamos.
              </AlertDescription>
            </Alert>
          )}

          {/* Reschedule Requested Message */}
          {status === 'reschedule_requested' && (
            <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
              <CalendarClock className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Hemos recibido tu solicitud de reprogramación. Te contactaremos pronto con opciones de nueva fecha.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
