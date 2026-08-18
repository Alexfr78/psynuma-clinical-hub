import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePublicBooking } from '@/hooks/usePublicBooking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, isBefore, startOfDay, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, MapPin, Video, Calendar as CalendarIcon, Clock, AlertTriangle, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type { CancellationPolicyPreview } from '@/hooks/usePublicBooking';

export default function PublicBookingManage() {
  const { centerSlug } = useParams<{ centerSlug: string }>();
  const [searchParams] = useSearchParams();
  const bookingToken = searchParams.get('token') || '';

  const { getBooking, cancelBooking, rescheduleBooking, getAvailability, getMonthAvailability, getCancellationPreview, loading, error } = usePublicBooking(centerSlug || '');

  const [booking, setBooking] = useState<any>(null);
  const [centerName, setCenterName] = useState('');
  const [mode, setMode] = useState<'view' | 'reschedule'>('view');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [slots, setSlots] = useState<{ startTime: string; endTime: string }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [availabilityData, setAvailabilityData] = useState<{ month: string; byDate: Record<string, number> }>({ month: '', byDate: {} });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reschedulePreview, setReschedulePreview] = useState<CancellationPolicyPreview | null>(null);
  const [reschedulePreviewLoading, setReschedulePreviewLoading] = useState(false);

  useEffect(() => {
    if (bookingToken) {
      loadBooking();
    }
  }, [bookingToken]);

  const loadBooking = async () => {
    const data = await getBooking(bookingToken);
    if (data) {
      setBooking(data.booking);
      setCenterName(data.centerName);
    }
  };

  useEffect(() => {
    if (mode === 'reschedule' && selectedDate && booking) {
      loadSlots();
    }
  }, [selectedDate, mode]);

  // Load month availability when entering reschedule mode or changing month
  useEffect(() => {
    if (mode === 'reschedule' && booking) {
      const monthStr = format(currentMonth, 'yyyy-MM');
      setAvailabilityLoading(true);
      getMonthAvailability(
        monthStr,
        booking.session_type_id,
        booking.location_id || booking.location?.id || '',
        booking.professional_id || booking.professional?.id
      )
        .then(days => {
          const map: Record<string, number> = {};
          days.forEach(d => { map[d.date] = d.availableCount; });
          setAvailabilityData({ month: monthStr, byDate: map });
        })
        .finally(() => setAvailabilityLoading(false));
    }
  }, [mode, booking, currentMonth, getMonthAvailability]);

  const loadSlots = async () => {
    if (!selectedDate || !booking) return;
    setSlotsLoading(true);
    const data = await getAvailability(
      format(selectedDate, 'yyyy-MM-dd'),
      booking.session_type_id,
      booking.location_id || booking.location?.id || '',
      booking.professional_id || booking.professional?.id
    );
    setSlots(data.slots);
    setSlotsLoading(false);
  };


  const handleCancel = async () => {
    const success = await cancelBooking(bookingToken);
    if (success) {
      toast.success('Cita cancelada correctamente');
      loadBooking();
    } else {
      toast.error(error || 'Error al cancelar la cita');
    }
  };

  const handleOpenConfirm = () => {
    if (!selectedDate || !selectedSlot) return;
    setConfirmOpen(true);
    setReschedulePreview(null);
    setReschedulePreviewLoading(true);
    getCancellationPreview(bookingToken)
      .then(setReschedulePreview)
      .finally(() => setReschedulePreviewLoading(false));
  };

  const handleReschedule = async () => {
    if (!selectedDate || !selectedSlot) return;

    setConfirmOpen(false);
    const success = await rescheduleBooking(
      bookingToken,
      format(selectedDate, 'yyyy-MM-dd'),
      selectedSlot.startTime,
      selectedSlot.endTime
    );
    
    if (success) {
      toast.success('Cita reprogramada correctamente');
      setMode('view');
      loadBooking();
    } else {
      toast.error(error || 'Error al reprogramar la cita');
    }
  };

  if (loading && !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
            <p className="text-muted-foreground">{error || 'No se pudo cargar la cita. El enlace puede haber expirado.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const isPending = booking.status === 'pending_approval';
  const sessionDate = new Date(`${booking.session_date}T${booking.start_time}`);
  const isPast = isBefore(sessionDate, new Date());

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">{centerName}</h1>
          <p className="text-muted-foreground">Gestión de cita</p>
        </div>

        {mode === 'view' ? (
          <Card>
            <CardHeader className="text-center">
              {isCancelled ? (
                <XCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
              ) : isPending ? (
                <Clock className="h-12 w-12 text-warning mx-auto mb-2" />
              ) : (
                <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
              )}
              <CardTitle>
                {isCancelled ? 'Cita cancelada' : isPending ? 'Pendiente de aprobación' : 'Cita confirmada'}
              </CardTitle>
              {isPending && (
                <CardDescription>El centro revisará tu solicitud pronto</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">
                      {format(new Date(booking.session_date), "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {booking.start_time.substring(0, 5)} - {booking.end_time.substring(0, 5)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div className="font-medium">{booking.session_type}</div>
                </div>

                {booking.location && (
                  <div className="flex items-start gap-3">
                    {booking.location.location_type === 'online' ? (
                      <Video className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    ) : (
                      <MapPin className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium break-words">{booking.location.name}</div>
                      {booking.location.street && (
                        <div className="text-sm text-muted-foreground break-words">
                          {booking.location.street}{booking.location.city ? `, ${booking.location.city}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {booking.professional && (
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {booking.professional.first_name?.[0]}
                      </span>
                    </div>
                    <div className="font-medium">
                      {booking.professional.first_name} {booking.professional.last_name}
                    </div>
                  </div>
                )}
              </div>

              {!isCancelled && !isPast && (
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={() => setMode('reschedule')}>
                    Reprogramar cita
                  </Button>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">Cancelar cita</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta acción no se puede deshacer. La cita quedará cancelada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Volver</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                          Sí, cancelar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Reprogramar cita</CardTitle>
              <CardDescription>Selecciona una nueva fecha y hora</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  onSelect={d => { setSelectedDate(d); setSelectedSlot(null); }}
                  disabled={(date) => {
                    if (isBefore(date, startOfDay(new Date()))) return true;
                    if (isBefore(addDays(new Date(), 90), date)) return true;
                    const monthStr = format(currentMonth, 'yyyy-MM');
                    if (availabilityData.month === monthStr && Object.keys(availabilityData.byDate).length > 0) {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      return (availabilityData.byDate[dateStr] || 0) === 0;
                    }
                    return false;
                  }}
                  components={{
                    DayContent: ({ date }) => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const monthStr = format(currentMonth, 'yyyy-MM');
                      const count = availabilityData.month === monthStr ? (availabilityData.byDate[dateStr] || 0) : 0;
                      const hasAvailability = count > 0;
                      return (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <span className={cn(hasAvailability && "font-bold text-primary")}>
                            {date.getDate()}
                          </span>
                          {hasAvailability && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                          )}
                        </div>
                      );
                    }
                  }}
                  locale={es}
                  className="rounded-md border mx-auto"
                />
                {availabilityLoading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-md">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>

              {selectedDate && (
                <div>
                  <h4 className="font-medium mb-2">
                    Horarios para {format(selectedDate, "d 'de' MMMM", { locale: es })}
                  </h4>
                  {slotsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      No hay horarios disponibles este día
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.map(slot => (
                        <button
                          key={slot.startTime}
                          onClick={() => setSelectedSlot(slot)}
                          className={cn(
                            "py-2 px-3 rounded-md border text-sm font-medium transition-all",
                            selectedSlot?.startTime === slot.startTime
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border hover:border-primary"
                          )}
                        >
                          {slot.startTime}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setMode('view')} className="flex-1">
                  Cancelar
                </Button>
                <Button
                  onClick={handleOpenConfirm}
                  disabled={!selectedSlot || loading}
                  className="flex-1"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirmar
                </Button>
              </div>

              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar cambio de cita</AlertDialogTitle>
                    <AlertDialogDescription>
                      {selectedDate && selectedSlot && (
                        <>Nueva fecha: {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las {selectedSlot.startTime}</>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <AlertDescription>
                      {reschedulePreviewLoading ? (
                        'Comprobando la política de cancelación...'
                      ) : reschedulePreview?.applies ? (
                        <>
                          Esta cita está sujeta a la política de cancelación aceptada. Al reprogramarla fuera del plazo permitido, se aplicará el mismo cargo que en una cancelación tardía.
                          <span className="mt-2 block font-medium">
                            Importe: {Number(reschedulePreview.amount || 0).toFixed(2)} EUR
                            {reschedulePreview.percentage > 0 && reschedulePreview.basePrice > 0
                              ? ` (${reschedulePreview.percentage}% de ${Number(reschedulePreview.basePrice).toFixed(2)} EUR)`
                              : ''}
                          </span>
                        </>
                      ) : reschedulePreview?.hasSignedPolicy ? (
                        'Esta cita está cubierta por la política de cancelación aceptada. Según el plazo actual, no se estima cargo por reprogramar.'
                      ) : (
                        'Se avisará al centro del cambio. Si tienes dudas sobre la política aplicable, contacta con el centro.'
                      )}
                    </AlertDescription>
                  </Alert>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Volver</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReschedule} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Sí, confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
