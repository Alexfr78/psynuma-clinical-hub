import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Save, Loader2, Bell } from 'lucide-react';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';

interface AlertEvents {
  booking_created: boolean;
  booking_cancelled: boolean;
  booking_rescheduled: boolean;
  portal_created: boolean;
  portal_cancelled: boolean;
  payment_online: boolean;
  assessment_completed: boolean;
}

const defaultEvents: AlertEvents = {
  booking_created: true,
  booking_cancelled: true,
  booking_rescheduled: true,
  portal_created: true,
  portal_cancelled: true,
  payment_online: true,
  assessment_completed: true,
};

const eventLabels: Record<keyof AlertEvents, { label: string; description: string }> = {
  booking_created: {
    label: 'Nueva reserva pública',
    description: 'Cuando un cliente hace una reserva desde la web pública',
  },
  booking_cancelled: {
    label: 'Cancelación (reserva pública)',
    description: 'Cuando un cliente cancela su cita desde el enlace de gestión',
  },
  booking_rescheduled: {
    label: 'Reprogramación (reserva pública)',
    description: 'Cuando un cliente cambia la fecha/hora de su cita',
  },
  portal_created: {
    label: 'Nueva cita (portal contacto)',
    description: 'Cuando un contacto registrado solicita una cita desde su portal',
  },
  portal_cancelled: {
    label: 'Cancelación (portal contacto)',
    description: 'Cuando un contacto registrado cancela su cita desde el portal',
  },
  payment_online: {
    label: 'Pago online recibido',
    description: 'Cuando se completa un pago con tarjeta (Stripe)',
  },
  assessment_completed: {
    label: 'Evaluación completada',
    description: 'Cuando un contacto finaliza un cuestionario/test enviado',
  },
};

export function AdminAlertsSettingsSection() {
  const { center, updateCenter } = useCenter();
  const [isLoading, setIsLoading] = useState(false);
  
  const [enabled, setEnabled] = useState(true);
  const [emails, setEmails] = useState('');
  const [includeProfessional, setIncludeProfessional] = useState(true);
  const [events, setEvents] = useState<AlertEvents>(defaultEvents);

  // Load settings from center
  useEffect(() => {
    if (center) {
      setEnabled(center.admin_alerts_enabled ?? true);
      setEmails(center.admin_alerts_emails || '');
      setIncludeProfessional(center.admin_alerts_include_professional ?? true);
      
      if (center.admin_alerts_events) {
        const loadedEvents = center.admin_alerts_events as Partial<AlertEvents>;
        setEvents({
          ...defaultEvents,
          ...loadedEvents,
        });
      }
    }
  }, [center]);

  const handleEventChange = (eventKey: keyof AlertEvents, checked: boolean) => {
    setEvents(prev => ({
      ...prev,
      [eventKey]: checked,
    }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await updateCenter.mutateAsync({
        admin_alerts_enabled: enabled,
        admin_alerts_emails: emails.trim() || null,
        admin_alerts_include_professional: includeProfessional,
        admin_alerts_events: events,
      });
      toast.success('Configuración de alertas guardada');
    } catch (error) {
      console.error('Error saving alerts config:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <CardTitle>Alertas al Profesional</CardTitle>
        </div>
        <CardDescription>
          Recibe notificaciones por email cuando ocurran eventos importantes en tu centro
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main switch */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="alerts-enabled" className="text-base font-medium">
              Alertas activadas
            </Label>
            <p className="text-sm text-muted-foreground">
              Activa o desactiva todas las alertas por email
            </p>
          </div>
          <Switch
            id="alerts-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            <Separator />

            {/* Email addresses */}
            <div className="space-y-2">
              <Label htmlFor="admin-emails">Emails de notificación</Label>
              <Input
                id="admin-emails"
                type="text"
                value={emails}
                onChange={(e) => setEmails(e.target.value)}
                placeholder="admin@clinica.com, recepcion@clinica.com"
              />
              <p className="text-xs text-muted-foreground">
                Puedes añadir varios emails separados por comas
              </p>
            </div>

            {/* Include professional switch */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="include-professional" className="text-base font-medium">
                  Incluir al profesional asignado
                </Label>
                <p className="text-sm text-muted-foreground">
                  Además de los emails anteriores, notificar también al profesional de la cita
                </p>
              </div>
              <Switch
                id="include-professional"
                checked={includeProfessional}
                onCheckedChange={setIncludeProfessional}
              />
            </div>

            <Separator />

            {/* Events checkboxes */}
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Eventos que generan alerta</h4>
                <p className="text-sm text-muted-foreground">
                  Selecciona qué eventos quieres recibir por email
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {(Object.keys(eventLabels) as (keyof AlertEvents)[]).map((eventKey) => {
                  const { label, description } = eventLabels[eventKey];
                  return (
                    <div
                      key={eventKey}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <Checkbox
                        id={eventKey}
                        checked={events[eventKey]}
                        onCheckedChange={(checked) =>
                          handleEventChange(eventKey, checked === true)
                        }
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor={eventKey}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {label}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end pt-4">
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar Cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
