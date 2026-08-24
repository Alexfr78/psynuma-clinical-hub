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
import { usePublicSession, useUpdatePublicSession, usePublicSessionReschedule } from '@/hooks/usePublicSession';
import { supabase } from '@/integrations/supabase/client';
import { useState, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { formatLocationLine, summarizeLocationChange, isOnlineLocation, type RescheduleLocation } from '@/lib/reschedule-helpers';
import { SESSION_STATUS_LABELS, getSessionStatusDisplay } from '@/lib/payment-status';
import { useToast } from '@/hooks/use-toast';

function extractZoomInfo(videoCallLink: string | null | undefined) {
  if (!videoCallLink || !videoCallLink.includes('zoom.us')) return null;
  const meetingIdMatch = videoCallLink.match(/\/j\/(\d+)/);
  return { meetingId: meetingIdMatch?.[1] || null };
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
  draft: { label: SESSION_STATUS_LABELS.draft, variant: 'secondary', icon: null },
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, variant: 'outline', icon: <Clock className="h-4 w-4" /> },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, variant: 'default', icon: <CheckCircle2 className="h-4 w-4" /> },
  completed: { label: SESSION_STATUS_LABELS.completed, variant: 'secondary', icon: <CheckCircle2 className="h-4 w-4" /> },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
  no_show: { label: SESSION_STATUS_LABELS.no_show, variant: 'destructive', icon: <XCircle className="h-4 w-4" /> },
  reschedule_requested: { label: SESSION_STATUS_LABELS.reschedule_requested, variant: 'outline', icon: <CalendarClock className="h-4 w-4" /> },
  blocked: { label: 'Bloqueado', variant: 'outline', icon: <Ban className="h-4 w-4" /> },
};

const modalityLabels: Record<string, string> = {
  in_person: 'Presencial',
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  custom: 'Videollamada',
};

export default function SessionManagement() {
  const { toast } = useToast();
  const { token } = useParams<{ token: string }>();
  const { data: session, isLoading, error } = usePublicSession(token);
  const updateSession = useUpdatePublicSession();
  const [cancellationReason, setCancellationReason] = useState('');
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const timeSlotsRef = useRef<HTMLDivElement>(null);
  const confirmActionsRef = useRef<HTMLDivElement>(null);

  const {
    slots,
    slotsLoading,
    availableDays,
    availableDaysLoading,
    maxDays,
    locations,
    originalLocationId,
    cancellationPolicyPreview,
    cancellationPolicyPreviewLoading,
    getLocations,
    getAvailableDays,
    getAvailability,
    getCancellationPolicyPreview,
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

  // Auto-scroll to the time slots once a date is picked
  useEffect(() => {
    if (selectedDate && mode === 'reschedule') {
      timeSlotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDate, mode]);

  // Auto-scroll to the confirm actions once a time slot is picked
  useEffect(() => {
    if (selectedSlot && mode === 'reschedule') {
      confirmActionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [selectedSlot, mode]);

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

  const isPast = new Date(`${session.session_date}T${session.start_time}`) < new Date();
  const canTakeAction = !isPast && !['completed', 'cancelled', 'no_show'].includes(status);
  const isOnline = session.session_modality !== 'in_person';
  const canPay = Number(session.price || 0) > 0
    && !['paid', 'bono'].includes((session.payment_status || '').toLowerCase())
    && session.stripe_payment_status !== 'paid'
    && !['cancelled', 'completed', 'no_show'].includes(status);

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

  const handlePay = async () => {
    if (!token || paying) return;
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: { session_access_token: token },
      });
      if (error) throw error;
      if (!data?.checkout_url) throw new Error(data?.error || 'No se pudo iniciar el pago');
      window.location.href = data.checkout_url;
    } catch (error) {
      console.error('Error creating public session checkout:', error);
      setPaying(false);
      toast({
        title: 'No se pudo iniciar el pago',
        description: error instanceof Error
          ? error.message
          : 'Inténtalo de nuevo o contacta con el centro.',
        variant: 'destructive',
      });
    }
  };

  const handleCancelDialogOpenChange = (open: boolean) => {
    setCancelDialogOpen(open);
    if (open) {
      getCancellationPolicyPreview();
    }
  };

  const handleRescheduleConfirm = async () => {
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
                setSelectedLocationId('');
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
            {/* Current appointment info */}
            <Alert className="bg-muted">
              <CalendarIcon className="h-4 w-4" />
              <AlertDescription>
                <span className="font-medium">Cita actual:</span>{' '}
                <span className="capitalize">{formattedDate}</span> a las {formattedTime.split(' - ')[0]}
              </AlertDescription>
            </Alert>

            {/* Location selector */}
            {locations.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Ubicación</label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona ubicación" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        <span className="flex items-center gap-2">
                          {isOnlineLocation(loc) ? (
                            <Video className="h-3.5 w-3.5" />
                          ) : (
                            <MapPin className="h-3.5 w-3.5" />
                          )}
                          {loc.name}
                          {loc.city ? ` · ${loc.city}` : ''}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedLocationId && selectedLocationId !== originalLocationId && (
                  <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                      Estás cambiando la ubicación de la cita. Revisa los detalles antes de confirmar.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

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
              <div className="space-y-3" ref={timeSlotsRef}>
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

            {/* Confirm button (opens AlertDialog) */}
            <div className="flex gap-3" ref={confirmActionsRef}>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setMode('view');
                  setSelectedDate(undefined);
                  setSelectedSlot(null);
                  setSelectedLocationId('');
                }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedDate || !selectedSlot || isRescheduling}
                onClick={() => {
                  setConfirmOpen(true);
                  getCancellationPolicyPreview();
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirmar cambio
              </Button>
            </div>

            {/* Confirm AlertDialog */}
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar cambio de cita</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Cita actual</div>
                        <div className="font-medium capitalize">
                          {formattedDate} · {formattedTime.split(' - ')[0]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatLocationLine(
                            (locations.find((l) => l.id === originalLocationId) ?? null) as RescheduleLocation | null
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Nueva cita</div>
                        <div className="font-medium capitalize">
                          {selectedDate && format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })} ·{' '}
                          {selectedSlot?.startTime.slice(0, 5)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatLocationLine(
                            (locations.find((l) => l.id === selectedLocationId) ?? null) as RescheduleLocation | null
                          )}
                        </div>
                      </div>
                      {(() => {
                        const summary = summarizeLocationChange(
                          (locations.find((l) => l.id === originalLocationId) ?? null) as RescheduleLocation | null,
                          (locations.find((l) => l.id === selectedLocationId) ?? null) as RescheduleLocation | null,
                        );
                        if (!summary.changed) return null;
                        return (
                          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                            La ubicación cambia{summary.modalityChanged ? ' y la modalidad también' : ''}.
                          </div>
                        );
                      })()}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    {cancellationPolicyPreviewLoading ? (
                      'Comprobando la política de cancelación...'
                    ) : cancellationPolicyPreview?.applies ? (
                      <>
                        Esta cita está sujeta a la política de cancelación aceptada. Al reprogramarla fuera del plazo permitido, se aplicará el mismo cargo que en una cancelación tardía.
                        <span className="mt-2 block font-medium">
                          Importe: {Number(cancellationPolicyPreview.amount || 0).toFixed(2)} EUR
                          {cancellationPolicyPreview.percentage > 0 && cancellationPolicyPreview.basePrice > 0
                            ? ` (${cancellationPolicyPreview.percentage}% de ${Number(cancellationPolicyPreview.basePrice).toFixed(2)} EUR)`
                            : ''}
                        </span>
                      </>
                    ) : cancellationPolicyPreview?.hasSignedPolicy ? (
                      'Esta cita está cubierta por la política de cancelación aceptada. Según el plazo actual, no se estima cargo por reprogramar.'
                    ) : (
                      'Se avisará al centro del cambio. Si tienes dudas sobre la política aplicable, contacta con tu profesional.'
                    )}
                  </AlertDescription>
                </Alert>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isRescheduling}>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleRescheduleConfirm();
                    }}
                    disabled={isRescheduling}
                  >
                    {isRescheduling ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Reprogramando...
                      </>
                    ) : (
                      'Sí, confirmar'
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
          <Badge variant="outline" className={`mx-auto mt-2 gap-1 ${getSessionStatusDisplay(status).badgeClass}`}>
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
          {canPay && (
            <div className="mb-4">
              <Button
                className="w-full"
                size="lg"
                onClick={handlePay}
                disabled={paying}
              >
                {paying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {paying ? 'Preparando pago...' : 'Pagar con tarjeta'}
              </Button>
            </div>
          )}

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
              <AlertDialog open={cancelDialogOpen} onOpenChange={handleCancelDialogOpenChange}>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" 
                    size="lg"
                    disabled={isCancelling}
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
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      {cancellationPolicyPreviewLoading ? (
                        'Comprobando la política de cancelación...'
                      ) : cancellationPolicyPreview?.applies ? (
                        <>
                          Esta cita está sujeta a la política de cancelación aceptada. Al cancelarla fuera de plazo, tu profesional revisará si corresponde aplicar un cargo.
                          <span className="mt-2 block font-medium">
                            Importe estimado sujeto a revisión: {Number(cancellationPolicyPreview.amount || 0).toFixed(2)} EUR
                            {cancellationPolicyPreview.percentage > 0 && cancellationPolicyPreview.basePrice > 0
                              ? ` (${cancellationPolicyPreview.percentage}% de ${Number(cancellationPolicyPreview.basePrice).toFixed(2)} EUR)`
                              : ''}
                          </span>
                        </>
                      ) : cancellationPolicyPreview?.hasSignedPolicy ? (
                        'Esta cita está cubierta por la política de cancelación aceptada. Según el plazo actual, no se estima cargo por cancelación.'
                      ) : (
                        'Se avisará al centro de la cancelación. Si tienes dudas sobre la política aplicable, contacta con tu profesional.'
                      )}
                    </AlertDescription>
                  </Alert>
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
