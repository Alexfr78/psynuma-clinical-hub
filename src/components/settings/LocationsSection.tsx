import { useState } from 'react';
import { MapPin, Plus, Trash2, Clock, ChevronDown, ChevronUp, Loader2, Globe, Lock, Video } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { useLocations, useCreateLocation, useDeleteLocation, useUpdateLocation, useOnlineLocationExists, type LocationInsert, type CenterLocation } from '@/hooks/useLocations';
import { useAllLocationSchedules, useUpsertLocationSchedule, useInitializeLocationSchedules, type LocationSchedule } from '@/hooks/useLocationSchedules';
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

const DAYS_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface LocationCardProps {
  location: CenterLocation;
  schedules: LocationSchedule[];
  onDelete: () => void;
  onScheduleChange: (day: number, field: 'is_open' | 'start_time' | 'end_time' | 'is_default', value: boolean | string) => void;
  onVisibilityChange: (isPublic: boolean) => void;
  isUpdating: boolean;
}

function LocationCard({ location, schedules, onDelete, onScheduleChange, onVisibilityChange, isUpdating }: LocationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isPublic = location.is_public ?? true;
  const isOnline = location.location_type === 'online';
  const LocationIcon = isOnline ? Video : MapPin;

  const getScheduleForDay = (day: number) => {
    return schedules.find(s => s.day_of_week === day) || {
      day_of_week: day,
      start_time: '09:00',
      end_time: '21:00',
      is_open: day >= 1 && day <= 5,
    };
  };

  const formatAddress = () => {
    if (isOnline) return 'Sesión virtual';
    const parts = [
      location.street,
      location.number_details,
      location.city,
      location.postal_code,
    ].filter(Boolean);
    return parts.join(', ') || 'Sin dirección';
  };

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-start justify-between p-4">
            <div className="flex items-start gap-3">
              <div className={`mt-1 rounded-lg p-2 ${isOnline ? 'bg-blue-500/10' : 'bg-primary/10'}`}>
                <LocationIcon className={`h-4 w-4 ${isOnline ? 'text-blue-500' : 'text-primary'}`} />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium">{location.name}</h4>
                  <Badge variant="outline" className="text-xs">
                    {isOnline ? 'Online' : 'Presencial'}
                  </Badge>
                  <Badge variant={isPublic ? 'default' : 'secondary'} className="text-xs">
                    {isPublic ? (
                      <>
                        <Globe className="h-3 w-3 mr-1" />
                        Público
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3 mr-1" />
                        Privado
                      </>
                    )}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{formatAddress()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Clock className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Horarios</span>
                  {isOpen ? (
                    <ChevronUp className="ml-2 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <CollapsibleContent>
            <Separator />
            <div className="p-4 space-y-4">
              {/* Visibility toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {isPublic ? <Globe className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-muted-foreground" />}
                    Visible para pacientes
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isPublic 
                      ? 'Los pacientes pueden ver esta ubicación en el portal de reservas'
                      : 'Esta ubicación solo es visible para el equipo del centro'
                    }
                  </p>
                </div>
                <Switch
                  checked={isPublic}
                  onCheckedChange={onVisibilityChange}
                />
              </div>

              {/* Schedule section */}
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                Horarios de apertura
                {isUpdating && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
              
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                  const schedule = getScheduleForDay(day);
                  const isOpenDay = schedule.is_open ?? false;

                  return (
                    <div
                      key={day}
                      className="flex items-center gap-4 rounded-lg border p-3"
                    >
                      <span className="w-24 text-sm font-medium">{DAYS_LABELS[day]}</span>
                      
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isOpenDay}
                          onCheckedChange={(checked) => onScheduleChange(day, 'is_open', checked)}
                        />
                        <span className="text-sm text-muted-foreground w-16">
                          {isOpenDay ? 'Abierto' : 'Cerrado'}
                        </span>
                      </div>

                      {isOpenDay && (
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="flex items-center gap-1.5 mr-2">
                            <Switch
                              checked={(schedule as any).is_default ?? false}
                              onCheckedChange={(checked) => onScheduleChange(day, 'is_default', checked)}
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Por defecto</span>
                          </div>
                          <Input
                            type="time"
                            value={schedule.start_time?.slice(0, 5) || '09:00'}
                            onChange={(e) => onScheduleChange(day, 'start_time', e.target.value)}
                            className="w-28"
                          />
                          <span className="text-muted-foreground">-</span>
                          <Input
                            type="time"
                            value={schedule.end_time?.slice(0, 5) || '21:00'}
                            onChange={(e) => onScheduleChange(day, 'end_time', e.target.value)}
                            className="w-28"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar ubicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{location.name}" y todos sus horarios asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface NewLocationFormProps {
  onSubmit: (data: LocationInsert) => void;
  onCancel: () => void;
  isLoading: boolean;
  onlineExists: boolean;
}

function NewLocationForm({ onSubmit, onCancel, isLoading, onlineExists }: NewLocationFormProps) {
  const [locationType, setLocationType] = useState<'in_person' | 'online'>('in_person');
  const [formData, setFormData] = useState<LocationInsert>({
    name: '',
    street: '',
    number_details: '',
    city: '',
    postal_code: '',
    country: 'España',
    is_public: true,
  });

  const isOnline = locationType === 'online';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('El nombre es obligatorio');
      return;
    }
    if (!isOnline && (!formData.street || !formData.city)) {
      toast.error('Completa la dirección para ubicaciones presenciales');
      return;
    }
    onSubmit({
      ...formData,
      location_type: locationType,
      // Clear address for online
      street: isOnline ? undefined : formData.street,
      city: isOnline ? undefined : formData.city,
      number_details: isOnline ? undefined : formData.number_details,
      postal_code: isOnline ? undefined : formData.postal_code,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva ubicación</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Location Type Selector */}
          <div className="space-y-3">
            <Label>Tipo de ubicación</Label>
            <RadioGroup 
              value={locationType} 
              onValueChange={(v) => setLocationType(v as 'in_person' | 'online')}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="in_person" id="type_in_person" />
                <Label htmlFor="type_in_person" className="flex items-center gap-1.5 cursor-pointer">
                  <MapPin className="h-4 w-4" />
                  Presencial
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem 
                  value="online" 
                  id="type_online" 
                  disabled={onlineExists}
                />
                <Label 
                  htmlFor="type_online" 
                  className={`flex items-center gap-1.5 cursor-pointer ${onlineExists ? 'text-muted-foreground' : ''}`}
                >
                  <Video className="h-4 w-4" />
                  Online
                  {onlineExists && (
                    <span className="text-xs text-amber-600">(Ya existe)</span>
                  )}
                </Label>
              </div>
            </RadioGroup>
            {isOnline && (
              <p className="text-xs text-muted-foreground">
                Las sesiones online se realizarán por videollamada
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={isOnline ? "Ej: Consulta Online" : "Ej: Consulta Principal"}
            />
          </div>

          {/* Address fields - only for in_person */}
          {!isOnline && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="street">Calle *</Label>
                  <Input
                    id="street"
                    value={formData.street || ''}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    placeholder="C/ Gran Vía"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="number_details">Número / Piso</Label>
                  <Input
                    id="number_details"
                    value={formData.number_details || ''}
                    onChange={(e) => setFormData({ ...formData, number_details: e.target.value })}
                    placeholder="15, 2º Izq"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">Ciudad *</Label>
                  <Input
                    id="city"
                    value={formData.city || ''}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="Madrid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Código Postal</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code || ''}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                    placeholder="28001"
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is_public" className="text-sm font-medium">Visible para pacientes</Label>
              <p className="text-xs text-muted-foreground">
                Los pacientes podrán {isOnline ? 'reservar citas online' : 'ver esta ubicación'} en el portal
              </p>
            </div>
            <Switch
              id="is_public"
              checked={formData.is_public ?? true}
              onCheckedChange={(checked) => setFormData({ ...formData, is_public: checked })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function LocationsSection() {
  const [showNewForm, setShowNewForm] = useState(false);
  const [updatingLocation, setUpdatingLocation] = useState<string | null>(null);
  
  const { data: locations, isLoading } = useLocations();
  const { data: onlineExists } = useOnlineLocationExists();
  const createLocation = useCreateLocation();
  const deleteLocation = useDeleteLocation();
  const updateLocation = useUpdateLocation();
  const upsertSchedule = useUpsertLocationSchedule();
  const initializeSchedules = useInitializeLocationSchedules();

  const locationIds = locations?.map(l => l.id) || [];
  const { data: allSchedules } = useAllLocationSchedules(locationIds);

  const getSchedulesForLocation = (locationId: string) => {
    return allSchedules?.filter(s => s.location_id === locationId) || [];
  };

  const handleCreateLocation = async (data: LocationInsert) => {
    try {
      const result = await createLocation.mutateAsync(data);
      // Initialize default schedules for the new location
      await initializeSchedules.mutateAsync(result.id);
      setShowNewForm(false);
      toast.success('Ubicación creada');
    } catch (error) {
      toast.error('Error al crear la ubicación');
    }
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await deleteLocation.mutateAsync(id);
      toast.success('Ubicación eliminada');
    } catch (error) {
      toast.error('Error al eliminar la ubicación');
    }
  };

  const handleScheduleChange = async (
    locationId: string,
    day: number,
    field: 'is_open' | 'start_time' | 'end_time' | 'is_default',
    value: boolean | string
  ) => {
    setUpdatingLocation(locationId);
    
    const currentSchedule = allSchedules?.find(
      s => s.location_id === locationId && s.day_of_week === day
    );

    try {
      // When marking a location as default, unmark others for the same day
      if (field === 'is_default' && value === true && allSchedules) {
        const otherDefaults = allSchedules.filter(
          s => s.day_of_week === day && s.location_id !== locationId && s.is_default === true
        );
        for (const other of otherDefaults) {
          await upsertSchedule.mutateAsync({
            id: other.id,
            location_id: other.location_id,
            day_of_week: day,
            start_time: other.start_time,
            end_time: other.end_time,
            is_open: other.is_open ?? true,
            is_default: false,
          });
        }
      }

      await upsertSchedule.mutateAsync({
        id: currentSchedule?.id,
        location_id: locationId,
        day_of_week: day,
        start_time: field === 'start_time' ? (value as string) : (currentSchedule?.start_time || '09:00'),
        end_time: field === 'end_time' ? (value as string) : (currentSchedule?.end_time || '21:00'),
        is_open: field === 'is_open' ? (value as boolean) : (currentSchedule?.is_open ?? true),
        is_default: field === 'is_default' ? (value as boolean) : (currentSchedule?.is_default ?? false),
      });
    } catch (error) {
      toast.error('Error al actualizar el horario');
    } finally {
      setUpdatingLocation(null);
    }
  };

  const handleVisibilityChange = async (locationId: string, isPublic: boolean) => {
    setUpdatingLocation(locationId);
    try {
      await updateLocation.mutateAsync({ id: locationId, is_public: isPublic });
      toast.success(isPublic ? 'Ubicación visible para pacientes' : 'Ubicación ahora es privada');
    } catch (error) {
      toast.error('Error al cambiar la visibilidad');
    } finally {
      setUpdatingLocation(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Ubicaciones del Centro
        </CardTitle>
        <CardDescription>
          Gestiona las direcciones y horarios de apertura de cada ubicación
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locations && locations.length > 0 ? (
          <div className="space-y-4">
            {locations.map((location) => (
              <LocationCard
                key={location.id}
                location={location}
                schedules={getSchedulesForLocation(location.id)}
                onDelete={() => handleDeleteLocation(location.id)}
                onScheduleChange={(day, field, value) => 
                  handleScheduleChange(location.id, day, field, value)
                }
                onVisibilityChange={(isPublic) => handleVisibilityChange(location.id, isPublic)}
                isUpdating={updatingLocation === location.id}
              />
            ))}
          </div>
        ) : !showNewForm ? (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="mx-auto h-12 w-12 opacity-50" />
            <p className="mt-2">No hay ubicaciones configuradas</p>
            <p className="text-sm">Añade tu primera ubicación para gestionar horarios</p>
          </div>
        ) : null}

        {showNewForm ? (
          <NewLocationForm
            onSubmit={handleCreateLocation}
            onCancel={() => setShowNewForm(false)}
            isLoading={createLocation.isPending || initializeSchedules.isPending}
            onlineExists={onlineExists ?? false}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowNewForm(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Añadir nueva ubicación
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
