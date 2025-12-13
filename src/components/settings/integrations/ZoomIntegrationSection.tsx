import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { Video, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

export function ZoomIntegrationSection() {
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  
  const [enabled, setEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isConnected = isProviderConnected('zoom');
  const connection = getOAuthConnection('zoom');

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
    // TODO: Implementar OAuth flow en Fase 2
    toast.info("La conexión con Zoom se habilitará próximamente", {
      description: "Esta funcionalidad está en desarrollo"
    });
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
            
            <Button onClick={handleConnect} className="w-full gap-2">
              <Video className="h-4 w-4" />
              Conectar con Zoom
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
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
