import { useState } from 'react';
import { MapPin, Plus, Trash2, Clock, ChevronDown, ChevronUp, Loader2, Globe, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useLocations, useCreateLocation, useDeleteLocation, useUpdateLocation, type LocationInsert, type CenterLocation } from '@/hooks/useLocations';
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
  onScheduleChange: (day: number, field: 'is_open' | 'start_time' | 'end_time', value: boolean | string) => void;
  onVisibilityChange: (isPublic: boolean) => void;
  isUpdating: boolean;
}

function LocationCard({ location, schedules, onDelete, onScheduleChange, onVisibilityChange, isUpdating }: LocationCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const isPublic = location.is_public ?? true;

  const getScheduleForDay = (day: number) => {
    return schedules.find(s => s.day_of_week === day) || {
      day_of_week: day,
      start_time: '09:00',
      end_time: '21:00',
      is_open: day >= 1 && day <= 5,
    };
  };

  const formatAddress = () => {
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
              <div className="mt-1 rounded-lg bg-primary/10 p-2">
                <MapPin className="h-4 w-4 text-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-medium">{location.name}</h4>
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
}

function NewLocationForm({ onSubmit, onCancel, isLoading }: NewLocationFormProps) {
  const [formData, setFormData] = useState<LocationInsert>({
    name: '',
    street: '',
    number_details: '',
    city: '',
    postal_code: '',
    country: 'España',
    is_public: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.street || !formData.city) {
      toast.error('Completa los campos obligatorios');
      return;
    }
    onSubmit(formData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nueva ubicación</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ej: Consulta Principal"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="street">Calle *</Label>
              <Input
                id="street"
                value={formData.street}
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
                value={formData.city}
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

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="is_public" className="text-sm font-medium">Visible para pacientes</Label>
              <p className="text-xs text-muted-foreground">
                Los pacientes podrán ver esta ubicación en el portal de reservas
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
    field: 'is_open' | 'start_time' | 'end_time',
    value: boolean | string
  ) => {
    setUpdatingLocation(locationId);
    
    const currentSchedule = allSchedules?.find(
      s => s.location_id === locationId && s.day_of_week === day
    );

    try {
      await upsertSchedule.mutateAsync({
        location_id: locationId,
        day_of_week: day,
        start_time: field === 'start_time' ? (value as string) : (currentSchedule?.start_time || '09:00'),
        end_time: field === 'end_time' ? (value as string) : (currentSchedule?.end_time || '21:00'),
        is_open: field === 'is_open' ? (value as boolean) : (currentSchedule?.is_open ?? true),
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
