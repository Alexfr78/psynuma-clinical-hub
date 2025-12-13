import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { CreditCard, ExternalLink, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export function StripeIntegrationSection() {
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  
  const [enabled, setEnabled] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'required_now' | 'post_pay' | 'scheduled_before'>('post_pay');
  const [scheduledHours, setScheduledHours] = useState(24);
  const [isSaving, setIsSaving] = useState(false);

  const isConnected = isProviderConnected('stripe');
  const connection = getOAuthConnection('stripe');
  const accountStatus = connection?.stripe_account_status;

  useEffect(() => {
    if (integrations) {
      setEnabled(integrations.stripe_enabled);
      setPaymentMode(integrations.stripe_payment_mode);
      setScheduledHours(integrations.stripe_scheduled_hours_before);
    }
  }, [integrations]);

  const handleToggle = async (value: boolean) => {
    setEnabled(value);
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        stripe_enabled: value,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentModeChange = async (value: 'required_now' | 'post_pay' | 'scheduled_before') => {
    setPaymentMode(value);
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        stripe_payment_mode: value,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduledHoursChange = async () => {
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        stripe_scheduled_hours_before: scheduledHours,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = () => {
    // TODO: Implementar Stripe Connect OAuth en Fase 2
    toast.info("La conexión con Stripe se habilitará próximamente", {
      description: "Esta funcionalidad está en desarrollo"
    });
  };

  const handleDisconnect = async () => {
    await disconnectProvider.mutateAsync('stripe');
    setEnabled(false);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = () => {
    switch (accountStatus) {
      case 'active':
        return (
          <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
            Activa
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">
            Pendiente
          </Badge>
        );
      case 'restricted':
        return (
          <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50">
            Restringida
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <CreditCard className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Stripe</CardTitle>
              <CardDescription>
                Recibe pagos online de tus pacientes
              </CardDescription>
            </div>
          </div>
          {isConnected && (
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isSaving || accountStatus !== 'active'}
            />
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isConnected ? (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Conecta tu cuenta de Stripe para recibir pagos online. Tus ingresos se depositarán directamente en tu cuenta bancaria.
              </AlertDescription>
            </Alert>
            
            <Button onClick={handleConnect} className="w-full gap-2">
              <CreditCard className="h-4 w-4" />
              Conectar con Stripe
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Cuenta conectada</p>
                  <p className="text-sm text-muted-foreground">
                    {connection?.stripe_account_id || 'Stripe Connect'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge()}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectProvider.isPending}
                >
                  {disconnectProvider.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Desconectar
                </Button>
              </div>
            </div>

            {accountStatus === 'pending' && (
              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Tu cuenta está pendiente de verificación. Completa el proceso en Stripe para empezar a recibir pagos.
                </AlertDescription>
              </Alert>
            )}

            {accountStatus === 'active' && enabled && (
              <div className="space-y-4">
                <Label className="text-base font-medium">Modo de cobro por defecto</Label>
                <RadioGroup value={paymentMode} onValueChange={(v) => handlePaymentModeChange(v as 'required_now' | 'post_pay' | 'scheduled_before')}>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="required_now" id="payment-required" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="payment-required" className="cursor-pointer font-medium text-sm">
                        Pago obligatorio
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        El paciente debe pagar para confirmar la cita
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="post_pay" id="payment-post" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="payment-post" className="cursor-pointer font-medium text-sm">
                        Post-pago
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        El pago se gestiona después de la sesión
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="scheduled_before" id="payment-scheduled" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="payment-scheduled" className="cursor-pointer font-medium text-sm">
                        Programado
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se envía el link de pago X horas antes de la cita
                      </p>
                    </div>
                  </div>
                </RadioGroup>

                {paymentMode === 'scheduled_before' && (
                  <div className="ml-8 space-y-2">
                    <Label htmlFor="scheduled-hours">Horas antes de la cita</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="scheduled-hours"
                        type="number"
                        min={1}
                        max={168}
                        value={scheduledHours}
                        onChange={(e) => setScheduledHours(parseInt(e.target.value) || 24)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">horas</span>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={handleScheduledHoursChange}
                        disabled={isSaving}
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
