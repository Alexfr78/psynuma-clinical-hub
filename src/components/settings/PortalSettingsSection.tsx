import { useState, useEffect } from 'react';
import { Save, Loader2, Settings2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function PortalSettingsSection() {
  const { center, updateCenter } = useCenter();
  const { isAdmin } = useAuth();
  
  const [maxDays, setMaxDays] = useState<number>(30);
  const [slotDuration, setSlotDuration] = useState<string>('30');
  const [requireConfirmation, setRequireConfirmation] = useState<boolean>(false);

  useEffect(() => {
    if (center) {
      setMaxDays(center.reschedule_max_days ?? 30);
      setSlotDuration(String(center.reschedule_slot_duration ?? 30));
      setRequireConfirmation(center.reschedule_require_confirmation ?? false);
    }
  }, [center]);

  const handleSave = () => {
    if (maxDays < 1 || maxDays > 90) {
      toast.error('Los días máximos deben estar entre 1 y 90');
      return;
    }

    updateCenter.mutate({
      reschedule_max_days: maxDays,
      reschedule_slot_duration: parseInt(slotDuration),
      reschedule_require_confirmation: requireConfirmation,
    }, {
      onSuccess: () => {
        toast.success('Configuración guardada correctamente');
      },
      onError: () => {
        toast.error('Error al guardar la configuración');
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Ajustes del Portal de Pacientes
        </CardTitle>
        <CardDescription>
          Configura las opciones del portal público de gestión de citas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Reschedule Settings Section */}
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium">Reprogramación de Citas</h3>
            <p className="text-sm text-muted-foreground">
              Configura cómo los pacientes pueden reprogramar sus citas desde el portal
            </p>
          </div>

          {/* Max Days */}
          <div className="space-y-2">
            <Label htmlFor="maxDays">Días máximos para reprogramar</Label>
            <div className="flex items-center gap-2">
              <Input
                id="maxDays"
                type="number"
                min={1}
                max={90}
                value={maxDays}
                onChange={(e) => setMaxDays(parseInt(e.target.value) || 1)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">días</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Límite de días en el futuro que el paciente puede seleccionar para reprogramar su cita (1-90 días)
            </p>
          </div>

          {/* Slot Duration */}
          <div className="space-y-2">
            <Label htmlFor="slotDuration">Duración de los slots de tiempo</Label>
            <Select value={slotDuration} onValueChange={setSlotDuration}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Selecciona duración" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="45">45 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Intervalos de tiempo mostrados en el calendario de reprogramación
            </p>
          </div>

          {/* Double Confirmation */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="requireConfirmation" className="text-base">
                Requerir doble confirmación
              </Label>
              <p className="text-sm text-muted-foreground">
                El paciente deberá confirmar su selección antes de que se aplique el cambio de fecha
              </p>
            </div>
            <Switch
              id="requireConfirmation"
              checked={requireConfirmation}
              onCheckedChange={setRequireConfirmation}
            />
          </div>
        </div>

        {/* Save Button */}
        {isAdmin && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={updateCenter.isPending}>
              {updateCenter.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Cambios
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
