import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCenter } from "@/hooks/useCenter";

interface DriveConnectionStatus {
  connected: boolean;
  google_account_email?: string | null;
  enabled?: boolean | null;
  needs_reconnect?: boolean | null;
  drive_root_folder_id?: string | null;
  last_upload_at?: string | null;
  last_upload_error?: string | null;
}

export function GoogleDriveIntegrationSection() {
  const { profile, isAdmin } = useAuth();
  const { center } = useCenter();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ['google-drive-connection', profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<DriveConnectionStatus>('google-drive-connection', {
        body: { action: 'status' },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });

  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');

    if (oauthStatus && provider === 'google_drive') {
      if (oauthStatus === 'success') {
        toast.success('Google Drive conectado correctamente');
        queryClient.invalidateQueries({ queryKey: ['google-drive-connection'] });
      } else if (oauthStatus === 'error') {
        const message = searchParams.get('message');
        toast.error(`Error al conectar Google Drive: ${message || 'Error desconocido'}`);
      }
      searchParams.delete('oauth');
      searchParams.delete('provider');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  const handleConnect = () => {
    if (!profile?.id) {
      toast.error('No se pudo obtener el ID del profesional');
      return;
    }
    const clientId = center?.oauth_google_drive_client_id;
    if (!clientId) {
      toast.error('Configura primero las credenciales OAuth de Google Drive en Configuración avanzada');
      return;
    }

    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-oauth-callback`;
    const state = btoa(JSON.stringify({
      center_id: profile.center_id,
      professional_id: profile.id,
      redirect_uri: redirectUri,
    }));

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    window.location.href = authUrl.toString();
  };

  const handleDisconnect = async () => {
    try {
      const { error } = await supabase.functions.invoke('google-drive-connection', {
        body: { action: 'disconnect' },
      });
      if (error) throw error;
      toast.success('Google Drive desconectado');
      queryClient.invalidateQueries({ queryKey: ['google-drive-connection'] });
    } catch (err) {
      toast.error('Error al desconectar Google Drive');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/10">
            <HardDrive className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Google Drive (documentos)</CardTitle>
            <CardDescription>
              Copia externa de las facturas (y próximamente otros documentos) del centro, fuera de Lovable/Supabase.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Conectado
              </Badge>
              {status.needs_reconnect && (
                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Requiere reconexión
                </Badge>
              )}
            </div>
            {status.google_account_email && (
              <p className="text-sm text-muted-foreground">Cuenta: {status.google_account_email}</p>
            )}
            {status.last_upload_error && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  Último error de subida: {status.last_upload_error}
                </AlertDescription>
              </Alert>
            )}
            {isAdmin && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleConnect}>
                  Reconectar
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDisconnect} className="text-destructive hover:text-destructive">
                  Desconectar
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              No conectado. Los documentos generados solo se guardan en Supabase Storage.
            </p>
            {isAdmin ? (
              <Button size="sm" onClick={handleConnect} className="gap-2">
                <HardDrive className="h-4 w-4" />
                Conectar Google Drive
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Solo un administrador del centro puede conectar Google Drive.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
