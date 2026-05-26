import { useState, useEffect, useMemo } from 'react';
import { format, addDays, startOfDay, isBefore, startOfMonth, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Calendar as CalendarIcon, CheckCircle, Video, MapPin, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
import { formatLocationLine, type RescheduleLocation } from '@/lib/reschedule-helpers';

interface RescheduleTarget {
  sessionId: string;
  sessionType: string;
  sessionModality: string;
  locationId: string | null;
}

interface PortalBookingProps {
  centerSlug: string;
  onComplete: () => void;
  createSession: (params: {
    professionalId?: string;
    sessionTypeId: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    locationId: string;
  }) => Promise<{ success: boolean; error?: string; message?: string }>;
  getAvailability: (params: {
    professionalId?: string;
    date: string;
    sessionTypeId: string;
    locationId: string;
  }) => Promise<{ slots: string[]; serviceDuration: number; step: number }>;
  getMonthAvailability: (params: {
    professionalId?: string;
    month: string;
    sessionTypeId: string;
    locationId: string;
  }) => Promise<Record<string, number>>;
  rescheduleSession?: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string, newLocationId?: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  rescheduleTarget?: RescheduleTarget | null;
}

interface Professional {
  id: string;
  first_name: string;
  last_name: string;
}

interface SessionType {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Location {
  id: string;
  name: string;
  location_type: 'in_person' | 'online' | null;
  street: string | null;
  city: string | null;
}

interface CenterConfig {
  id: string;
  portal_allow_professional_selection: boolean;
  portal_default_professional_id: string | null;
  reschedule_max_days: number;
}

type Modality = 'online' | 'in_person';

export function PortalBooking({
  centerSlug,
  onComplete,
  createSession,
  getAvailability,
  getMonthAvailability,
  rescheduleSession,
  rescheduleTarget,
}: PortalBookingProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [centerConfig, setCenterConfig] = useState<CenterConfig | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Selection state
  const [selectedModality, setSelectedModality] = useState<Modality | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('');
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [serviceDuration, setServiceDuration] = useState(60);

  // Monthly calendar state
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [monthAvailability, setMonthAvailability] = useState<Record<string, number>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [daySlots, setDaySlots] = useState<string[]>([]);
  const [daySlotsLoading, setDaySlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const isRescheduleMode = !!rescheduleTarget;

  useEffect(() => {
    fetchInitialData();
  }, [centerSlug]);

  const fetchInitialData = async () => {
    try {
      const { data: centerData, error: centerError } = await supabase
        .rpc('get_portal_center', { p_slug: centerSlug });

      const center = centerData?.[0];
      if (centerError || !center) {
        console.error('Error fetching center:', centerError);
        setLoading(false);
        return;
      }

      setCenterConfig({
        id: center.id,
        portal_allow_professional_selection: center.portal_allow_professional_selection || false,
        portal_default_professional_id: center.portal_default_professional_id,
        reschedule_max_days: center.reschedule_max_days || 30,
      });

      if (center.portal_default_professional_id) {
        setSelectedProfessional(center.portal_default_professional_id);
      }

      if (center.portal_allow_professional_selection) {
        const { data: profs } = await supabase
          .rpc('portal_list_professionals', { _portal_slug: centerSlug });
        setProfessionals(profs || []);
      }

      const { data: types } = await supabase
        .from('session_types')
        .select('id, name, duration_minutes')
        .eq('center_id', center.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      setSessionTypes(types || []);

      const { data: locs } = await supabase
        .rpc('portal_list_locations', { p_center_slug: centerSlug });
      
      setLocations((locs || []) as Location[]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Auto-select values when in reschedule mode
  useEffect(() => {
    if (!isRescheduleMode || loading || !rescheduleTarget) return;
    
    const modality: Modality = rescheduleTarget.sessionModality === 'online' || 
      rescheduleTarget.sessionModality === 'zoom' || 
      rescheduleTarget.sessionModality === 'google_meet' ? 'online' : 'in_person';
    setSelectedModality(modality);

    if (rescheduleTarget.locationId) {
      setSelectedLocation(rescheduleTarget.locationId);
    }

    const matchingType = sessionTypes.find(t => t.name === rescheduleTarget.sessionType);
    if (matchingType) {
      setSelectedSessionType(matchingType.id);
      setServiceDuration(matchingType.duration_minutes);
    }
  }, [isRescheduleMode, loading, rescheduleTarget, sessionTypes]);

  // Filter locations by modality
  const filteredLocations = locations.filter(loc => {
    const locType = loc.location_type || 'in_person';
    return selectedModality === 'online' 
      ? locType === 'online'
      : locType === 'in_person';
  });

  const hasOnlineLocation = locations.some(loc => loc.location_type === 'online');
  const hasInPersonLocations = locations.some(loc => (loc.location_type || 'in_person') === 'in_person');
  const onlineLocation = locations.find(loc => loc.location_type === 'online');

  // Auto-select online location
  useEffect(() => {
    if (selectedModality === 'online') {
      if (onlineLocation) {
        setSelectedLocation(onlineLocation.id);
      } else {
        setSelectedLocation('');
      }
    } else if (selectedModality === 'in_person') {
      setSelectedLocation('');
    }
  }, [selectedModality, onlineLocation]);

  const maxDays = centerConfig?.reschedule_max_days || 30;
  const maxDate = useMemo(() => addDays(new Date(), maxDays), [maxDays]);

  // Fetch month availability when prerequisites are met or month changes
  useEffect(() => {
    if (!selectedSessionType || !selectedLocation) {
      setMonthAvailability({});
      return;
    }

    let cancelled = false;

    const fetchMonth = async () => {
      setMonthLoading(true);
      const monthStr = format(currentMonth, 'yyyy-MM');
      try {
        const result = await getMonthAvailability({
          professionalId: selectedProfessional || undefined,
          month: monthStr,
          sessionTypeId: selectedSessionType,
          locationId: selectedLocation,
        });
        if (!cancelled) {
          setMonthAvailability(result);
        }
      } catch {
        if (!cancelled) setMonthAvailability({});
      } finally {
        if (!cancelled) setMonthLoading(false);
      }
    };

    fetchMonth();
    return () => { cancelled = true; };
  }, [currentMonth, selectedSessionType, selectedLocation, selectedProfessional]);

  // Fetch day slots when a day is selected
  useEffect(() => {
    if (!selectedDay || !selectedSessionType || !selectedLocation) {
      setDaySlots([]);
      return;
    }

    let cancelled = false;
    const dateStr = format(selectedDay, 'yyyy-MM-dd');

    const fetchDaySlots = async () => {
      setDaySlotsLoading(true);
      try {
        const result = await getAvailability({
          professionalId: selectedProfessional || undefined,
          date: dateStr,
          sessionTypeId: selectedSessionType,
          locationId: selectedLocation,
        });
        if (!cancelled) {
          setDaySlots(result.slots);
          if (result.serviceDuration) setServiceDuration(result.serviceDuration);
        }
      } catch {
        if (!cancelled) setDaySlots([]);
      } finally {
        if (!cancelled) setDaySlotsLoading(false);
      }
    };

    fetchDaySlots();
    return () => { cancelled = true; };
  }, [selectedDay, selectedSessionType, selectedLocation, selectedProfessional]);

  const handleModalityChange = (value: Modality) => {
    setSelectedModality(value);
    setSelectedSlot(null);
    setSelectedDay(null);
    setMonthAvailability({});
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    setSelectedSlot(null);
    setSelectedDay(null);
    setMonthAvailability({});
  };

  const handleSessionTypeChange = (typeId: string) => {
    setSelectedSessionType(typeId);
    const type = sessionTypes.find(t => t.id === typeId);
    if (type) {
      setServiceDuration(type.duration_minutes);
    }
    setSelectedSlot(null);
    setSelectedDay(null);
    setMonthAvailability({});
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = format(day, 'yyyy-MM-dd');
    if (!monthAvailability[dateStr]) return;
    setSelectedDay(day);
    setSelectedSlot(null);
  };

  const handleSlotSelect = (date: string, time: string) => {
    setSelectedSlot({ date, time });
  };

  const handleSubmit = async () => {
    if (!selectedSlot || !selectedSessionType || !selectedLocation) {
      toast.error('Completa todos los campos');
      return;
    }

    setSubmitting(true);

    const [hours, mins] = selectedSlot.time.split(':').map(Number);
    const endMinutes = hours * 60 + mins + serviceDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    let result: { success: boolean; error?: string; message?: string };

    if (isRescheduleMode && rescheduleSession && rescheduleTarget) {
      const locationChanged = selectedLocation && selectedLocation !== rescheduleTarget.locationId;
      result = await rescheduleSession(
        rescheduleTarget.sessionId,
        selectedSlot.date,
        selectedSlot.time,
        endTime,
        locationChanged ? selectedLocation : undefined,
      );
    } else {
      result = await createSession({
        professionalId: selectedProfessional || undefined,
        sessionTypeId: selectedSessionType,
        sessionDate: selectedSlot.date,
        startTime: selectedSlot.time,
        endTime,
        locationId: selectedLocation,
      });
    }

    setSubmitting(false);

    if (result.success) {
      setSuccess(true);
      setSuccessMessage(result.message || (isRescheduleMode ? 'Cita reprogramada correctamente' : 'Cita solicitada correctamente'));
      toast.success(result.message || (isRescheduleMode ? 'Cita reprogramada' : 'Cita solicitada'));
    } else {
      toast.error(result.error || (isRescheduleMode ? 'Error al reprogramar' : 'Error al solicitar la cita'));
    }
  };

  const canSelectLocation = selectedModality !== null;
  const canSelectService = selectedLocation !== '';
  const canSelectProfessional = selectedSessionType !== '';
  const canSelectDate = selectedSessionType !== '' && selectedLocation !== '';

  // Calendar modifiers for available days
  const availableDates = useMemo(() => {
    return Object.keys(monthAvailability).map(d => new Date(d + 'T12:00:00'));
  }, [monthAvailability]);

  const today = startOfDay(new Date());

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center space-y-4">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <div>
              <h3 className="text-lg font-medium">¡Solicitud enviada!</h3>
              <p className="text-muted-foreground mt-2">{successMessage}</p>
            </div>
            <Button onClick={onComplete}>Ver mis citas</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{isRescheduleMode ? 'Reprogramar cita' : 'Solicitar cita'}</CardTitle>
        <CardDescription>
          {isRescheduleMode ? 'Selecciona una nueva fecha y hora' : 'Selecciona modalidad, ubicación, servicio, fecha y hora'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Modality */}
        <div className="space-y-2">
          <Label>Modalidad</Label>
          <RadioGroup
            value={selectedModality || ''}
            onValueChange={(v) => handleModalityChange(v as Modality)}
            className="grid grid-cols-2 gap-3"
          >
            {hasInPersonLocations && (
              <div>
                <RadioGroupItem value="in_person" id="in_person" className="peer sr-only" />
                <Label
                  htmlFor="in_person"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-colors",
                    selectedModality === 'in_person'
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <MapPin className="h-4 w-4" />
                  Presencial
                </Label>
              </div>
            )}
            {hasOnlineLocation && (
              <div>
                <RadioGroupItem value="online" id="online" className="peer sr-only" />
                <Label
                  htmlFor="online"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border-2 p-3 cursor-pointer transition-colors",
                    selectedModality === 'online'
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted"
                  )}
                >
                  <Video className="h-4 w-4" />
                  Online
                </Label>
              </div>
            )}
          </RadioGroup>
          
          {!hasOnlineLocation && !hasInPersonLocations && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>No hay ubicaciones disponibles para reservar</span>
            </div>
          )}
        </div>

        {canSelectLocation && selectedModality === 'online' && !onlineLocation && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
            <Video className="h-4 w-4" />
            <span>No hay disponibilidad online configurada para este centro</span>
          </div>
        )}

        {/* Step 2: Location */}
        {canSelectLocation && selectedModality === 'in_person' && filteredLocations.length > 0 && (
          <div className="space-y-2">
            <Label>Ubicación</Label>
            <Select value={selectedLocation} onValueChange={handleLocationChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona ubicación" />
              </SelectTrigger>
              <SelectContent>
                {filteredLocations.map(loc => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}{loc.city ? ` - ${loc.city}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {canSelectLocation && selectedModality === 'in_person' && filteredLocations.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>No hay ubicaciones presenciales disponibles</span>
          </div>
        )}

        {canSelectLocation && selectedModality === 'online' && selectedLocation && (
          <div className="p-3 rounded-lg bg-muted text-sm flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground" />
            <span>Sesión online</span>
          </div>
        )}

        {/* Step 3: Session Type */}
        {canSelectService && sessionTypes.length > 0 && (
          <div className="space-y-2">
            <Label>Tipo de sesión</Label>
            <Select value={selectedSessionType} onValueChange={handleSessionTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tipo" />
              </SelectTrigger>
              <SelectContent>
                {sessionTypes.map(type => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} ({type.duration_minutes} min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Step 4: Professional Selection */}
        {canSelectProfessional && centerConfig?.portal_allow_professional_selection && professionals.length > 0 && (
          <div className="space-y-2">
            <Label>Profesional</Label>
            <Select value={selectedProfessional} onValueChange={setSelectedProfessional}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona profesional" />
              </SelectTrigger>
              <SelectContent>
                {professionals.map(prof => (
                  <SelectItem key={prof.id} value={prof.id}>
                    {prof.first_name} {prof.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Step 5: Monthly Calendar + Day Slots */}
        {canSelectDate && (
          <div className="space-y-4">
            <Label>Selecciona fecha y hora ({serviceDuration} min)</Label>
            <div className="border rounded-lg p-3">
              {monthLoading && Object.keys(monthAvailability).length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Cargando disponibilidad...</span>
                </div>
              ) : (
                <Calendar
                  mode="single"
                  selected={selectedDay || undefined}
                  onSelect={handleDaySelect}
                  month={currentMonth}
                  onMonthChange={setCurrentMonth}
                  locale={es}
                  disabled={(date) => {
                    const dateStr = format(date, 'yyyy-MM-dd');
                    return isBefore(date, today) || isBefore(maxDate, date) || !monthAvailability[dateStr];
                  }}
                  modifiers={{
                    available: availableDates,
                  }}
                  modifiersClassNames={{
                    available: 'relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-green-500',
                  }}
                  className="p-0 pointer-events-auto mx-auto"
                />
              )}
            </div>

            {/* Day Slots */}
            {selectedDay && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium">
                  {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
                </p>
                {daySlotsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Cargando horarios...</span>
                  </div>
                ) : daySlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No hay horarios disponibles</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {daySlots.map(slot => {
                      const dateStr = format(selectedDay, 'yyyy-MM-dd');
                      const isSelected = selectedSlot?.date === dateStr && selectedSlot?.time === slot;
                      return (
                        <button
                          key={slot}
                          onClick={() => handleSlotSelect(dateStr, slot)}
                          className={cn(
                            "text-sm py-1.5 px-3 rounded-md transition-colors font-medium",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/80 text-foreground"
                          )}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Selected slot confirmation */}
        {selectedSlot && (
          <div className="p-3 rounded-lg bg-primary/10 text-sm flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span>
              Seleccionado: {format(new Date(selectedSlot.date), "EEEE d 'de' MMMM", { locale: es })} a las {selectedSlot.time}
            </span>
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={!selectedSlot || !selectedSessionType || !selectedLocation || submitting}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CalendarIcon className="h-4 w-4 mr-2" />
          )}
          {isRescheduleMode ? 'Reprogramar cita' : 'Solicitar cita'}
        </Button>
      </CardContent>
    </Card>
  );
}
