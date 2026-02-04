import { useState, useEffect } from 'react';
import { useCenter } from '@/hooks/useCenter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, Save, Loader2, Mail, MessageCircle, Smartphone } from 'lucide-react';

interface ReminderChannels {
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
}

export function SessionReminderSettingsSection() {
  const { center, isLoading, updateCenter } = useCenter();
  const [enabled, setEnabled] = useState(true);
  const [timing, setTiming] = useState('24_hours');
  const [customHours, setCustomHours] = useState(24);
  const [channels, setChannels] = useState<ReminderChannels>({ email: true, whatsapp: true, sms: false });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (center) {
      setEnabled(center.session_reminder_enabled ?? true);
      setTiming(center.session_reminder_timing ?? '24_hours');
      setCustomHours(center.session_reminder_hours_before ?? 24);
      const savedChannels = center.session_reminder_channels as ReminderChannels | null;
      setChannels(savedChannels ?? { email: true, whatsapp: true, sms: false });
    }
  }, [center]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const hoursMap: Record<string, number> = {
        'day_before_10am': 24,
        '12_hours': 12,
        '24_hours': 24,
        '48_hours': 48,
        'custom_hours': customHours
      };
      
      await updateCenter.mutateAsync({
        session_reminder_enabled: enabled,
        session_reminder_timing: timing,
        session_reminder_hours_before: timing === 'custom_hours' ? customHours : hoursMap[timing],
        session_reminder_channels: channels,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChannelChange = (channel: keyof ReminderChannels, checked: boolean) => {
    setChannels(prev => ({ ...prev, [channel]: checked }));
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Recordatorios de Cita
        </CardTitle>
        <CardDescription>
          Configura cuándo y cómo enviar recordatorios automáticos a los contactos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="reminder-enabled" className="text-base">
              Habilitar recordatorios automáticos
            </Label>
            <p className="text-sm text-muted-foreground">
              Envía recordatorios automáticamente antes de cada cita
            </p>
          </div>
          <Switch
            id="reminder-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {enabled && (
          <>
            {/* Timing Options */}
            <div className="space-y-4">
              <Label className="text-base">¿Cuándo enviar el recordatorio?</Label>
              <RadioGroup value={timing} onValueChange={setTiming} className="space-y-3">
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="day_before_10am" id="day_before_10am" />
                  <Label htmlFor="day_before_10am" className="font-normal cursor-pointer">
                    El día anterior a las 10:00
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="12_hours" id="12_hours" />
                  <Label htmlFor="12_hours" className="font-normal cursor-pointer">
                    12 horas antes de la cita
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="24_hours" id="24_hours" />
                  <Label htmlFor="24_hours" className="font-normal cursor-pointer">
                    24 horas antes de la cita
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="48_hours" id="48_hours" />
                  <Label htmlFor="48_hours" className="font-normal cursor-pointer">
                    48 horas antes de la cita
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="custom_hours" id="custom_hours" />
                  <Label htmlFor="custom_hours" className="font-normal cursor-pointer">
                    Personalizado:
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={168}
                      value={customHours}
                      onChange={(e) => setCustomHours(parseInt(e.target.value) || 24)}
                      className="w-20"
                      disabled={timing !== 'custom_hours'}
                    />
                    <span className="text-sm text-muted-foreground">horas antes</span>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Channels */}
            <div className="space-y-4">
              <Label className="text-base">Canales de envío</Label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="channel-email"
                    checked={channels.email}
                    onCheckedChange={(checked) => handleChannelChange('email', checked as boolean)}
                  />
                  <Label htmlFor="channel-email" className="font-normal cursor-pointer flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    Email
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="channel-whatsapp"
                    checked={channels.whatsapp}
                    onCheckedChange={(checked) => handleChannelChange('whatsapp', checked as boolean)}
                  />
                  <Label htmlFor="channel-whatsapp" className="font-normal cursor-pointer flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    WhatsApp
                    {channels.whatsapp && center?.whatsapp_send_method !== 'api' && (
                      <span className="text-xs text-amber-600">(solo modo API)</span>
                    )}
                  </Label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="channel-sms"
                    checked={channels.sms}
                    onCheckedChange={(checked) => handleChannelChange('sms', checked as boolean)}
                    disabled
                  />
                  <Label htmlFor="channel-sms" className="font-normal cursor-pointer flex items-center gap-2 text-muted-foreground">
                    <Smartphone className="h-4 w-4" />
                    SMS
                    <span className="text-xs">(próximamente)</span>
                  </Label>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Los recordatorios se enviarán automáticamente a través de los canales seleccionados. 
                WhatsApp automático requiere configuración de Meta API en Integraciones.
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4">
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
  );
}
