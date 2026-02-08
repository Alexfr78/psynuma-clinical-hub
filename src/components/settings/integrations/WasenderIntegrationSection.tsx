import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  MessageSquare, 
  QrCode, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Send,
  AlertTriangle,
  Clock,
  Phone,
  Loader2,
  Shield
} from 'lucide-react';
import { useWasender } from '@/hooks/useWasender';
import { useCenter } from '@/hooks/useCenter';
import { toast } from 'sonner';

export function WasenderIntegrationSection() {
  const { center, updateCenter, isLoading: isLoadingCenter } = useCenter();
  const { 
    session, 
    isLoading, 
    isConnected, 
    qrCode, 
    connectWhatsApp, 
    sendMessage,
    refetchSession,
    stats 
  } = useWasender();

  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Local state for toggles
  const [enabled, setEnabled] = useState(false);
  const [reminder24h, setReminder24h] = useState(true);
  const [reminder2h, setReminder2h] = useState(true);
  const [confirmBooking, setConfirmBooking] = useState(true);
  const [notifyCancellation, setNotifyCancellation] = useState(true);
  const [emergencyStop, setEmergencyStop] = useState(false);

  useEffect(() => {
    if (center) {
      setEnabled(center.wasender_enabled ?? false);
      setReminder24h(center.wasender_reminder_24h ?? true);
      setReminder2h(center.wasender_reminder_2h ?? true);
      setConfirmBooking(center.wasender_confirm_booking ?? true);
      setNotifyCancellation(center.wasender_notify_cancellation ?? true);
      setEmergencyStop(center.wasender_emergency_stop ?? false);
    }
  }, [center]);

  const handleSaveSettings = async () => {
    await updateCenter.mutateAsync({
      wasender_enabled: enabled,
      wasender_reminder_24h: reminder24h,
      wasender_reminder_2h: reminder2h,
      wasender_confirm_booking: confirmBooking,
      wasender_notify_cancellation: notifyCancellation,
      wasender_emergency_stop: emergencyStop,
    });
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

  if (isLoading || isLoadingCenter) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageSquare className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">WasenderAPI (WhatsApp)</CardTitle>
              <CardDescription>
                Automatiza mensajes usando tu número de WhatsApp
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(val) => {
              setEnabled(val);
              updateCenter.mutate({ wasender_enabled: val });
            }}
          />
        </div>
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-6">
          {/* Connection Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">Estado de conexión</Label>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                    <CheckCircle2 className="h-3 w-3" />
                    Conectado
                  </Badge>
                ) : session?.status === 'need_scan' ? (
                  <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-200 bg-yellow-50">
                    <QrCode className="h-3 w-3" />
                    Esperando escaneo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-red-600 border-red-200 bg-red-50">
                    <XCircle className="h-3 w-3" />
                    Desconectado
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => refetchSession()}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* QR Code Display */}
            {!isConnected && (
              <div className="p-4 border rounded-lg bg-muted/30">
                {qrCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white rounded-lg">
                      <img 
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="WhatsApp QR Code"
                        className="w-48 h-48"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      Abre WhatsApp en tu teléfono → Menú → Dispositivos vinculados → Vincular dispositivo
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-6 bg-muted rounded-lg">
                      <QrCode className="h-16 w-16 text-muted-foreground" />
                    </div>
                    <Button 
                      onClick={handleConnect}
                      disabled={connectWhatsApp.isPending}
                    >
                      {connectWhatsApp.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Conectando...
                        </>
                      ) : (
                        <>
                          <Phone className="h-4 w-4 mr-2" />
                          Conectar WhatsApp
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Connected Phone Info */}
            {isConnected && session?.phone_number && (
              <div className="p-3 border rounded-lg bg-green-50/50 flex items-center gap-3">
                <Phone className="h-4 w-4 text-green-600" />
                <span className="text-sm">Conectado: {session.phone_number}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Automation Settings */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Automatizaciones</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
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
                  <Clock className="h-4 w-4 text-muted-foreground" />
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
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
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
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Aviso de cancelación</p>
                    <p className="text-xs text-muted-foreground">Notificar cuando se cancela una cita</p>
                  </div>
                </div>
                <Switch
                  checked={notifyCancellation}
                  onCheckedChange={setNotifyCancellation}
                />
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={updateCenter.isPending}>
              {updateCenter.isPending ? 'Guardando...' : 'Guardar configuración'}
            </Button>
          </div>

          <Separator />

          {/* Test Message */}
          {isConnected && (
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
                >
                  {isSendingTest ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar prueba
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Statistics */}
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

          <Separator />

          {/* Emergency Stop */}
          <div className="space-y-4">
            <Alert variant={emergencyStop ? "destructive" : "default"} className="border-2">
              <Shield className="h-4 w-4" />
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
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      ACTIVADA
                    </>
                  ) : (
                    'Activar parada'
                  )}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
