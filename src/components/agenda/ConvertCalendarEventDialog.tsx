import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, User, Loader2, MapPin, Package } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PatientSelector } from './PatientSelector';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { useLocations } from '@/hooks/useLocations';
import { usePatientActiveBonos } from '@/hooks/useBonos';
import { useConvertCalendarEvent } from '@/hooks/useConvertCalendarEvent';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { usePatient } from '@/hooks/usePatients';

interface ConvertCalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarEvent: CalendarEvent | null;
  onSuccess?: () => void;
}

export function ConvertCalendarEventDialog({
  open,
  onOpenChange,
  calendarEvent,
  onSuccess,
}: ConvertCalendarEventDialogProps) {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sessionTypeId, setSessionTypeId] = useState<string>('');
  const [sessionModality, setSessionModality] = useState<string>('in_person');
  const [locationId, setLocationId] = useState<string>('');
  const [bonoId, setBonoId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [price, setPrice] = useState<number>(0);

  const { data: sessionTypes } = useSessionTypes();
  const { data: locations } = useLocations();
  const { data: patientBonos } = usePatientActiveBonos(patientId);
  const { data: selectedPatient } = usePatient(patientId || undefined);
  const convertMutation = useConvertCalendarEvent();

  const patientName = selectedPatient
    ? `${selectedPatient.first_name} ${selectedPatient.last_name}`
    : '';

  useEffect(() => {
    if (open && calendarEvent) {
      setPatientId(null);
      setSessionTypeId('');
      setSessionModality('in_person');
      setLocationId('');
      setBonoId('');
      setNotes(calendarEvent.summary || '');
      setPrice(0);
    }
  }, [open, calendarEvent]);

  // Update price when session type changes
  useEffect(() => {
    if (sessionTypeId && sessionTypes) {
      const selectedType = sessionTypes.find(t => t.id === sessionTypeId);
      if (selectedType) {
        setPrice(selectedType.default_price || 0);
      }
    }
  }, [sessionTypeId, sessionTypes]);

  // Update price when bono is selected
  useEffect(() => {
    if (bonoId && patientBonos) {
      const selectedBono = patientBonos.find(b => b.id === bonoId);
      if (selectedBono) {
        setPrice(selectedBono.price_per_session || 0);
      }
    } else if (sessionTypeId && sessionTypes && !bonoId) {
      const selectedType = sessionTypes.find(t => t.id === sessionTypeId);
      if (selectedType) {
        setPrice(selectedType.default_price || 0);
      }
    }
  }, [bonoId, patientBonos, sessionTypeId, sessionTypes]);

  const handlePatientSelect = (id: string) => {
    setPatientId(id);
    setBonoId(''); // Reset bono when patient changes
  };

  const handleConvert = async () => {
    if (!calendarEvent || !patientId || !sessionTypeId) return;

    const selectedType = sessionTypes?.find(t => t.id === sessionTypeId);

    await convertMutation.mutateAsync({
      calendarEventId: calendarEvent.id,
      patientId,
      sessionType: selectedType?.name || 'individual',
      price,
      sessionModality,
      locationId: locationId || null,
      notes: notes || null,
      bonoId: bonoId || null,
      professionalId: calendarEvent.professional_id,
      googleEventId: calendarEvent.google_event_id,
      patientName,
    });

    onOpenChange(false);
    onSuccess?.();
  };

  if (!calendarEvent) return null;

  const startDate = calendarEvent.start_at ? new Date(calendarEvent.start_at) : new Date();
  const endDate = calendarEvent.end_at ? new Date(calendarEvent.end_at) : new Date();

  const formatTimeMadrid = (d: Date) => {
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  };

  const activeBonos = patientBonos?.filter(b => 
    b.status === 'active' && 
    (b.total_sessions - (b.used_sessions || 0)) > 0
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Convertir a consulta</DialogTitle>
          <DialogDescription>
            Convierte este evento de Google Calendar en una consulta de Psycma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Event Info */}
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {format(startDate, "EEEE, d 'de' MMMM yyyy", { locale: es })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {calendarEvent.all_day
                ? 'Todo el día'
                : `${formatTimeMadrid(startDate)} - ${formatTimeMadrid(endDate)}`}
            </div>
            {calendarEvent.summary && (
              <p className="text-sm italic text-muted-foreground mt-2">
                "{calendarEvent.summary}"
              </p>
            )}
          </div>

          {/* Patient Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Contacto *
            </Label>
            {patientId && patientName ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <span className="font-medium flex-1">{patientName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPatientId(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <PatientSelector onSelect={handlePatientSelect} />
            )}
          </div>

          {/* Session Type */}
          <div className="space-y-2">
            <Label>Tipo de sesión *</Label>
            <Select value={sessionTypeId} onValueChange={setSessionTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                {sessionTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} - {type.default_price}€
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Modality */}
          <div className="space-y-2">
            <Label>Modalidad</Label>
            <Select value={sessionModality} onValueChange={setSessionModality}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_person">Presencial</SelectItem>
                <SelectItem value="google_meet">Google Meet</SelectItem>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="custom_link">Videollamada (link propio)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Location (only for in_person) */}
          {sessionModality === 'in_person' && locations && locations.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Ubicación
              </Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Bono (if patient has active bonos) */}
          {patientId && activeBonos.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Bono
              </Label>
              <Select value={bonoId} onValueChange={setBonoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin bono" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin bono</SelectItem>
                  {activeBonos.map((bono) => (
                    <SelectItem key={bono.id} value={bono.id}>
                      {bono.name} ({bono.total_sessions - (bono.used_sessions || 0)} sesiones restantes)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas de la sesión..."
              rows={3}
            />
          </div>

          {/* Price summary */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10">
            <span className="font-medium">Precio</span>
            <span className="text-lg font-bold">{price.toFixed(2)}€</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConvert}
            disabled={!patientId || !sessionTypeId || convertMutation.isPending}
          >
            {convertMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Convirtiendo...
              </>
            ) : (
              'Convertir a consulta'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
