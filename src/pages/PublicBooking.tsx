import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { usePublicBooking } from '@/hooks/usePublicBooking';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, MapPin, Video, Clock, User, CheckCircle, ArrowLeft, ArrowRight, Copy, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ClosedAgendaScreen } from '@/components/booking/ClosedAgendaScreen';

type Step = 'service' | 'location' | 'professional' | 'datetime' | 'patient' | 'confirmation';

export default function PublicBooking() {
  const { centerSlug } = useParams<{ centerSlug: string }>();
  const [searchParams] = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';
  
  const {
    config, services, locations, professionals, allowProfessionalSelection,
    loading, error, disabled, bootstrap,
    getAvailability, getMonthAvailability, createBooking,
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
      notes: notes || undefined
    });

    if (result?.success) {
      setBookingResult(result);
      setStep('confirmation');
      toast.success(result.message);
    } else {
      toast.error(error || 'Error al crear la reserva');
    }
  };

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
              <CheckCircle className="h-16 w-16 text-success mx-auto mb-4" />
              <CardTitle>¡Reserva {config?.requireApproval ? 'solicitada' : 'confirmada'}!</CardTitle>
              <CardDescription>{bookingResult.message}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p><strong>Servicio:</strong> {selectedServiceData?.name}</p>
                <p><strong>Fecha:</strong> {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</p>
                <p><strong>Hora:</strong> {selectedSlot?.startTime} - {selectedSlot?.endTime}</p>
                <p><strong>Ubicación:</strong> {selectedLocationData?.name}</p>
              </div>
              <div className="flex flex-col gap-2">
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
                  <div className="flex items-start gap-2">
                    <Checkbox id="privacy" checked={acceptPrivacy} onCheckedChange={c => setAcceptPrivacy(!!c)} />
                    <Label htmlFor="privacy" className="text-sm leading-tight">
                      Acepto la política de privacidad y el tratamiento de mis datos *
                    </Label>
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
                      disabled={loading || !patient.firstName || !patient.lastName || !patient.email || !acceptPrivacy}
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