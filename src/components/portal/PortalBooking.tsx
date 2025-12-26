import { useState, useEffect, useMemo } from 'react';
import { format, addDays, startOfDay, isBefore, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Calendar, ChevronLeft, ChevronRight, CheckCircle, Video, MapPin, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface WeekSlots {
  [dateKey: string]: {
    slots: string[];
    loading: boolean;
  };
}

export function PortalBooking({
  centerSlug,
  onComplete,
  createSession,
  getAvailability,
}: PortalBookingProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [centerConfig, setCenterConfig] = useState<CenterConfig | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [sessionTypes, setSessionTypes] = useState<SessionType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Selection state - in correct order
  const [selectedModality, setSelectedModality] = useState<Modality | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('');
  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [serviceDuration, setServiceDuration] = useState(60);

  // Week view state
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [weekSlots, setWeekSlots] = useState<WeekSlots>({});
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, [centerSlug]);

  const fetchInitialData = async () => {
    try {
      // Get center config using secure function
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

      // Set default professional
      if (center.portal_default_professional_id) {
        setSelectedProfessional(center.portal_default_professional_id);
      }

      // Get professionals if selection is allowed
      if (center.portal_allow_professional_selection) {
        const { data: profs } = await supabase
          .rpc('portal_list_professionals', { _portal_slug: centerSlug });
        setProfessionals(profs || []);
      }

      // Get session types
      const { data: types } = await supabase
        .from('session_types')
        .select('id, name, duration_minutes')
        .eq('center_id', center.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      setSessionTypes(types || []);

      // Get public locations
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

  // Filter locations by modality - handle null location_type as in_person
  const filteredLocations = locations.filter(loc => {
    const locType = loc.location_type || 'in_person';
    return selectedModality === 'online' 
      ? locType === 'online'
      : locType === 'in_person';
  });

  // Check if online is available
  const hasOnlineLocation = locations.some(loc => loc.location_type === 'online');
  const hasInPersonLocations = locations.some(loc => (loc.location_type || 'in_person') === 'in_person');
  const onlineLocation = locations.find(loc => loc.location_type === 'online');

  // Auto-select online location when modality is online
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

  // Generate week days - stabilize maxDate calculation
  const maxDays = centerConfig?.reschedule_max_days || 30;
  const maxDate = useMemo(() => addDays(new Date(), maxDays), [maxDays]);
  
  const weekDays = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      .filter(date => !isBefore(date, today) && !isBefore(maxDate, date));
  }, [weekStart, maxDate]);

  const canGoPrev = !isBefore(addDays(weekStart, -1), startOfDay(new Date()));
  const canGoNext = !isBefore(maxDate, addDays(weekStart, 7));

  // Fetch availability for all week days when prerequisites are met
  // Use serialized weekDays to avoid infinite loops
  const weekDaysKey = weekDays.map(d => format(d, 'yyyy-MM-dd')).join(',');
  
  useEffect(() => {
    if (!selectedSessionType || !selectedLocation || weekDays.length === 0) {
      setWeekSlots({});
      return;
    }

    let cancelled = false;

    const fetchWeekAvailability = async () => {
      const newWeekSlots: WeekSlots = {};
      
      // Initialize loading state for all days
      weekDays.forEach(date => {
        const dateKey = format(date, 'yyyy-MM-dd');
        newWeekSlots[dateKey] = { slots: [], loading: true };
      });
      setWeekSlots(newWeekSlots);

      // Fetch all days in parallel
      const fetchPromises = weekDays.map(async (date) => {
        const dateKey = format(date, 'yyyy-MM-dd');
        try {
          const result = await getAvailability({
            professionalId: selectedProfessional || undefined,
            date: dateKey,
            sessionTypeId: selectedSessionType,
            locationId: selectedLocation,
          });
          return { dateKey, slots: result.slots, serviceDuration: result.serviceDuration };
        } catch {
          return { dateKey, slots: [], serviceDuration: 60 };
        }
      });

      const results = await Promise.all(fetchPromises);

      if (cancelled) return;

      const finalWeekSlots: WeekSlots = {};
      results.forEach(result => {
        finalWeekSlots[result.dateKey] = { slots: result.slots, loading: false };
        if (result.serviceDuration) {
          setServiceDuration(result.serviceDuration);
        }
      });
      setWeekSlots(finalWeekSlots);
    };

    fetchWeekAvailability();

    return () => {
      cancelled = true;
    };
  }, [weekDaysKey, selectedSessionType, selectedLocation, selectedProfessional]);

  const handleModalityChange = (value: Modality) => {
    setSelectedModality(value);
    setSelectedSlot(null);
    setWeekSlots({});
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    setSelectedSlot(null);
    setWeekSlots({});
  };

  const handleSessionTypeChange = (typeId: string) => {
    setSelectedSessionType(typeId);
    const type = sessionTypes.find(t => t.id === typeId);
    if (type) {
      setServiceDuration(type.duration_minutes);
    }
    setSelectedSlot(null);
    setWeekSlots({});
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

    // Calculate end time using actual service duration
    const [hours, mins] = selectedSlot.time.split(':').map(Number);
    const endMinutes = hours * 60 + mins + serviceDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const result = await createSession({
      professionalId: selectedProfessional || undefined,
      sessionTypeId: selectedSessionType,
      sessionDate: selectedSlot.date,
      startTime: selectedSlot.time,
      endTime,
      locationId: selectedLocation,
    });

    setSubmitting(false);

    if (result.success) {
      setSuccess(true);
      setSuccessMessage(result.message || 'Cita solicitada correctamente');
      toast.success(result.message || 'Cita solicitada');
    } else {
      toast.error(result.error || 'Error al solicitar la cita');
    }
  };

  // Check if we can proceed to next step
  const canSelectLocation = selectedModality !== null;
  const canSelectService = selectedLocation !== '';
  const canSelectProfessional = selectedSessionType !== '';
  const canSelectDate = selectedSessionType !== '' && selectedLocation !== '';

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
        <CardTitle className="text-lg">Solicitar cita</CardTitle>
        <CardDescription>
          Selecciona modalidad, ubicación, servicio, fecha y hora
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
          
          {/* No modalities available */}
          {!hasOnlineLocation && !hasInPersonLocations && (
            <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>No hay ubicaciones disponibles para reservar</span>
            </div>
          )}
        </div>

        {/* Message when online selected but no online location is public */}
        {canSelectLocation && selectedModality === 'online' && !onlineLocation && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
            <Video className="h-4 w-4" />
            <span>No hay disponibilidad online configurada para este centro</span>
          </div>
        )}

        {/* Step 2: Location (for in-person, auto-selected for online) */}
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

        {/* Message when in-person selected but no locations */}
        {canSelectLocation && selectedModality === 'in_person' && filteredLocations.length === 0 && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-700 text-sm flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            <span>No hay ubicaciones presenciales disponibles</span>
          </div>
        )}

        {/* Show selected online location */}
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

        {/* Step 4: Professional Selection (optional) */}
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

        {/* Step 5: Weekly Calendar with inline slots */}
        {canSelectDate && (
          <div className="space-y-2">
            <Label>Selecciona fecha y hora ({serviceDuration} min)</Label>
            <div className="border rounded-lg p-3">
              {/* Week Navigation */}
              <div className="flex items-center justify-between mb-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  disabled={!canGoPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">
                  {format(weekStart, "MMMM yyyy", { locale: es })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  disabled={!canGoNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

        {/* Filter to only show days with availability */}
              {(() => {
                const isLoading = Object.values(weekSlots).some(s => s.loading);
                const daysWithSlots = weekDays.filter(date => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const dayData = weekSlots[dateKey];
                  return dayData && !dayData.loading && dayData.slots.length > 0;
                });
                
                // Show loading state
                if (isLoading && daysWithSlots.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Buscando disponibilidad...</span>
                    </div>
                  );
                }
                
                // No availability this week
                if (!isLoading && daysWithSlots.length === 0) {
                  return (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No hay disponibilidad esta semana</p>
                      <p className="text-xs mt-1">Prueba con la siguiente semana</p>
                    </div>
                  );
                }
                
                // Show only days with availability
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {daysWithSlots.map(date => {
                      const dateKey = format(date, 'yyyy-MM-dd');
                      const dayData = weekSlots[dateKey];
                      const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

                      return (
                        <div 
                          key={dateKey} 
                          className={cn(
                            "flex flex-col items-center p-2 rounded-lg border",
                            isToday && "border-primary bg-primary/5"
                          )}
                        >
                          {/* Day header */}
                          <div className="text-xs font-medium text-muted-foreground uppercase">
                            {format(date, 'EEE', { locale: es })}
                          </div>
                          <div className={cn(
                            "text-lg font-semibold mb-2",
                            isToday && "text-primary"
                          )}>
                            {format(date, 'd')}
                          </div>
                          
                          {/* Slots for this day */}
                          <div className="flex flex-wrap gap-1 justify-center max-h-[120px] overflow-y-auto w-full">
                            {dayData?.slots.map(slot => {
                              const isSelected = selectedSlot?.date === dateKey && selectedSlot?.time === slot;
                              return (
                                <button
                                  key={`${dateKey}-${slot}`}
                                  onClick={() => handleSlotSelect(dateKey, slot)}
                                  className={cn(
                                    "text-xs py-1 px-2 rounded transition-colors font-medium",
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
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Selected slot confirmation */}
        {selectedSlot && (
          <div className="p-3 rounded-lg bg-primary/10 text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
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
            <Calendar className="h-4 w-4 mr-2" />
          )}
          Solicitar cita
        </Button>
      </CardContent>
    </Card>
  );
}
