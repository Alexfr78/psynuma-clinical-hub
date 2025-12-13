import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useAuth } from "@/hooks/useAuth";
import { useCenter } from "@/hooks/useCenter";
import { Calendar, Video, ExternalLink, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export function GoogleIntegrationSection() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [meetEnabled, setMeetEnabled] = useState(false);
  const [syncMode, setSyncMode] = useState<'one_way' | 'two_way'>('one_way');
  const [isSaving, setIsSaving] = useState(false);

  const isConnected = isProviderConnected('google');
  const connection = getOAuthConnection('google');

  // Handle OAuth callback
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthStatus && provider === 'google') {
      if (oauthStatus === 'success') {
        toast.success('Google conectado correctamente');
      } else if (oauthStatus === 'error') {
        const message = searchParams.get('message');
        toast.error(`Error al conectar Google: ${message || 'Error desconocido'}`);
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
      setCalendarEnabled(integrations.google_calendar_enabled);
      setMeetEnabled(integrations.google_meet_enabled);
      setSyncMode(integrations.google_calendar_sync_mode);
    }
  }, [integrations]);

  const handleCalendarToggle = async (value: boolean) => {
    setCalendarEnabled(value);
    // If disabling calendar, also disable Meet
    if (!value) setMeetEnabled(false);
    
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        google_calendar_enabled: value,
        google_meet_enabled: value ? meetEnabled : false,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleMeetToggle = async (value: boolean) => {
    setMeetEnabled(value);
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        google_meet_enabled: value,
        default_video_provider: value ? 'google_meet' : (integrations?.zoom_enabled ? 'zoom' : 'none'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncModeChange = async (value: 'one_way' | 'two_way') => {
    setSyncMode(value);
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        google_calendar_sync_mode: value,
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

    const googleClientId = center?.oauth_google_client_id;
    if (!googleClientId) {
      toast.error('Configura las credenciales OAuth de Google primero en la sección de Credenciales OAuth');
      return;
    }

    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-google-callback`;
    const state = btoa(JSON.stringify({ 
      professional_id: profile.id,
      redirect_uri: redirectUri,
    }));

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ].join(' ');

    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.set('client_id', googleClientId);
    googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
    googleAuthUrl.searchParams.set('response_type', 'code');
    googleAuthUrl.searchParams.set('scope', scopes);
    googleAuthUrl.searchParams.set('state', state);
    googleAuthUrl.searchParams.set('access_type', 'offline');
    googleAuthUrl.searchParams.set('prompt', 'consent');

    window.location.href = googleAuthUrl.toString();
  };

  const handleDisconnect = async () => {
    await disconnectProvider.mutateAsync('google');
    setCalendarEnabled(false);
    setMeetEnabled(false);
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
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/10">
            <Calendar className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Google Calendar y Meet</CardTitle>
            <CardDescription>
              Sincroniza citas y crea videollamadas con Google
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {!isConnected ? (
          <>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Conecta tu cuenta de Google para sincronizar tu calendario y crear reuniones de Meet.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-3">
              <Button onClick={handleConnect} className="w-full gap-2">
                <Calendar className="h-4 w-4" />
                Conectar con Google
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
              
              <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2">
                <p className="font-medium">Pasos para configurar Google OAuth:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Ve a <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Cloud Console</a></li>
                  <li>Crea un proyecto o selecciona uno existente</li>
                  <li>Habilita las APIs: Google Calendar API</li>
                  <li>Configura la pantalla de consentimiento OAuth</li>
                  <li>Crea credenciales OAuth 2.0 (Web application)</li>
                  <li>Añade la Redirect URI: <code className="bg-muted px-1 rounded text-xs">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oauth-google-callback`}</code></li>
                  <li>Copia el Client ID y Secret a los secrets del proyecto</li>
                </ol>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Cuenta conectada</p>
                  <p className="text-sm text-muted-foreground">
                    {connection?.provider_account_id || 'Google conectado'}
                  </p>
                </div>
              </div>
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

            <Separator />

            {/* Google Calendar */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Google Calendar</p>
                    <p className="text-sm text-muted-foreground">
                      Sincroniza sesiones con tu calendario
                    </p>
                  </div>
                </div>
                <Switch
                  checked={calendarEnabled}
                  onCheckedChange={handleCalendarToggle}
                  disabled={isSaving}
                />
              </div>

              {calendarEnabled && (
                <div className="ml-8 space-y-3">
                  <Label className="text-sm">Modo de sincronización</Label>
                  <RadioGroup value={syncMode} onValueChange={(v) => handleSyncModeChange(v as 'one_way' | 'two_way')}>
                    <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                      <RadioGroupItem value="one_way" id="sync-one-way" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="sync-one-way" className="cursor-pointer font-medium text-sm">
                          1 vía (Psycma → Google)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Las citas de Psycma se crean en Google Calendar
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                      <RadioGroupItem value="two_way" id="sync-two-way" className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor="sync-two-way" className="cursor-pointer font-medium text-sm">
                          2 vías (Bidireccional)
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Los cambios se sincronizan en ambas direcciones
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              )}
            </div>

            <Separator />

            {/* Google Meet */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Google Meet</p>
                  <p className="text-sm text-muted-foreground">
                    Crea videollamadas automáticamente
                  </p>
                </div>
              </div>
              <Switch
                checked={meetEnabled}
                onCheckedChange={handleMeetToggle}
                disabled={isSaving || !calendarEnabled}
              />
            </div>
            
            {!calendarEnabled && (
              <p className="text-xs text-muted-foreground ml-8">
                Habilita Google Calendar para usar Meet
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
