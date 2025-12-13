import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useAuth } from "@/hooks/useAuth";
import { Video, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

const ZOOM_CLIENT_ID = "YOUR_ZOOM_CLIENT_ID"; // Will be replaced with env var

export function ZoomIntegrationSection() {
  const { profile } = useAuth();
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isConnected = isProviderConnected('zoom');
  const connection = getOAuthConnection('zoom');

  // Handle OAuth callback
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthStatus && provider === 'zoom') {
      if (oauthStatus === 'success') {
        toast.success('Zoom conectado correctamente');
      } else if (oauthStatus === 'error') {
        const message = searchParams.get('message');
        toast.error(`Error al conectar Zoom: ${message || 'Error desconocido'}`);
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
      setEnabled(integrations.zoom_enabled);
    }
  }, [integrations]);

  const handleToggle = async (value: boolean) => {
    setEnabled(value);
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        zoom_enabled: value,
        default_video_provider: value ? 'zoom' : (integrations?.google_meet_enabled ? 'google_meet' : 'none'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnect = () => {
    if (!profile?.id) {
      toast.error('No se pudo obtener el ID del profesional');
      return;
    }

    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-zoom-callback`;
    const state = btoa(JSON.stringify({ 
      professional_id: profile.id,
      redirect_uri: redirectUri,
    }));

    // Open Zoom OAuth in new window
    const zoomAuthUrl = new URL('https://zoom.us/oauth/authorize');
    zoomAuthUrl.searchParams.set('response_type', 'code');
    zoomAuthUrl.searchParams.set('client_id', ZOOM_CLIENT_ID);
    zoomAuthUrl.searchParams.set('redirect_uri', redirectUri);
    zoomAuthUrl.searchParams.set('state', state);

    window.location.href = zoomAuthUrl.toString();
  };

  const handleDisconnect = async () => {
    await disconnectProvider.mutateAsync('zoom');
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Video className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Zoom</CardTitle>
              <CardDescription>
                Crea reuniones de Zoom automáticamente para tus sesiones
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={isSaving || (!isConnected && enabled)}
          />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {!isConnected ? (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Conecta tu cuenta de Zoom para crear reuniones automáticamente al programar sesiones.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <Button onClick={handleConnect} className="w-full gap-2">
                <Video className="h-4 w-4" />
                Conectar con Zoom
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                <p className="font-medium">Pasos para configurar Zoom OAuth:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Ve al <a href="https://marketplace.zoom.us" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Zoom Marketplace</a></li>
                  <li>Crea una aplicación OAuth</li>
                  <li>Configura la Redirect URL: <code className="bg-muted px-1 rounded text-xs">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-zoom-callback`}</code></li>
                  <li>Añade los scopes: meeting:write, user:read</li>
                  <li>Copia el Client ID y Secret a los secrets del proyecto</li>
                </ol>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Cuenta conectada</p>
                  <p className="text-sm text-muted-foreground">
                    {connection?.provider_account_id || 'Zoom conectado'}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                Activo
              </Badge>
            </div>

            <div className="flex justify-end">
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
        )}

        {enabled && isConnected && (
          <p className="text-sm text-muted-foreground">
            Las reuniones de Zoom se crearán automáticamente al programar nuevas sesiones.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
