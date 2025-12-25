import { useState, useEffect } from 'react';
import { format, addDays, startOfDay, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Calendar, Clock, ChevronLeft, ChevronRight, CheckCircle, Video, MapPin } from 'lucide-react';
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
  location_type: 'in_person' | 'online';
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
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [serviceDuration, setServiceDuration] = useState(60);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));

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
        .eq('is_active', true);

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

  // Filter locations by modality
  const filteredLocations = locations.filter(loc => 
    selectedModality === 'online' 
      ? loc.location_type === 'online'
      : loc.location_type === 'in_person'
  );

  // Auto-select online location when modality is online
  useEffect(() => {
    if (selectedModality === 'online') {
      const onlineLocation = locations.find(loc => loc.location_type === 'online');
      if (onlineLocation) {
        setSelectedLocation(onlineLocation.id);
      } else {
        setSelectedLocation('');
      }
    } else {
      setSelectedLocation('');
    }
  }, [selectedModality, locations]);

  // Fetch availability when relevant params change
  useEffect(() => {
    if (selectedDate && selectedSessionType && selectedLocation) {
      fetchSlots();
    }
  }, [selectedDate, selectedSessionType, selectedLocation, selectedProfessional]);

  const fetchSlots = async () => {
    if (!selectedDate || !selectedSessionType || !selectedLocation) return;

    setSlotsLoading(true);
    setSelectedSlot('');

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const result = await getAvailability({
      professionalId: selectedProfessional || undefined,
      date: dateStr,
      sessionTypeId: selectedSessionType,
      locationId: selectedLocation,
    });
    
    setAvailableSlots(result.slots);
    setServiceDuration(result.serviceDuration);
    setSlotsLoading(false);
  };

  const handleModalityChange = (value: Modality) => {
    setSelectedModality(value);
    setSelectedSlot('');
    setAvailableSlots([]);
  };

  const handleLocationChange = (value: string) => {
    setSelectedLocation(value);
    setSelectedSlot('');
    setAvailableSlots([]);
  };

  const handleSessionTypeChange = (typeId: string) => {
    setSelectedSessionType(typeId);
    const type = sessionTypes.find(t => t.id === typeId);
    if (type) {
      setServiceDuration(type.duration_minutes);
    }
    setSelectedSlot('');
    setAvailableSlots([]);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot('');
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSlot || !selectedSessionType || !selectedLocation) {
      toast.error('Completa todos los campos');
      return;
    }

    setSubmitting(true);

    // Calculate end time using actual service duration
    const [hours, mins] = selectedSlot.split(':').map(Number);
    const endMinutes = hours * 60 + mins + serviceDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const result = await createSession({
      professionalId: selectedProfessional || undefined,
      sessionTypeId: selectedSessionType,
      sessionDate: format(selectedDate, 'yyyy-MM-dd'),
      startTime: selectedSlot,
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
  const canSelectSlot = selectedDate !== null;

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

  // Check if online is available
  const hasOnlineLocation = locations.some(loc => loc.location_type === 'online');
  const hasInPersonLocations = locations.some(loc => loc.location_type === 'in_person');

  // Generate week days
  const maxDate = addDays(new Date(), centerConfig?.reschedule_max_days || 30);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    .filter(date => !isBefore(date, startOfDay(new Date())) && !isBefore(maxDate, date));

  const canGoPrev = !isBefore(addDays(weekStart, -1), startOfDay(new Date()));
  const canGoNext = !isBefore(maxDate, addDays(weekStart, 7));

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
        </div>

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

        {/* Step 5: Date Selection */}
        {canSelectDate && (
          <div className="space-y-2">
            <Label>Fecha</Label>
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

              {/* Days */}
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {weekDays.map(date => {
                  const isSelected = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => handleDateSelect(date)}
                      className={cn(
                        "p-1.5 sm:p-2 rounded-lg text-center transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : isToday
                          ? "bg-primary/10 hover:bg-primary/20"
                          : "hover:bg-muted"
                      )}
                    >
                      <div className="text-[10px] sm:text-xs font-medium">
                        {format(date, 'EEE', { locale: es })}
                      </div>
                      <div className="text-sm sm:text-lg font-semibold">
                        {format(date, 'd')}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Time Slots */}
        {canSelectSlot && selectedDate && (
          <div className="space-y-2">
            <Label>Hora disponible ({serviceDuration} min)</Label>
            {slotsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableSlots.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No hay horas disponibles este día</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {availableSlots.map(slot => (
                  <button
                    key={slot}
                    onClick={() => setSelectedSlot(slot)}
                    className={cn(
                      "p-2 rounded-lg text-sm font-medium transition-colors",
                      selectedSlot === slot
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmit}
          disabled={!selectedDate || !selectedSlot || !selectedSessionType || !selectedLocation || submitting}
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
