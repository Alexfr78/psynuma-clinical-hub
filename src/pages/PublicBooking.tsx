import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePublicBooking } from '@/hooks/usePublicBooking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, MapPin, Video, Clock, User, CheckCircle, ArrowLeft, ArrowRight, Copy, AlertCircle, RefreshCw, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClosedAgendaScreen } from '@/components/booking/ClosedAgendaScreen';
import { redirectTopLevel } from '@/lib/redirect';

type Step = 'service' | 'location' | 'professional' | 'datetime' | 'patient' | 'confirmation';

export default function PublicBooking() {
  const { centerSlug } = useParams<{ centerSlug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  
  const {
    config, services, locations, professionals, allowProfessionalSelection,
    loading, error, disabled, bootstrap,
    getAvailability, getMonthAvailability, createBooking, createSetupIntent,
    submitIntakeRequest, listReferralFilters, getReferralRecommendations
  } = usePublicBooking(centerSlug || '');

  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [slots, setSlots] = useState<{ startTime: string; endTime: string; isOptimal?: boolean }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  
  // Month availability state
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [availabilityData, setAvailabilityData] = useState<{ month: string; byDate: Record<string, number> }>({ month: '', byDate: {} });
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  
  const [patient, setPatient] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptCancellationPolicy, setAcceptCancellationPolicy] = useState(false);
  const [notes, setNotes] = useState('');
  
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [bootstrapAttempted, setBootstrapAttempted] = useState(false);

  const loadInitial = useCallback(() => {
    if (!centerSlug) return;
    setBootstrapAttempted(false);
    bootstrap().finally(() => setBootstrapAttempted(true));
  }, [centerSlug, bootstrap]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Load month availability when entering datetime step or changing month
  useEffect(() => {
    if (step === 'datetime' && selectedService && selectedLocation) {
      const monthStr = format(currentMonth, 'yyyy-MM');
      setAvailabilityLoading(true);
      getMonthAvailability(monthStr, selectedService, selectedLocation, selectedProfessional || undefined)
        .then(days => {
          const map: Record<string, number> = {};
          days.forEach(d => { map[d.date] = d.availableCount; });
          setAvailabilityData({ month: monthStr, byDate: map });
        })
        .finally(() => setAvailabilityLoading(false));
    }
  }, [step, selectedService, selectedLocation, selectedProfessional, currentMonth, getMonthAvailability]);

  // Load slots for selected date
  useEffect(() => {
    if (selectedDate && selectedService && selectedLocation) {
      setSlotsLoading(true);
      getAvailability(
        format(selectedDate, 'yyyy-MM-dd'),
        selectedService,
        selectedLocation,
        selectedProfessional || undefined
      ).then(data => {
        setSlots(data.slots);
        setSlotsLoading(false);
      });
    }
  }, [selectedDate, selectedService, selectedLocation, selectedProfessional]);

  const handleNext = () => {
    const steps: Step[] = ['service', 'location', 'professional', 'datetime', 'patient'];
    const currentIndex = steps.indexOf(step);
    
    if (step === 'location' && !allowProfessionalSelection) {
      setStep('datetime');
    } else if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: Step[] = ['service', 'location', 'professional', 'datetime', 'patient'];
    const currentIndex = steps.indexOf(step);
    
    if (step === 'datetime' && !allowProfessionalSelection) {
      setStep('location');
    } else if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedService || !selectedLocation || !selectedDate || !selectedSlot) return;
    
    const result = await createBooking({
      sessionTypeId: selectedService,
      locationId: selectedLocation,
      professionalId: selectedProfessional || undefined,
      sessionDate: format(selectedDate, 'yyyy-MM-dd'),
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      patient,
      acceptPrivacy,
      acceptCancellationPolicy,
      cancellationPolicyVersionId: config?.cancellationPolicy?.id,
      notes: notes || undefined
    });

    if (result?.success) {
      if (result.paymentRequired && result.checkoutUrl) {
        // Keep a usable fallback on screen before leaving. Public booking is
        // commonly embedded in an iframe, while Stripe Checkout must open at
        // the top level rather than inside that frame.
        setBookingResult(result);
        setStep('confirmation');
        toast.info('Abriendo el pago seguro de Stripe...');

        try {
          if (isEmbed && window.top && window.top !== window) {
            window.top.location.href = result.checkoutUrl;
          } else {
            window.location.assign(result.checkoutUrl);
          }
        } catch (navigationError) {
          console.warn('No se pudo abrir Stripe automáticamente:', navigationError);
          toast.warning('Pulsa "Ir al pago seguro" para continuar.');
        }
        return;
      }

      // Fase 2 · Inc 1 — captura de tarjeta en la reserva (Checkout de setup, 0 €).
      if (result.cardCaptureNeeded && result.session?.id) {
        const setup = await createSetupIntent(result.session.id);
        if (setup?.url) {
          setBookingResult(result);
          setStep('confirmation');
          toast.info('Guarda tu tarjeta para completar la reserva (no se te cobra ahora)...');
          redirectTopLevel(setup.url);
          return;
        }
        if (result.cardOnBookingMode === 'required') {
          setBookingResult(result);
          setStep('confirmation');
          toast.error('No se pudo iniciar el guardado de la tarjeta. Contacta con el centro.');
          return;
        }
      }

      setBookingResult(result);
      setStep('confirmation');
      if (result.paymentRequired) {
        toast.error('No se pudo iniciar el pago. Contacta con el centro para completarlo.');
      } else {
        toast.success(result.message);
      }
    } else {
      toast.error(error || 'Error al crear la reserva');
    }
  };

  const privacyPolicyUrl = config?.privacyPolicyUrl || (() => {
    try {
      return document.referrer ? `${new URL(document.referrer).origin}/politica-de-privacidad/` : '/politica-de-privacidad/';
    } catch {
      return '/politica-de-privacidad/';
    }
  })();

  const cancellationPolicy = config?.cancellationPolicy;
  const cancellationSummary = cancellationPolicy
    ? `Puedes cancelar o cambiar tu cita sin coste hasta ${cancellationPolicy.cancellationWindowHours} horas antes. Después podría aplicarse un cargo del ${cancellationPolicy.lateCancellationPercentage}%.`
    : null;

  const copyManageLink = () => {
    if (bookingResult?.manageUrl) {
      navigator.clipboard.writeText(window.location.origin + bookingResult.manageUrl);
      toast.success('Enlace copiado');
    }
  };

  if (disabled) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-background", isEmbed && "p-4")}>
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Las reservas públicas no están habilitadas para este centro.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading && !config) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Explicit error state when initial bootstrap failed (no config loaded).
  if (bootstrapAttempted && !config && error) {
    const isRateLimited = /demasiadas solicitudes|rate/i.test(error);
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-background", isEmbed && "p-4")}>
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
            <CardTitle>No se pudo cargar la reserva</CardTitle>
            <CardDescription>
              {isRateLimited
                ? 'Hemos recibido demasiadas solicitudes. Espera un minuto y vuelve a intentarlo.'
                : error}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button onClick={loadInitial} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show closed agenda screen if agenda is closed
  if (config?.agendaClosed) {
    return (
      <div className={cn("min-h-screen bg-background", isEmbed ? "p-4" : "py-8 px-4")}>
        <ClosedAgendaScreen
          centerName={config.name}
          centerLogo={config.logoUrl}
          portalSlug={centerSlug || ''}
          onSubmitIntake={submitIntakeRequest}
          onLoadFilters={listReferralFilters}
          onGetRecommendations={getReferralRecommendations}
          loading={loading}
        />
      </div>
    );
  }

  // Explicit empty state when bootstrap loaded but center has no public services / locations.
  if (config && bootstrapAttempted && (services.length === 0 || locations.length === 0)) {
    const missing =
      services.length === 0 && locations.length === 0
        ? 'No hay servicios ni ubicaciones públicas configuradas todavía.'
        : services.length === 0
          ? 'Este centro aún no ha publicado servicios disponibles para reserva online.'
          : 'Este centro aún no ha publicado ubicaciones disponibles para reserva online.';
    return (
      <div className={cn("min-h-screen flex items-center justify-center bg-background", isEmbed ? "p-4" : "py-8 px-4")}>
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            {config.logoUrl && <img src={config.logoUrl} alt={config.name} className="h-12 mx-auto mb-3" />}
            <CardTitle>{config.name}</CardTitle>
            <CardDescription>{missing}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={loadInitial} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedServiceData = services.find(s => s.id === selectedService);
  const selectedLocationData = locations.find(l => l.id === selectedLocation);
  const selectedProfessionalData = professionals.find(p => p.id === selectedProfessional);

  // Check if availability data matches current month
  const currentMonthStr = format(currentMonth, 'yyyy-MM');
  const dataIsForCurrentMonth = availabilityData.month === currentMonthStr;

  return (
    <div className={cn("min-h-screen bg-background", isEmbed ? "p-4" : "py-8 px-4")}>
      <div className="max-w-2xl mx-auto">
        {!isEmbed && config && (
          <div className="text-center mb-8">
            {config.logoUrl && <img src={config.logoUrl} alt={config.name} className="h-12 mx-auto mb-4" />}
            <h1 className="text-2xl font-bold text-foreground">{config.name}</h1>
            <p className="text-muted-foreground">Reserva tu cita online</p>
          </div>
        )}

        {step === 'confirmation' && bookingResult ? (
          <Card>
            <CardHeader className="text-center">
              {bookingResult.paymentRequired ? (
                <Clock className="h-16 w-16 text-warning mx-auto mb-4" />
              ) : (
                <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              )}
              <CardTitle>
                {bookingResult.paymentRequired
                  ? 'Reserva pendiente de pago'
                  : `¡Reserva ${config?.requireApproval ? 'solicitada' : 'confirmada'}!`}
              </CardTitle>
              <CardDescription>{bookingResult.message}</CardDescription>
              {bookingResult.paymentRequired && bookingResult.checkoutError && (
                <p className="text-sm text-destructive mt-2">
                  No hemos podido iniciar Stripe. La cita aún no está confirmada.
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p><strong>Servicio:</strong> {selectedServiceData?.name}</p>
                <p><strong>Fecha:</strong> {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</p>
                <p><strong>Hora:</strong> {selectedSlot?.startTime} - {selectedSlot?.endTime}</p>
                <p><strong>Ubicación:</strong> {selectedLocationData?.name}</p>
              </div>
              <div className="flex flex-col gap-2">
                {bookingResult.paymentRequired && bookingResult.checkoutUrl && (
                  <Button
                    onClick={() => window.open(bookingResult.checkoutUrl, isEmbed ? '_top' : '_self')}
                    className="w-full"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Ir al pago seguro
                  </Button>
                )}
                <Button variant="outline" onClick={copyManageLink} className="w-full">
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar enlace de gestión
                </Button>
                <Button onClick={() => window.location.href = bookingResult.manageUrl} className="w-full">
                  Gestionar mi cita
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                {['Servicio', 'Ubicación', allowProfessionalSelection && 'Profesional', 'Fecha y hora', 'Tus datos'].filter(Boolean).map((label, i, arr) => (
                  <span key={i} className={cn(
                    i === (['service', 'location', 'professional', 'datetime', 'patient'].indexOf(step) - (allowProfessionalSelection ? 0 : (step === 'datetime' || step === 'patient' ? 1 : 0))) && 'text-primary font-medium'
                  )}>
                    {label}{i < arr.length - 1 && ' →'}
                  </span>
                ))}
              </div>
              <CardTitle>
                {step === 'service' && 'Selecciona un servicio'}
                {step === 'location' && 'Selecciona ubicación'}
                {step === 'professional' && 'Selecciona profesional'}
                {step === 'datetime' && 'Selecciona fecha y hora'}
                {step === 'patient' && 'Tus datos'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 'service' && (
                <div className="grid gap-3">
                  {services.map(service => (
                    <button
                      key={service.id}
                      onClick={() => setSelectedService(service.id)}
                      className={cn(
                        "p-4 rounded-lg border text-left transition-all",
                        selectedService === service.id 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="font-medium">{service.name}</div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{service.duration_minutes} min</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 'location' && (
                <div className="grid gap-3">
                  {locations.map(location => (
                    <button
                      key={location.id}
                      onClick={() => setSelectedLocation(location.id)}
                      className={cn(
                        "p-4 rounded-lg border text-left transition-all",
                        selectedLocation === location.id 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {location.location_type === 'online' ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                        <span className="font-medium">{location.name}</span>
                      </div>
                      {location.street && <div className="text-sm text-muted-foreground mt-1">{location.street}, {location.city}</div>}
                    </button>
                  ))}
                </div>
              )}

              {step === 'professional' && (
                <div className="grid gap-3">
                  {professionals.map(prof => (
                    <button
                      key={prof.id}
                      onClick={() => setSelectedProfessional(prof.id)}
                      className={cn(
                        "p-4 rounded-lg border text-left transition-all flex items-center gap-3",
                        selectedProfessional === prof.id 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        {prof.avatar_url ? <img src={prof.avatar_url} className="h-10 w-10 rounded-full" /> : <User className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-medium">{prof.first_name} {prof.last_name}</div>
                        {prof.specialty && <div className="text-sm text-muted-foreground">{prof.specialty}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 'datetime' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      month={currentMonth}
                      onMonthChange={setCurrentMonth}
                      onSelect={d => { setSelectedDate(d); setSelectedSlot(null); }}
                    disabled={(date) => {
                        // Use maxDaysAhead from config (default 90)
                        const maxDaysAhead = config?.maxDaysAhead ?? 90;
                        
                        // Always disable past dates and dates beyond limit
                        if (isBefore(date, startOfDay(new Date()))) return true;
                        if (isBefore(addDays(new Date(), maxDaysAhead), date)) return true;
                        
                        // Only apply availability logic when we have data for the current month
                        if (dataIsForCurrentMonth && Object.keys(availabilityData.byDate).length > 0) {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          return (availabilityData.byDate[dateStr] || 0) === 0;
                        }
                        
                        return false;
                      }}
                      components={{
                        DayContent: ({ date }) => {
                          const dateStr = format(date, 'yyyy-MM-dd');
                          const count = dataIsForCurrentMonth ? (availabilityData.byDate[dateStr] || 0) : 0;
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
                    
                    {/* Loading overlay */}
                    {availabilityLoading && (
                      <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-md">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  
                  {selectedDate && (
                    <div>
                      <h4 className="font-medium mb-2">Horarios disponibles para {format(selectedDate, "d 'de' MMMM", { locale: es })}</h4>
                      {slotsLoading ? (
                        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
                      ) : slots.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No hay horarios disponibles este día</p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {slots.map(slot => {
                            const hasOptimalSlots = slots.some(s => s.isOptimal);
                            const isSuboptimal = hasOptimalSlots && slot.isOptimal === false;
                            return (
                            <button
                              key={slot.startTime}
                              onClick={() => setSelectedSlot(slot)}
                              className={cn(
                                "py-2 px-3 rounded-md border text-sm font-medium transition-all",
                                selectedSlot?.startTime === slot.startTime 
                                  ? "border-primary bg-primary text-primary-foreground" 
                                  : isSuboptimal
                                    ? "border-dashed border-muted-foreground/40 text-muted-foreground opacity-60 hover:border-muted-foreground/60"
                                    : "border-border hover:border-primary"
                              )}
                            >
                              {slot.startTime}
                            </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 'patient' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Nombre *</Label>
                      <Input id="firstName" value={patient.firstName} onChange={e => setPatient(p => ({ ...p, firstName: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Apellidos *</Label>
                      <Input id="lastName" value={patient.lastName} onChange={e => setPatient(p => ({ ...p, lastName: e.target.value }))} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={patient.email} onChange={e => setPatient(p => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" value={patient.phone} onChange={e => setPatient(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Notas o motivo de consulta</Label>
                    <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional" />
                  </div>
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-4" aria-label="Consentimientos obligatorios">
                    <div className="flex items-start gap-3">
                      <Checkbox id="privacy" checked={acceptPrivacy} onCheckedChange={c => setAcceptPrivacy(!!c)} />
                      <Label htmlFor="privacy" className="text-sm font-normal leading-5">
                        Acepto el tratamiento de mis datos conforme a la{' '}
                        <a
                          href={privacyPolicyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2 hover:no-underline"
                          onClick={event => event.stopPropagation()}
                        >
                          política de privacidad
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>{' '}*
                      </Label>
                    </div>

                    {cancellationPolicy && (
                      <div className="flex items-start gap-3 border-t pt-3">
                        <Checkbox
                          id="cancellation-policy"
                          checked={acceptCancellationPolicy}
                          onCheckedChange={c => setAcceptCancellationPolicy(!!c)}
                        />
                        <div className="space-y-1">
                          <Label htmlFor="cancellation-policy" className="text-sm font-normal leading-5">
                            He leído y acepto la política de cancelación *
                          </Label>
                          <p className="text-sm leading-5 text-muted-foreground">{cancellationSummary}</p>
                          {config?.cardOnBookingMode && config.cardOnBookingMode !== 'off' && (
                            <p className="text-sm leading-5 text-muted-foreground">
                              Al confirmar, se guardará tu tarjeta de forma segura y <strong>no se te cobrará nada ahora</strong>. Solo se aplicaría un cargo si cancelas tarde o no asistes, según esta política.
                            </p>
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <button type="button" className="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline">
                                Consultar la política completa
                              </button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                                  Política de cancelación
                                </DialogTitle>
                                <DialogDescription>
                                  {cancellationPolicy.name} · Versión {cancellationPolicy.versionNumber}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 text-sm leading-6">
                                <div className="rounded-md bg-muted p-3 font-medium">{cancellationSummary}</div>
                                {cancellationPolicy.noShowPercentage > 0 && (
                                  <p>Si no acudes a la cita sin avisar, podría aplicarse un cargo del {cancellationPolicy.noShowPercentage}%.</p>
                                )}
                                {cancellationPolicy.policyText && (
                                  <p className="whitespace-pre-wrap text-muted-foreground">{cancellationPolicy.policyText}</p>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-4">
                {step !== 'service' && (
                  <Button variant="outline" onClick={handleBack}>
                    <ArrowLeft className="h-4 w-4 mr-2" />Atrás
                  </Button>
                )}
                <div className="ml-auto">
                  {step === 'patient' ? (
                    <Button 
                      onClick={handleSubmit} 
                      disabled={loading || !patient.firstName || !patient.lastName || !patient.email || !acceptPrivacy || (!!cancellationPolicy && !acceptCancellationPolicy)}
                    >
                      {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Confirmar reserva
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleNext}
                      disabled={
                        (step === 'service' && !selectedService) ||
                        (step === 'location' && !selectedLocation) ||
                        (step === 'professional' && !selectedProfessional) ||
                        (step === 'datetime' && !selectedSlot)
                      }
                    >
                      Siguiente<ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
