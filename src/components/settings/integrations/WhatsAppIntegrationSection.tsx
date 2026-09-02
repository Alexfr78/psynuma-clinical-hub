import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useCenter } from "@/hooks/useCenter";
import { useWasender } from "@/hooks/useWasender";

import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Icon } from '@/components/ui/icon';

type WhatsAppSendMethod = 'web' | 'wasender' | 'api';

export function WhatsAppIntegrationSection() {
  const { integrations, isLoading: integrationsLoading, updateIntegrations } = useProfessionalIntegrations();
  const { center, updateCenter, isLoading: centerLoading } = useCenter();
  const { 
    session, 
    isLoading: wasenderLoading, 
    isConnected, 
    qrCode, 
    connectWhatsApp,
    disconnectWhatsApp,
    sendMessage,
    refetchSession,
    stats 
  } = useWasender();
  
  const [enabled, setEnabled] = useState(false);
  const [sendMethod, setSendMethod] = useState<WhatsAppSendMethod>('web');
  
  // Meta API fields
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [showToken, setShowToken] = useState(false);
  
  // WasenderAPI fields
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder2h, setReminder2h] = useState(true);
  const [confirmBooking, setConfirmBooking] = useState(true);
  const [notifyCancellation, setNotifyCancellation] = useState(true);
  const [notifyReschedule, setNotifyReschedule] = useState(true);
  const [confirmationReply, setConfirmationReply] = useState(true);
  const [emergencyStop, setEmergencyStop] = useState(false);
  
  // Test message
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (integrations) {
      setEnabled(integrations.whatsapp_enabled);
      // Determine send method from integrations and center
      if (center?.wasender_enabled) {
        setSendMethod('wasender');
      } else if (integrations.whatsapp_send_method === 'api') {
        setSendMethod('api');
      } else {
        setSendMethod('web');
      }
      setPhoneNumberId(integrations.whatsapp_phone_number_id || '');
      setBusinessAccountId(integrations.whatsapp_business_account_id || '');
    }
    
    if (center) {
      setReminder24h(center.wasender_reminder_24h ?? true);
      setReminder2h(center.wasender_reminder_2h ?? true);
      setConfirmBooking(center.wasender_confirm_booking ?? true);
      setNotifyCancellation(center.wasender_notify_cancellation ?? true);
      setNotifyReschedule(center.wasender_notify_reschedule ?? true);
      setConfirmationReply(center.wasender_confirmation_reply ?? true);
      setEmergencyStop(center.wasender_emergency_stop ?? false);
    }
  }, [integrations, center]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update integrations for Meta API settings
      await updateIntegrations.mutateAsync({
        whatsapp_enabled: enabled,
        whatsapp_send_method: sendMethod === 'api' ? 'api' : 'web',
        whatsapp_phone_number_id: sendMethod === 'api' ? phoneNumberId : null,
        whatsapp_business_account_id: sendMethod === 'api' ? businessAccountId : null,
      });

      // Update center for WasenderAPI settings
      await updateCenter.mutateAsync({
        wasender_enabled: sendMethod === 'wasender',
        wasender_reminder_24h: reminder24h,
        wasender_reminder_2h: reminder2h,
        wasender_confirm_booking: confirmBooking,
        wasender_notify_cancellation: notifyCancellation,
        wasender_notify_reschedule: notifyReschedule,
        wasender_confirmation_reply: confirmationReply,
      });

      // If API mode and access token is provided, save it encrypted
      if (sendMethod === 'api' && accessToken) {
        const { error } = await supabase.functions.invoke('save-oauth-credentials', {
          body: {
            provider: 'whatsapp',
            credentials: {
              accessToken,
              phoneNumberId,
              businessAccountId,
              sendMethod,
            },
          },
        });
        
        if (error) {
          console.error('Error saving WhatsApp credentials:', error);
          toast.error('Error al guardar las credenciales de WhatsApp');
          return;
        }
        
        setAccessToken('');
        toast.success('Credenciales de WhatsApp guardadas de forma segura');
      } else {
        toast.success('Configuración guardada');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = async () => {
    await connectWhatsApp.mutateAsync();
  };

  const handleSendTest = async () => {
    if (!testPhone || !testMessage) {
      toast.error('Introduce un teléfono y mensaje');
      return;
    }

    setIsSendingTest(true);
    try {
      await sendMessage.mutateAsync({
        phone: testPhone,
        message: testMessage,
        message_type: 'test',
      });
      setTestMessage('');
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleEmergencyStop = async () => {
    const newValue = !emergencyStop;
    setEmergencyStop(newValue);
    await updateCenter.mutateAsync({
      wasender_emergency_stop: newValue,
    });
    
    if (newValue) {
      toast.warning('Parada de emergencia activada. No se enviarán más mensajes.');
    } else {
      toast.success('Parada de emergencia desactivada. Los mensajes se reanudarán.');
    }
  };

  if (integrationsLoading || centerLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    if (!enabled) return null;
    
    if (sendMethod === 'wasender') {
      if (emergencyStop) {
        return (
          <Badge variant="destructive" className="gap-1">
            <Icon name="warning" className="h-3 w-3" />
            Pausado
          </Badge>
        );
      }
      if (isConnected) {
        return (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
            <Icon name="check_circle" className="h-3 w-3" />
            Conectado (Automático)
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-200 bg-yellow-50">
          <Icon name="qr_code" className="h-3 w-3" />
          Pendiente de conexión
        </Badge>
      );
    }
    
    if (sendMethod === 'api') {
      if (accessToken || center?.whatsapp_access_token) {
        return (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
            <Icon name="check_circle" className="h-3 w-3" />
            Meta API (Automático)
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-200 bg-yellow-50">
          <Icon name="warning" className="h-3 w-3" />
          Credenciales pendientes
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="gap-1">
        <Icon name="forum" className="h-3 w-3" />
        Manual (Web)
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <Icon name="forum" className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp</CardTitle>
              <CardDescription>
                Envío de notificaciones y recordatorios por WhatsApp
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </CardHeader>
      
      {enabled && (
        <CardContent className="space-y-6">
          {/* Send Method Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Método de envío</Label>
              {getStatusBadge()}
            </div>
            <RadioGroup value={sendMethod} onValueChange={(v) => setSendMethod(v as WhatsAppSendMethod)}>
              <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="web" id="whatsapp-web" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="whatsapp-web" className="cursor-pointer font-medium">
                    WhatsApp Web (Manual)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Abre enlaces para enviar manualmente desde tu navegador
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="wasender" id="whatsapp-wasender" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="whatsapp-wasender" className="cursor-pointer font-medium">
                    WasenderAPI (Automático con tu número)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Envía automáticamente desde tu número personal de WhatsApp
                  </p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="api" id="whatsapp-api" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="whatsapp-api" className="cursor-pointer font-medium">
                    Meta API (Automático empresarial)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Usa la API oficial de WhatsApp Business con número verificado
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* WasenderAPI Configuration */}
          {sendMethod === 'wasender' && (
            <>
              <Separator />
              <div className="space-y-4">
                {/* Connection Status */}
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Estado de conexión</Label>
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                        <Icon name="check_circle" className="h-3 w-3" />
                        Conectado
                      </Badge>
                    ) : session?.status === 'need_scan' ? (
                      <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-200 bg-yellow-50">
                        <Icon name="qr_code" className="h-3 w-3" />
                        Esperando escaneo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
                        <Icon name="cancel" className="h-3 w-3" />
                        Desconectado
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => refetchSession()}
                    >
                      <Icon name="refresh" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* QR Code Display */}
                {!isConnected && (
                  <div className="p-4 border rounded-lg bg-muted/30">
                    {qrCode ? (
                      <div className="flex flex-col items-center gap-4">
                        <div className="p-4 bg-white rounded-lg">
                          <QRCodeSVG 
                            value={qrCode}
                            size={192}
                            level="M"
                          />
                        </div>
                        <p className="text-sm text-muted-foreground text-center">
                          Abre WhatsApp en tu teléfono → Menú → Dispositivos vinculados → Vincular dispositivo
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4">
                        <div className="p-6 bg-muted rounded-lg">
                          <Icon name="qr_code" className="h-16 w-16 text-muted-foreground" />
                        </div>
                        <Button 
                          onClick={handleConnect}
                          disabled={connectWhatsApp.isPending}
                        >
                          {connectWhatsApp.isPending ? (
                            <>
                              <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                              Conectando...
                            </>
                          ) : (
                            <>
                              <Icon name="call" className="h-4 w-4 mr-2" />
                              Conectar WhatsApp
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected Phone Info + Disconnect */}
                {isConnected && (
                  <div className="p-3 border rounded-lg bg-green-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon name="call" className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Conectado{session?.phone_number ? `: ${session.phone_number}` : ''}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => disconnectWhatsApp.mutateAsync()}
                      disabled={disconnectWhatsApp.isPending}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      {disconnectWhatsApp.isPending ? (
                        <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Icon name="cancel" className="h-4 w-4 mr-1" />
                          Desconectar
                        </>
                      )}
                    </Button>
                  </div>
                )}

                <Separator />

                {/* Automation Settings */}
                <div className="space-y-4">
                  <Label className="text-base font-medium">Automatizaciones</Label>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="schedule" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Recordatorio 24h antes</p>
                          <p className="text-xs text-muted-foreground">Enviar recordatorio un día antes de la cita</p>
                        </div>
                      </div>
                      <Switch
                        checked={reminder24h}
                        onCheckedChange={setReminder24h}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="schedule" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Recordatorio 2h antes</p>
                          <p className="text-xs text-muted-foreground">Enviar recordatorio 2 horas antes de la cita</p>
                        </div>
                      </div>
                      <Switch
                        checked={reminder2h}
                        onCheckedChange={setReminder2h}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="check_circle" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Confirmación de reserva</p>
                          <p className="text-xs text-muted-foreground">Enviar confirmación al crear una cita</p>
                        </div>
                      </div>
                      <Switch
                        checked={confirmBooking}
                        onCheckedChange={setConfirmBooking}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="refresh" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Notificar cambio de cita</p>
                          <p className="text-xs text-muted-foreground">Enviar mensaje cuando el paciente reprograme su cita</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifyReschedule}
                        onCheckedChange={setNotifyReschedule}
                      />
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="cancel" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Aviso de cancelación</p>
                          <p className="text-xs text-muted-foreground">Notificar cuando se cancela una cita</p>
                        </div>
                      </div>
                      <Switch
                        checked={notifyCancellation}
                        onCheckedChange={setNotifyCancellation}
                      />
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon name="check_circle" className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Confirmación de asistencia por respuesta</p>
                          <p className="text-xs text-muted-foreground">El recordatorio incluye "Responde SÍ para confirmar". La cita se marca automáticamente como confirmada.</p>
                        </div>
                      </div>
                      <Switch
                        checked={confirmationReply}
                        onCheckedChange={setConfirmationReply}
                      />
                    </div>
                    </div>
                  </div>
                </div>

                {/* Test Message */}
                {isConnected && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      <Label className="text-base font-medium">Enviar mensaje de prueba</Label>
                      
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="test-phone">Teléfono (con código de país)</Label>
                          <Input
                            id="test-phone"
                            placeholder="34612345678"
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value)}
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="test-message">Mensaje</Label>
                          <Input
                            id="test-message"
                            placeholder="Mensaje de prueba..."
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                          />
                        </div>

                        <Button 
                          onClick={handleSendTest}
                          disabled={isSendingTest || !testPhone || !testMessage}
                          variant="outline"
                        >
                          {isSendingTest ? (
                            <>
                              <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Icon name="send" className="h-4 w-4 mr-2" />
                              Enviar prueba
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* Statistics */}
                <Separator />
                <div className="space-y-4">
                  <Label className="text-base font-medium">Estadísticas</Label>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 border rounded-lg text-center">
                      <p className="text-2xl font-bold">{stats.total}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div className="p-3 border rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
                      <p className="text-xs text-muted-foreground">Enviados</p>
                    </div>
                    <div className="p-3 border rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-600">{stats.queued}</p>
                      <p className="text-xs text-muted-foreground">En cola</p>
                    </div>
                    <div className="p-3 border rounded-lg text-center">
                      <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                      <p className="text-xs text-muted-foreground">Fallidos</p>
                    </div>
                  </div>
                </div>

                {/* Emergency Stop */}
                <Separator />
                <Alert variant={emergencyStop ? "destructive" : "default"} className="border-2">
                  <Icon name="shield" className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Parada de emergencia</p>
                      <p className="text-sm">Detiene inmediatamente todos los envíos automáticos</p>
                    </div>
                    <Button 
                      variant={emergencyStop ? "destructive" : "outline"}
                      onClick={handleEmergencyStop}
                    >
                      {emergencyStop ? (
                        <>
                          <Icon name="warning" className="h-4 w-4 mr-2" />
                          ACTIVADA
                        </>
                      ) : (
                        'Activar parada'
                      )}
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            </>
          )}

          {/* Meta API Configuration */}
          {sendMethod === 'api' && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Credenciales de Meta API</Label>
                <a 
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Icon name="open_in_new" className="h-3 w-3" />
                  Documentación
                </a>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="access-token">Access Token</Label>
                <p className="text-xs text-muted-foreground">
                  El token se almacena de forma segura y encriptada. Introduce un nuevo token para actualizarlo.
                </p>
                <div className="relative">
                  <Input
                    id="access-token"
                    type={showToken ? "text" : "password"}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder={center?.whatsapp_access_token ? "••••••••• (token guardado)" : "EAAxxxxxxx..."}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <Icon name="visibility_off" className="h-4 w-4" /> : <Icon name="visibility" className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-number-id">Phone Number ID</Label>
                <Input
                  id="phone-number-id"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-account-id">Business Account ID</Label>
                <Input
                  id="business-account-id"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="123456789012345"
                />
              </div>
            </div>
          )}

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
