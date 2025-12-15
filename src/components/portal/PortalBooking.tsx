import { useState, useEffect } from 'react';
import { format, addDays, startOfDay, isBefore } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, Calendar, Clock, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PortalBookingProps {
  centerSlug: string;
  onComplete: () => void;
  createSession: (params: {
    professionalId?: string;
    sessionTypeId?: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
  }) => Promise<{ success: boolean; error?: string; message?: string }>;
  getAvailability: (professionalId: string, date: string) => Promise<{ slots: string[]; slotDuration: number }>;
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

interface CenterConfig {
  portal_allow_professional_selection: boolean;
  portal_default_professional_id: string | null;
  reschedule_max_days: number;
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

  const [selectedProfessional, setSelectedProfessional] = useState<string>('');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [slotDuration, setSlotDuration] = useState(30);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Week navigation
  const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    fetchInitialData();
  }, [centerSlug]);

  const fetchInitialData = async () => {
    try {
      // Get center config
      const { data: center } = await supabase
        .from('centers')
        .select('id, portal_allow_professional_selection, portal_default_professional_id, reschedule_max_days')
        .eq('portal_slug', centerSlug)
        .single();

      if (center) {
        setCenterConfig({
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
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('center_id', center.id)
            .eq('is_active', true);
          
          setProfessionals(profs || []);
        }

        // Get session types
        const { data: types } = await supabase
          .from('session_types')
          .select('id, name, duration_minutes')
          .eq('center_id', center.id)
          .eq('is_active', true);

        setSessionTypes(types || []);
        if (types && types.length > 0) {
          setSelectedSessionType(types[0].id);
          setSlotDuration(types[0].duration_minutes);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Fetch availability when date or professional changes
  useEffect(() => {
    if (selectedDate && selectedProfessional) {
      fetchSlots();
    }
  }, [selectedDate, selectedProfessional]);

  const fetchSlots = async () => {
    if (!selectedDate || !selectedProfessional) return;

    setSlotsLoading(true);
    setSelectedSlot('');

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const { slots, slotDuration: duration } = await getAvailability(selectedProfessional, dateStr);
    
    setAvailableSlots(slots);
    if (duration) setSlotDuration(duration);
    setSlotsLoading(false);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedSlot('');
  };

  const handleSessionTypeChange = (typeId: string) => {
    setSelectedSessionType(typeId);
    const type = sessionTypes.find(t => t.id === typeId);
    if (type) {
      setSlotDuration(type.duration_minutes);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDate || !selectedSlot) {
      toast.error('Selecciona fecha y hora');
      return;
    }

    setSubmitting(true);

    // Calculate end time
    const [hours, mins] = selectedSlot.split(':').map(Number);
    const endMinutes = hours * 60 + mins + slotDuration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;

    const result = await createSession({
      professionalId: selectedProfessional || undefined,
      sessionTypeId: selectedSessionType || undefined,
      sessionDate: format(selectedDate, 'yyyy-MM-dd'),
      startTime: selectedSlot,
      endTime,
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
          Selecciona el tipo de sesión, fecha y hora
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Session Type */}
        {sessionTypes.length > 0 && (
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

        {/* Professional Selection */}
        {centerConfig?.portal_allow_professional_selection && professionals.length > 0 && (
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

        {/* Date Selection */}
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
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(date => {
                const isSelected = selectedDate && format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
                const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => handleDateSelect(date)}
                    className={cn(
                      "p-2 rounded-lg text-center transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : isToday
                        ? "bg-primary/10 hover:bg-primary/20"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="text-xs font-medium">
                      {format(date, 'EEE', { locale: es })}
                    </div>
                    <div className="text-lg font-semibold">
                      {format(date, 'd')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Time Slots */}
        {selectedDate && selectedProfessional && (
          <div className="space-y-2">
            <Label>Hora disponible</Label>
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
          disabled={!selectedDate || !selectedSlot || submitting}
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
