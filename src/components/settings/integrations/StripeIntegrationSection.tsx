import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, ExternalLink, CheckCircle2, AlertCircle, Loader2, Clock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export function StripeIntegrationSection() {
  const { profile } = useAuth();
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [enabled, setEnabled] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'required_now' | 'post_session' | 'scheduled_before'>('post_session');
  const [scheduledHours, setScheduledHours] = useState(24);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isConnected = isProviderConnected('stripe');
  const connection = getOAuthConnection('stripe');
  const accountStatus = connection?.stripe_account_status;

  // Handle OAuth callback
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthStatus && provider === 'stripe') {
      if (oauthStatus === 'success') {
        toast.success('Stripe conectado correctamente');
        // Refresh status after returning from Stripe
        handleRefreshStatus();
      } else if (oauthStatus === 'error') {
        const message = searchParams.get('message');
        toast.error(`Error al conectar Stripe: ${message || 'Error desconocido'}`);
      } else if (oauthStatus === 'refresh') {
        // User needs to continue onboarding
        toast.info('Continúa el proceso de verificación de Stripe');
      }
      // Clean up URL params
      searchParams.delete('oauth');
      searchParams.delete('provider');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const handlePaymentModeChange = async (value: 'required_now' | 'post_session' | 'scheduled_before') => {
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

  const handleConnect = async () => {
    if (!profile?.id) {
      toast.error('No se pudo obtener el ID del profesional');
      return;
    }

    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-connect-link', {
        body: { professional_id: profile.id },
      });

      if (error) throw error;

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No se pudo obtener el enlace de onboarding');
      }
    } catch (error) {
      console.error('Error creating Stripe Connect link:', error);
      toast.error('Error al conectar con Stripe');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshStatus = async () => {
    if (!profile?.id) return;

    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('refresh-stripe-account-status', {
        body: { professional_id: profile.id },
      });

      if (error) throw error;

      toast.success(`Estado actualizado: ${data.status}`);
      // Invalidate queries to refresh data
      window.location.reload();
    } catch (error) {
      console.error('Error refreshing Stripe status:', error);
      toast.error('Error al actualizar el estado');
    } finally {
      setIsRefreshing(false);
    }
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

  const hasConnection = !!connection;

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
                Recibe pagos online de tus contactos
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
        {!hasConnection ? (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Conecta tu cuenta de Stripe para recibir pagos online. Tus ingresos se depositarán directamente en tu cuenta bancaria.
              </AlertDescription>
            </Alert>
            
            <Button onClick={handleConnect} className="w-full gap-2" disabled={isConnecting}>
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              {isConnecting ? 'Conectando...' : 'Conectar con Stripe'}
              {!isConnecting && <ExternalLink className="h-3 w-3 ml-1" />}
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
                    {connection?.provider_account_id || connection?.stripe_account_id || 'Stripe Connect'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge()}
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleRefreshStatus}
                  disabled={isRefreshing}
                  title="Actualizar estado"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
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
                <AlertDescription className="flex items-center justify-between">
                  <span>Tu cuenta está pendiente de verificación. Completa el proceso en Stripe.</span>
                  <Button size="sm" variant="outline" onClick={handleConnect} disabled={isConnecting}>
                    {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar verificación'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {accountStatus === 'active' && enabled && (
              <div className="space-y-4">
                <Label className="text-base font-medium">Modo de cobro por defecto</Label>
                <RadioGroup value={paymentMode} onValueChange={(v) => handlePaymentModeChange(v as 'required_now' | 'post_session' | 'scheduled_before')}>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="required_now" id="payment-required" className="mt-0.5" />
                    <div className="flex-1">
                      <Label htmlFor="payment-required" className="cursor-pointer font-medium text-sm">
                        Pago obligatorio
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        El contacto debe pagar para confirmar la cita
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="post_session" id="payment-post" className="mt-0.5" />
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
