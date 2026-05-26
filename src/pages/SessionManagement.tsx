import { useParams } from 'react-router-dom';
import { format, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Calendar as CalendarIcon, 
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
  Ban,
  ArrowLeft,
  ChevronLeft,
  ChevronRight
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
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePublicSession, useUpdatePublicSession, canCancelSession, usePublicSessionReschedule } from '@/hooks/usePublicSession';
import { useState, useEffect, useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { formatLocationLine, summarizeLocationChange, isOnlineLocation, type RescheduleLocation } from '@/lib/reschedule-helpers';

function extractZoomInfo(videoCallLink: string | null | undefined) {
  if (!videoCallLink || !videoCallLink.includes('zoom.us')) return null;
  const meetingIdMatch = videoCallLink.match(/\/j\/(\d+)/);
  return { meetingId: meetingIdMatch?.[1] || null };
}

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
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  
  const {
    slots,
    slotsLoading,
    availableDays,
    availableDaysLoading,
    maxDays,
    locations,
    originalLocationId,
    getLocations,
    getAvailableDays,
    getAvailability,
    reschedule,
    isRescheduling,
    cancelSession,
    isCancelling
  } = usePublicSessionReschedule(token);

  // Load locations + initial availability when entering reschedule mode
  useEffect(() => {
    if (mode === 'reschedule') {
      getLocations();
      getAvailableDays();
    }
  }, [mode, getLocations, getAvailableDays]);

  // Sync selectedLocationId with the original location once loaded
  useEffect(() => {
    if (mode === 'reschedule' && originalLocationId && !selectedLocationId) {
      setSelectedLocationId(originalLocationId);
    }
  }, [mode, originalLocationId, selectedLocationId]);

  // Reload availability whenever the chosen location changes
  useEffect(() => {
    if (mode === 'reschedule' && selectedLocationId) {
      getAvailableDays(selectedLocationId);
      setSelectedDate(undefined);
      setSelectedSlot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

  // Load availability when date is selected
  useEffect(() => {
    if (selectedDate && mode === 'reschedule') {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      getAvailability(dateStr, selectedLocationId || undefined);
      setSelectedSlot(null);
    }
  }, [selectedDate, mode, getAvailability, selectedLocationId]);

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
    cancelSession({ 
      cancellation_reason: cancellationReason || 'Cancelada por el paciente'
    });
  };

  const handleRescheduleConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    
    const locationChanged = !!selectedLocationId && selectedLocationId !== originalLocationId;
    reschedule({
      newDate: format(selectedDate, 'yyyy-MM-dd'),
      newStartTime: selectedSlot.startTime,
      newEndTime: selectedSlot.endTime,
      newLocationId: locationChanged ? selectedLocationId : undefined,
    }, {
      onSuccess: () => {
        setConfirmOpen(false);
        setMode('view');
        setSelectedDate(undefined);
        setSelectedSlot(null);
        setSelectedLocationId('');
      }
    });
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
    const center = session.center;
    if (center?.address) {
      const parts = [center.address];
      if (center.address_details) parts[0] += ` ${center.address_details}`;
      if (center.city) parts.push(center.city);
      if (center.postal_code) parts.push(center.postal_code);
      return parts.join(', ');
    }
    if (session.centerFallback?.center_address) {
      return session.centerFallback.center_address;
    }
    return null;
  };

  const getCenterName = () => {
    return session.center?.name || session.centerFallback?.center_name || null;
  };

  // Reschedule mode view
  if (mode === 'reschedule') {
    const today = new Date();
    const maxDate = addDays(today, maxDays);
    const modalityLabel = modalityLabels[session.session_modality || 'in_person'];

    // Helper to check if a date has availability
    const hasAvailability = (date: Date) => {
      const dateStr = format(date, 'yyyy-MM-dd');
      return availableDays.includes(dateStr);
    };

    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-lg">
          <CardHeader className="pb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('view');
                setSelectedDate(undefined);
                setSelectedSlot(null);
              }}
              className="w-fit -ml-2 mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
            <CardTitle className="text-xl">Cambiar fecha</CardTitle>
            <CardDescription>
              Selecciona una nueva fecha y hora para tu cita
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Modality badge and current appointment info */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={isOnline ? "secondary" : "outline"} className="gap-1">
                  {isOnline ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                  {modalityLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Solo se muestran horarios para esta modalidad
                </span>
              </div>
              <Alert className="bg-muted">
                <CalendarIcon className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Cita actual:</span>{' '}
                  <span className="capitalize">{formattedDate}</span> a las {formattedTime.split(' - ')[0]}
                </AlertDescription>
              </Alert>
            </div>

            {/* Calendar with availability indicators */}
            {availableDaysLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Cargando disponibilidad...</span>
              </div>
            ) : (
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const todayStr = format(today, 'yyyy-MM-dd');
                    // Disable past dates, dates beyond max, and dates without availability
                    return dateStr < todayStr || date > maxDate || !hasAvailability(date);
                  }}
                  modifiers={{
                    available: (date) => hasAvailability(date) && date >= today && date <= maxDate,
                  }}
                  modifiersClassNames={{
                    available: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-green-500 after:rounded-full",
                  }}
                  locale={es}
                  className="rounded-md border"
                  components={{
                    IconLeft: () => <ChevronLeft className="h-4 w-4" />,
                    IconRight: () => <ChevronRight className="h-4 w-4" />,
                  }}
                />
              </div>
            )}

            {/* Time slots */}
            {selectedDate && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm text-muted-foreground">
                  Horarios disponibles para el {format(selectedDate, "d 'de' MMMM", { locale: es })}
                </h4>
                
                {slotsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : slots.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No hay horarios disponibles para esta fecha. Por favor, selecciona otro día.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.map((slot) => (
                      <Button
                        key={slot.startTime}
                        variant={selectedSlot?.startTime === slot.startTime ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedSlot(slot)}
                        className="text-sm"
                      >
                        {slot.startTime.slice(0, 5)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Separator />

            {/* Confirm button */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setMode('view');
                  setSelectedDate(undefined);
                  setSelectedSlot(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedDate || !selectedSlot || isRescheduling}
                onClick={handleRescheduleConfirm}
              >
                {isRescheduling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reprogramando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmar cambio
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal view mode
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarIcon className="h-6 w-6 text-primary" />
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
                <CalendarIcon className="h-5 w-5 text-primary" />
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
                    <div className="space-y-1">
                      <a 
                        href={session.video_call_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        Acceder a la videollamada
                      </a>
                      {(() => {
                        const zoomId = session.zoom_meeting_id || extractZoomInfo(session.video_call_link)?.meetingId;
                        return zoomId ? (
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">ID de reunión:</span>{' '}
                            {zoomId}
                          </p>
                        ) : null;
                      })()}
                      {session.zoom_password && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Contraseña:</span>{' '}
                          {session.zoom_password}
                        </p>
                      )}
                    </div>
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

              {/* Reschedule Button - now opens reschedule mode */}
              {status !== 'reschedule_requested' && (
                <Button 
                  variant="outline" 
                  className="w-full" 
                  size="lg"
                  onClick={() => setMode('reschedule')}
                >
                  <CalendarClock className="h-4 w-4 mr-2" />
                  Cambiar fecha
                </Button>
              )}

              {/* Cancel Button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" 
                    size="lg"
                    disabled={!cancellationCheck.allowed || isCancelling}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancelar cita
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción no se puede deshacer. Si necesitas reprogramar, usa la opción "Cambiar fecha".
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
                      disabled={isCancelling}
                    >
                      {isCancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Cancelando...
                        </>
                      ) : (
                        'Sí, cancelar cita'
                      )}
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
