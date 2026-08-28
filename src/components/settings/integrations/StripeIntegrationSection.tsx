import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { StripeDiagnosticsPanel } from "./StripeDiagnosticsPanel";
import { Icon } from '@/components/ui/icon';

interface StripeIntegrationSectionProps {
  onOpenPaymentSettings?: () => void;
}

export function StripeIntegrationSection({ onOpenPaymentSettings }: StripeIntegrationSectionProps) {
  const { profile } = useAuth();
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isConnected = isProviderConnected('stripe');
  const connection = getOAuthConnection('stripe');
  const accountStatus = connection?.stripe_account_status;

  useEffect(() => {
    if (integrations) {
      setEnabled(integrations.stripe_enabled);
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

  // Handle OAuth callback. The callback is intentionally processed once from
  // the URL and then removed so refreshing the page cannot repeat it.
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');

    if (oauthStatus && provider === 'stripe') {
      if (oauthStatus === 'success') {
        toast.success('Stripe conectado correctamente');
        handleRefreshStatus();
      } else if (oauthStatus === 'error') {
        const message = searchParams.get('message');
        toast.error(`Error al conectar Stripe: ${message || 'Error desconocido'}`);
      } else if (oauthStatus === 'refresh') {
        toast.info('Continúa el proceso de verificación de Stripe');
      }
      searchParams.delete('oauth');
      searchParams.delete('provider');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
    // handleRefreshStatus only depends on the current profile and this effect
    // is driven by the callback parameters, not by function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

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
              <Icon name="credit_card" className="h-5 w-5 text-purple-600" />
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
              <Icon name="error" className="h-4 w-4" />
              <AlertDescription>
                Conecta tu cuenta de Stripe para recibir pagos online. Tus ingresos se depositarán directamente en tu cuenta bancaria.
              </AlertDescription>
            </Alert>
            
            <Button onClick={handleConnect} className="w-full gap-2" disabled={isConnecting}>
              {isConnecting ? (
                <Icon name="progress_activity" className="h-4 w-4 animate-spin" />
              ) : (
                <Icon name="credit_card" className="h-4 w-4" />
              )}
              {isConnecting ? 'Conectando...' : 'Conectar con Stripe'}
              {!isConnecting && <Icon name="open_in_new" className="h-3 w-3 ml-1" />}
            </Button>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <Icon name="check_circle" className="h-5 w-5 text-green-600" />
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
                  <Icon name="refresh" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnectProvider.isPending}
                >
                  {disconnectProvider.isPending ? (
                    <Icon name="progress_activity" className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Desconectar
                </Button>
              </div>
            </div>

            {accountStatus === 'pending' && (
              <Alert>
                <Icon name="schedule" className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>Tu cuenta está pendiente de verificación. Completa el proceso en Stripe.</span>
                  <Button size="sm" variant="outline" onClick={handleConnect} disabled={isConnecting}>
                    {isConnecting ? <Icon name="progress_activity" className="h-4 w-4 animate-spin" /> : 'Continuar verificación'}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {accountStatus === 'active' && enabled && (
              <Alert>
                <Icon name="tune" className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Stripe está listo. El momento del cobro se configura una sola vez en
                    <strong> Pagos y Facturación → Métodos de cobro</strong>.
                  </span>
                  {onOpenPaymentSettings && (
                    <Button size="sm" variant="outline" onClick={onOpenPaymentSettings}>
                      Configurar cobros
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <StripeDiagnosticsPanel />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
