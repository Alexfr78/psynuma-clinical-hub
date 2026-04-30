import { useState, useEffect } from 'react';
import { Save, Loader2, CreditCard, Bell, Clock, Globe, Landmark } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useCenter } from '@/hooks/useCenter';
import { useToast } from '@/hooks/use-toast';

const PAYMENT_MODES = [
  { 
    value: 'required_now', 
    label: 'Pago obligatorio', 
    description: 'El paciente debe pagar antes de confirmar la cita' 
  },
  { 
    value: 'in_session', 
    label: 'Pago en sesión', 
    description: 'El paciente paga al llegar a consulta' 
  },
  { 
    value: 'post_session', 
    label: 'Pago post-sesión', 
    description: 'El paciente paga después de la cita' 
  },
  { 
    value: 'scheduled_before', 
    label: 'Pago programado', 
    description: 'Se envía enlace de pago X horas antes de la sesión' 
  },
];

export function PaymentSettingsSection() {
  const { center, updateCenter } = useCenter();
  const { toast } = useToast();
  
  const [paymentMode, setPaymentMode] = useState('in_session');
  const [scheduledHoursBefore, setScheduledHoursBefore] = useState(24);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderHoursAfter, setReminderHoursAfter] = useState(24);
  const [reminderMaxCount, setReminderMaxCount] = useState(3);
  const [reminderIntervalHours, setReminderIntervalHours] = useState(48);
  const [publicDomain, setPublicDomain] = useState('');
  const [bizumPhone, setBizumPhone] = useState('');
  const [bankTransferInfo, setBankTransferInfo] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (center) {
      setPaymentMode(center.default_payment_mode || 'in_session');
      setScheduledHoursBefore(center.default_scheduled_hours_before || 24);
      setReminderEnabled(center.payment_reminder_enabled ?? true);
      setReminderHoursAfter(center.payment_reminder_hours_after || 24);
      setReminderMaxCount(center.payment_reminder_max_count || 3);
      setReminderIntervalHours(center.payment_reminder_interval_hours || 48);
      setPublicDomain(center.public_domain || '');
      setBizumPhone(center.bizum_phone || '');
      setBankTransferInfo((center as any).bank_transfer_info || '');
    }
  }, [center]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateCenter.mutateAsync({
        default_payment_mode: paymentMode,
        default_scheduled_hours_before: scheduledHoursBefore,
        payment_reminder_enabled: reminderEnabled,
        payment_reminder_hours_after: reminderHoursAfter,
        payment_reminder_max_count: reminderMaxCount,
        payment_reminder_interval_hours: reminderIntervalHours,
        public_domain: publicDomain || null,
        bizum_phone: bizumPhone || null,
        bank_transfer_info: bankTransferInfo || null,
      } as any);
      toast({
        title: 'Configuración guardada',
        description: 'Los ajustes de pago se han actualizado correctamente.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-6">
      {/* Public Domain Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Dominio Público
          </CardTitle>
          <CardDescription>
            Configura el dominio que se usará en los enlaces de pago enviados a pacientes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="public-domain">Dominio para enlaces de pago</Label>
            <Input
              id="public-domain"
              type="text"
              value={publicDomain}
              onChange={(e) => setPublicDomain(e.target.value)}
              placeholder="psycma.psicologosexual.com"
            />
            <p className="text-sm text-muted-foreground">
              Este dominio se usará en los enlaces de WhatsApp, Email y SMS para pago.
              Debe coincidir con el dominio donde está publicada la aplicación.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Modo de Pago Predeterminado
          </CardTitle>
          <CardDescription>
            Define cómo se gestiona el pago por defecto en las nuevas sesiones
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup value={paymentMode} onValueChange={setPaymentMode} className="space-y-3">
            {PAYMENT_MODES.map((mode) => (
              <div
                key={mode.value}
                className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setPaymentMode(mode.value)}
              >
                <RadioGroupItem value={mode.value} id={mode.value} className="mt-1" />
                <div className="space-y-1">
                  <Label htmlFor={mode.value} className="font-medium cursor-pointer">
                    {mode.label}
                  </Label>
                  <p className="text-sm text-muted-foreground">{mode.description}</p>
                </div>
              </div>
            ))}
          </RadioGroup>

          {paymentMode === 'scheduled_before' && (
            <div className="ml-8 space-y-2 p-4 bg-muted/50 rounded-lg">
              <Label htmlFor="scheduled-hours" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Horas antes de la sesión para enviar enlace de pago
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="scheduled-hours"
                  type="number"
                  min={1}
                  max={168}
                  value={scheduledHoursBefore}
                  onChange={(e) => setScheduledHoursBefore(parseInt(e.target.value) || 24)}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recordatorios de Pago Pendiente
          </CardTitle>
          <CardDescription>
            Configura los recordatorios automáticos para sesiones no abonadas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Habilitar recordatorios automáticos</Label>
              <p className="text-sm text-muted-foreground">
                Enviar recordatorios por email/WhatsApp cuando una sesión no ha sido abonada
              </p>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>

          {reminderEnabled && (
            <>
              <Separator />
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder-hours">Primer recordatorio después de la sesión</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reminder-hours"
                      type="number"
                      min={1}
                      max={168}
                      value={reminderHoursAfter}
                      onChange={(e) => setReminderHoursAfter(parseInt(e.target.value) || 24)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El primer recordatorio se enviará X horas después de completar la sesión
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reminder-max">Número máximo de recordatorios</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reminder-max"
                      type="number"
                      min={1}
                      max={10}
                      value={reminderMaxCount}
                      onChange={(e) => setReminderMaxCount(parseInt(e.target.value) || 3)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">recordatorios</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reminder-interval">Intervalo entre recordatorios</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="reminder-interval"
                      type="number"
                      min={12}
                      max={168}
                      value={reminderIntervalHours}
                      onChange={(e) => setReminderIntervalHours(parseInt(e.target.value) || 48)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tiempo mínimo entre cada recordatorio sucesivo
                  </p>
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar Configuración
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
