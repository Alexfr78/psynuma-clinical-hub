import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useAuth } from "@/hooks/useAuth";
import { useCenter } from "@/hooks/useCenter";
import { useGoogleCalendarWatch } from "@/hooks/useGoogleCalendarWatch";
import { Calendar, Video, ExternalLink, CheckCircle2, AlertCircle, Loader2, Settings2, Zap, RefreshCw, Activity, Clock, Database, Trash2, Download, Copy, FileJson, Bug, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";

interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  backgroundColor?: string;
}

export function GoogleIntegrationSection() {
  const { profile } = useAuth();
  const { center } = useCenter();
  const { integrations, isLoading, updateIntegrations, isProviderConnected, getOAuthConnection, disconnectProvider } = useProfessionalIntegrations();
  const { setupWatch, checkWatchStatus, renewWatchIfExpiring, isSettingUp, watchStatus } = useGoogleCalendarWatch();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [meetEnabled, setMeetEnabled] = useState(false);
  const [syncMode, setSyncMode] = useState<'one_way' | 'two_way'>('one_way');
  const [isSaving, setIsSaving] = useState(false);
  
  // Calendar selection
  const [calendars, setCalendars] = useState<GoogleCalendar[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  
  // Format settings
  const [titleFormat, setTitleFormat] = useState('{tipo} - {paciente}');
  const [descriptionFormat, setDescriptionFormat] = useState('Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}');
  const [showFormatSettings, setShowFormatSettings] = useState(false);
  
  // Sync days configuration
  const [syncDaysPast, setSyncDaysPast] = useState(30);
  const [syncDaysFuture, setSyncDaysFuture] = useState(90);

  // Cleanup state
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  
  // Force resync state
  const [isForceResyncing, setIsForceResyncing] = useState(false);
  
  // Diagnostics state
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const isConnected = isProviderConnected('google');
  const connection = getOAuthConnection('google');

  // Health Dashboard data
  const { data: healthData, refetch: refetchHealth } = useQuery({
    queryKey: ['google-calendar-health', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;
      
      // Get connection data with sync status (using safe view that excludes tokens)
      const { data: conn } = await supabase
        .from('oauth_connections_safe')
        .select('last_sync_at, last_sync_status, last_sync_error_code, watch_channel_id, watch_resource_id, watch_expires_at, expires_at, needs_reconnect')
        .eq('professional_id', profile.id)
        .eq('provider', 'google')
        .single();
      
      if (!conn) return null;
      
      // Get events count for current week
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      
      const { count } = await supabase
        .from('calendar_events')
        .select('*', { count: 'exact', head: true })
        .eq('professional_id', profile.id)
        .eq('provider', 'google')
        .eq('deleted', false)
        .gte('start_at', weekStart.toISOString())
        .lte('start_at', weekEnd.toISOString());
      
      return {
        ...conn,
        eventsThisWeek: count || 0,
      };
    },
    enabled: isConnected && !!profile?.id,
    refetchInterval: 60000, // Refresh every minute
  });

  // Handle OAuth callback and setup watch with initial sync
  useEffect(() => {
    const oauthStatus = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    
    if (oauthStatus && provider === 'google') {
      if (oauthStatus === 'success') {
        toast.success('Google conectado correctamente');
        // Auto-setup push notifications after successful connection
        setTimeout(() => {
          setupWatch();
        }, 1000);
        
        // Trigger initial sync after reconnection
        setTimeout(async () => {
          if (!profile?.id) return;
          toast.info('Sincronizando calendario...');
          try {
            const { data, error } = await supabase.functions.invoke('sync-google-calendar', {
              body: { professional_id: profile.id },
            });
            
            if (error || data?.errors?.length > 0) {
              toast.error(`Error al sincronizar: ${data?.errors?.[0] || error?.message}`);
            } else {
              const msgs: string[] = [];
              if (data?.created > 0) msgs.push(`${data.created} creados`);
              if (data?.updated > 0) msgs.push(`${data.updated} actualizados`);
              if (data?.calendarEventsImported > 0) msgs.push(`${data.calendarEventsImported} importados`);
              toast.success(msgs.length > 0 ? `Sync inicial: ${msgs.join(', ')}` : 'Sincronización completada');
            }
            refetchHealth();
          } catch (e) {
            toast.error('Error en sincronización inicial');
          }
        }, 2500);
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
  }, [searchParams, setSearchParams, setupWatch, profile?.id, refetchHealth]);

  // Check watch status on mount
  useEffect(() => {
    if (isConnected) {
      checkWatchStatus();
    }
  }, [isConnected, checkWatchStatus]);

  // Auto-renew watch channel if expiring soon (< 24h)
  useEffect(() => {
    // Check if connected (using expires_at since tokens are not exposed in safe view)
    if (isConnected && profile?.id && connection?.expires_at) {
      renewWatchIfExpiring().then(result => {
        if (result.renewed) {
          console.log('[WATCH] Channel renewed automatically');
          toast.info('Canal de notificaciones renovado automáticamente');
          refetchHealth();
        } else if (result.reason === 'renewal_failed') {
          console.error('[WATCH] Failed to renew channel');
          toast.warning('No se pudo renovar el canal de notificaciones');
        }
      });
    }
  }, [isConnected, profile?.id, connection?.expires_at, renewWatchIfExpiring, refetchHealth]);

  useEffect(() => {
    if (integrations) {
      setCalendarEnabled(integrations.google_calendar_enabled);
      setMeetEnabled(integrations.google_meet_enabled);
      setSyncMode(integrations.google_calendar_sync_mode);
      setTitleFormat(integrations.google_event_title_format || '{tipo} - {paciente}');
      setDescriptionFormat(integrations.google_event_description_format || 'Profesional: {profesional}\nTipo: {tipo}\nNotas: {notas}');
      setSyncDaysPast(integrations.google_sync_days_past ?? 30);
      setSyncDaysFuture(integrations.google_sync_days_future ?? 90);
    }
  }, [integrations]);

  useEffect(() => {
    if (connection?.google_calendar_id) {
      setSelectedCalendarId(connection.google_calendar_id);
    }
  }, [connection]);

  // Fetch calendars when connected
  useEffect(() => {
    if (isConnected && profile?.id && calendarEnabled) {
      fetchCalendars();
    }
  }, [isConnected, profile?.id, calendarEnabled]);

  const fetchCalendars = async () => {
    if (!profile?.id) return;
    
    setIsLoadingCalendars(true);
    try {
      const { data, error } = await supabase.functions.invoke('list-google-calendars', {
        body: { professional_id: profile.id },
      });
      
      if (error) throw error;
      setCalendars(data.calendars || []);
    } catch (error) {
      console.error('Error fetching calendars:', error);
    } finally {
      setIsLoadingCalendars(false);
    }
  };

  const handleCalendarToggle = async (value: boolean) => {
    setCalendarEnabled(value);
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

  const handleCalendarSelect = async (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    
    // Update oauth_connections directly
    if (profile?.id) {
      const { error } = await supabase
        .from('oauth_connections')
        .update({ google_calendar_id: calendarId })
        .eq('professional_id', profile.id)
        .eq('provider', 'google');
      
      if (error) {
        toast.error('Error al guardar calendario');
        console.error(error);
      } else {
        toast.success('Calendario seleccionado');
      }
    }
  };

  const handleSaveFormats = async () => {
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        google_event_title_format: titleFormat,
        google_event_description_format: descriptionFormat,
      });
      toast.success('Formato guardado');
    } catch {
      toast.error('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSyncDays = async () => {
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        google_sync_days_past: syncDaysPast,
        google_sync_days_future: syncDaysFuture,
      });
      toast.success('Rango de sincronización guardado');
    } catch {
      toast.error('Error al guardar');
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
    // Clear sync_token before disconnecting to ensure full resync on reconnect
    if (profile?.id) {
      await supabase
        .from('oauth_connections')
        .update({ sync_token: null })
        .eq('professional_id', profile.id)
        .eq('provider', 'google');
    }
    await disconnectProvider.mutateAsync('google');
    setCalendarEnabled(false);
    setMeetEnabled(false);
    setCalendars([]);
  };

  const handleForceFullResync = async () => {
    if (!profile?.id) return;
    
    setIsForceResyncing(true);
    try {
      // Clear sync_token to force full resync
      await supabase
        .from('oauth_connections')
        .update({ sync_token: null })
        .eq('professional_id', profile.id)
        .eq('provider', 'google');
      
      // Extended range: 90 days past, 120 days future
      const now = new Date();
      const dateFrom = new Date(now);
      dateFrom.setDate(dateFrom.getDate() - 90);
      const dateTo = new Date(now);
      dateTo.setDate(dateTo.getDate() + 120);
      
      toast.info('Iniciando resincronización completa...');
      
      const { data, error } = await supabase.functions.invoke('sync-google-calendar', {
        body: { 
          professional_id: profile.id,
          date_from: dateFrom.toISOString().split('T')[0],
          date_to: dateTo.toISOString().split('T')[0],
        },
      });
      
      if (error || data?.errors?.length > 0) {
        toast.error(`Error: ${data?.errors?.[0] || error?.message}`);
      } else {
        const msgs: string[] = [];
        if (data?.created > 0) msgs.push(`${data.created} creados`);
        if (data?.updated > 0) msgs.push(`${data.updated} actualizados`);
        if (data?.calendarEventsImported > 0) msgs.push(`${data.calendarEventsImported} eventos importados`);
        toast.success(msgs.length > 0 ? `Resync completo: ${msgs.join(', ')}` : 'Sincronización completada');
        refetchHealth();
      }
    } catch (e) {
      toast.error('Error en resincronización');
    } finally {
      setIsForceResyncing(false);
    }
  };

  const handleCleanupEvents = async () => {
    if (!profile?.id) return;
    
    setIsCleaningUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-google-events', {
        body: {}, // professional_id is resolved from JWT
      });
      
      if (error) {
        toast.error(`Error: ${error.message}`);
      } else if (data?.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data?.deleted || 0} eventos eliminados de ${data?.found || 0} encontrados`);
        refetchHealth();
      }
    } catch (e) {
      toast.error('Error al eliminar eventos');
    } finally {
      setIsCleaningUp(false);
      setShowCleanupConfirm(false);
    }
  };

  const handleDownloadDiagnostics = async () => {
    if (!profile?.id) return;
    
    setIsLoadingDiagnostics(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-google-sync-diagnostics', {
        body: { limit: 100 },
      });
      
      if (error) throw error;
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const timestamp = format(new Date(), 'yyyyMMdd-HHmm');
      a.href = url;
      a.download = `google-sync-diagnostics-${timestamp}-${profile.id.substring(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Diagnóstico descargado');
    } catch (e) {
      console.error('Error downloading diagnostics:', e);
      toast.error('Error al descargar diagnóstico');
    } finally {
      setIsLoadingDiagnostics(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    if (!profile?.id) return;
    
    setIsLoadingDiagnostics(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-google-sync-diagnostics', {
        body: { limit: 50 },
      });
      
      if (error) throw error;
      
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      toast.success('Diagnóstico copiado al portapapeles');
    } catch (e) {
      console.error('Error copying diagnostics:', e);
      toast.error('Error al copiar diagnóstico');
    } finally {
      setIsLoadingDiagnostics(false);
    }
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

  const formatVariables = [
    { var: '{paciente}', desc: 'Nombre del paciente' },
    { var: '{profesional}', desc: 'Nombre del profesional' },
    { var: '{tipo}', desc: 'Tipo de sesión' },
    { var: '{hora}', desc: 'Hora de la sesión' },
    { var: '{fecha}', desc: 'Fecha de la sesión' },
    { var: '{notas}', desc: 'Notas de la sesión' },
    { var: '{telefono}', desc: 'Teléfono del paciente' },
    { var: '{modalidad}', desc: 'Presencial / Online' },
    { var: '{ubicacion}', desc: 'Nombre de la ubicación' },
    { var: '{direccion}', desc: 'Dirección completa' },
    { var: '{bono}', desc: 'Nombre del bono' },
    { var: '{politica_cancelacion}', desc: 'Política de cancelación' },
    { var: '{link_videollamada}', desc: 'Enlace de videollamada' },
    { var: '{email_paciente}', desc: 'Email del paciente' },
    { var: '{precio}', desc: 'Precio de la sesión' },
  ];

  // Get sync status display info
  const getSyncStatusDisplay = (status: string | null) => {
    if (!status) return { label: 'Pendiente', color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: null };
    
    switch (status) {
      case 'ok':
      case 'watch_configured':
        return { label: status, color: 'bg-green-500/10 text-green-600 border-green-500/20', icon: <CheckCircle2 className="h-3 w-3 mr-1" /> };
      case 'needs_reconnect':
      case 'watch_setup_failed':
        return { 
          label: status === 'watch_setup_failed' ? 'Error en notificaciones' : status, 
          color: 'bg-red-500/10 text-red-600 border-red-500/20', 
          icon: <AlertCircle className="h-3 w-3 mr-1" /> 
        };
      default:
        return { label: status, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20', icon: null };
    }
  };

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
            {/* Reconnection Alert - Shows when needs_reconnect is true */}
            {healthData?.needs_reconnect && (
              <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex flex-col gap-3">
                  <div>
                    {healthData?.last_sync_error_code === 'invalid_client' ? (
                      <>
                        <p className="font-medium">⚠️ Credenciales OAuth del centro inválidas</p>
                        <p className="text-sm mt-1">
                          El Client ID o Client Secret no coinciden con Google Cloud Console. 
                          Actualiza las credenciales en <strong>Credenciales OAuth propias</strong> (más abajo) y luego reconecta.
                        </p>
                      </>
                    ) : healthData?.last_sync_error_code === 'invalid_grant' ? (
                      <>
                        <p className="font-medium">🔑 Acceso a Google revocado</p>
                        <p className="text-sm mt-1">
                          El acceso fue revocado desde Google o expiró. Reconecta tu cuenta para continuar.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">La conexión con Google ha expirado</p>
                        <p className="text-sm mt-1">Reconecta tu cuenta para continuar sincronizando citas automáticamente.</p>
                      </>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {healthData?.last_sync_error_code === 'invalid_client' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          // Scroll to OAuth credentials section
                          document.getElementById('oauth-credentials-section')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                      >
                        Ir a Credenciales OAuth
                      </Button>
                    )}
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleConnect}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reconectar ahora
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                {healthData?.needs_reconnect ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                <div>
                  <p className="font-medium">
                    {healthData?.needs_reconnect ? 'Reconexión necesaria' : 'Cuenta conectada'}
                  </p>
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

            {/* Cleanup Button - Visible when connected */}
            {isConnected && (
              <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Trash2 className="h-4 w-4 text-destructive" />
                      Eliminar eventos de Psycma en Google
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Solo se procesarán eventos dentro del rango: {syncDaysPast} días pasados / {syncDaysFuture} días futuros
                    </p>
                  </div>
                </div>
                
                {!showCleanupConfirm ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowCleanupConfirm(true)}
                    className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar eventos
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        ¿Eliminar todos los eventos creados por Psycma en tu calendario de Google?
                        Solo se eliminarán eventos dentro del rango configurado ({syncDaysPast} días pasados / {syncDaysFuture} días futuros).
                      </AlertDescription>
                    </Alert>
                    <div className="flex gap-2">
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleCleanupEvents}
                        disabled={isCleaningUp}
                      >
                        {isCleaningUp ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Confirmar eliminación
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowCleanupConfirm(false)}
                        disabled={isCleaningUp}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                <div className="ml-8 space-y-4">
                  {/* Calendar Selection */}
                  <div className="space-y-2">
                    <Label className="text-sm">Calendario a sincronizar</Label>
                    {isLoadingCalendars ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select value={selectedCalendarId} onValueChange={handleCalendarSelect}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar calendario..." />
                        </SelectTrigger>
                        <SelectContent>
                          {calendars.length === 0 ? (
                            <SelectItem value="primary">Calendario principal</SelectItem>
                          ) : (
                            calendars.map((cal) => (
                              <SelectItem key={cal.id} value={cal.id}>
                                <div className="flex items-center gap-2">
                                  {cal.backgroundColor && (
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: cal.backgroundColor }}
                                    />
                                  )}
                                  <span>{cal.summary}</span>
                                  {cal.primary && <span className="text-xs text-muted-foreground">(principal)</span>}
                                </div>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Sync Mode */}
                  <div className="space-y-2">
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
                            Los cambios de horario se aplican en ambos sentidos de forma segura
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                    {syncMode === 'two_way' && (
                      <Alert>
                        <ShieldCheck className="h-4 w-4" />
                        <AlertDescription className="text-xs leading-relaxed">
                          Si una cita cambia solo en Google, Psycma actualizará su horario. Si la
                          misma cita cambia a la vez en ambos calendarios, se conservarán las dos
                          versiones y se marcará el conflicto sin sobrescribir ninguna.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  {/* Health Dashboard */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2 w-full justify-start">
                        <Activity className="h-4 w-4" />
                        Estado de sincronización
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-3 p-3 border rounded-lg bg-muted/30 space-y-3">
                      {healthData ? (
                        <div className="space-y-3">
                          {/* Sync Status */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Estado</span>
                            {(() => {
                              const statusInfo = getSyncStatusDisplay(healthData.last_sync_status);
                              return (
                                <Badge variant="secondary" className={statusInfo.color}>
                                  {statusInfo.icon}
                                  {statusInfo.label}
                                </Badge>
                              );
                            })()}
                          </div>

                          {/* Last Sync */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Última sincronización
                            </span>
                            <span className="text-sm">
                              {healthData.last_sync_at 
                                ? formatDistanceToNow(new Date(healthData.last_sync_at), { addSuffix: true, locale: es })
                                : 'Nunca'}
                            </span>
                          </div>

                          {/* Token Expiry */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Token OAuth</span>
                            <span className="text-sm">
                              {healthData.expires_at 
                                ? new Date(healthData.expires_at) > new Date() 
                                  ? `Válido (${formatDistanceToNow(new Date(healthData.expires_at), { locale: es })})`
                                  : 'Expirado'
                                : 'N/A'}
                            </span>
                          </div>

                          {/* Watch Channel */}
                          {syncMode === 'two_way' && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Zap className="h-3 w-3" />
                                Push webhook
                              </span>
                              <span className="text-sm">
                                {healthData.watch_expires_at 
                                  ? new Date(healthData.watch_expires_at) > new Date()
                                    ? `Activo (${formatDistanceToNow(new Date(healthData.watch_expires_at), { locale: es })})`
                                    : 'Expirado'
                                  : 'No configurado'}
                              </span>
                            </div>
                          )}

                          {/* Events Count */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Database className="h-3 w-3" />
                              Eventos esta semana
                            </span>
                            <span className="text-sm font-medium">{healthData.eventsThisWeek}</span>
                          </div>

                          {/* Reconnect Warning */}
                          {healthData.needs_reconnect && (
                            <Alert variant="destructive" className="mt-2">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                Se requiere reconexión. Desconecta y vuelve a conectar tu cuenta de Google.
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Watch Setup Failed Warning */}
                          {healthData.last_sync_status === 'watch_setup_failed' && (
                            <Alert variant="destructive" className="mt-2">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>
                                Error al configurar notificaciones en tiempo real. La sincronización funcionará mediante polling cada 15 minutos.
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Sync Status Indicator */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Estado de sincronización</span>
                            <span className="text-xs text-muted-foreground">
                              {healthData.last_sync_at ? '✓ Sincronización activa' : 'Pendiente de sincronización'}
                            </span>
                          </div>

                          {/* Force Full Resync Button */}
                          <Separator className="my-2" />
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">
                              Si los eventos externos no aparecen, fuerza una resincronización completa (90 días pasado/120 días futuro).
                            </p>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={handleForceFullResync}
                              disabled={isForceResyncing}
                              className="w-full gap-2"
                            >
                              {isForceResyncing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                              Forzar resincronización completa
                            </Button>
                          </div>

                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => refetchHealth()}
                            className="w-full mt-2"
                          >
                            <RefreshCw className="h-3 w-3 mr-2" />
                            Actualizar estado
                          </Button>

                          {/* Diagnostics Section */}
                          <Separator className="my-3" />
                          <Collapsible open={showDiagnostics} onOpenChange={setShowDiagnostics}>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="gap-2 w-full justify-start text-xs">
                                <Bug className="h-3 w-3" />
                                Diagnóstico avanzado
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-2 space-y-3">
                              {/* Quick status summary */}
                              <div className="p-2 bg-muted/50 rounded text-xs space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Estado conexión:</span>
                                  <Badge variant="outline" className={healthData.needs_reconnect ? 'border-destructive text-destructive' : 'border-green-500 text-green-600'}>
                                    {healthData.needs_reconnect ? 'needs_reconnect' : 'connected'}
                                  </Badge>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">last_sync_status:</span>
                                  <span className="font-mono">{healthData.last_sync_status || 'null'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Token expirado:</span>
                                  <span className={healthData.expires_at && new Date(healthData.expires_at) < new Date() ? 'text-destructive' : 'text-green-600'}>
                                    {healthData.expires_at ? (new Date(healthData.expires_at) < new Date() ? 'Sí' : 'No') : 'N/A'}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleDownloadDiagnostics}
                                  disabled={isLoadingDiagnostics}
                                  className="flex-1 text-xs"
                                >
                                  {isLoadingDiagnostics ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
                                  Descargar JSON
                                </Button>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={handleCopyDiagnostics}
                                  disabled={isLoadingDiagnostics}
                                  className="flex-1 text-xs"
                                >
                                  {isLoadingDiagnostics ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                                  Copiar
                                </Button>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                El JSON incluye historial de errores y estado detallado para diagnóstico.
                              </p>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground text-center py-2">
                          Cargando estado de sincronización...
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Real-time Sync Status */}
                  {syncMode === 'two_way' && (
                    <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-yellow-500" />
                          <Label className="text-sm font-medium">Sincronización en tiempo real</Label>
                        </div>
                        {watchStatus.isActive ? (
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Activa
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Inactiva
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {watchStatus.isActive 
                          ? `Los cambios en Google Calendar se reflejan inmediatamente. Expira: ${new Date(watchStatus.expiration!).toLocaleDateString()}`
                          : 'Activa las notificaciones push para sincronizar cambios al instante'}
                      </p>
                      {!watchStatus.isActive && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={setupWatch}
                          disabled={isSettingUp}
                          className="w-full"
                        >
                          {isSettingUp ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Activar sincronización instantánea
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Sync Days Configuration */}
                  <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                    <Label className="text-sm font-medium">Sincronizar historial de citas (pasadas y futuras)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Días pasados</Label>
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={syncDaysPast}
                          onChange={(e) => setSyncDaysPast(parseInt(e.target.value) || 0)}
                          placeholder="30"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Días futuros</Label>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={syncDaysFuture}
                          onChange={(e) => setSyncDaysFuture(parseInt(e.target.value) || 90)}
                          placeholder="90"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Introduce 0 en días pasados para no sincronizar eventos anteriores.
                    </p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSaveSyncDays}
                      disabled={isSaving}
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Guardar rango
                    </Button>
                  </div>

                  {/* Format Settings */}
                  <Collapsible open={showFormatSettings} onOpenChange={setShowFormatSettings}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2 w-full justify-start">
                        <Settings2 className="h-4 w-4" />
                        Personalizar formato del evento
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-3">
                      <div className="space-y-2">
                        <Label className="text-sm">Título del evento</Label>
                        <Input
                          value={titleFormat}
                          onChange={(e) => setTitleFormat(e.target.value)}
                          placeholder="{tipo} - {contacto}"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Descripción del evento</Label>
                        <Textarea
                          value={descriptionFormat}
                          onChange={(e) => setDescriptionFormat(e.target.value)}
                          placeholder="Profesional: {profesional}..."
                          rows={4}
                        />
                      </div>

                      <div className="p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs font-medium mb-2">Variables disponibles:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {formatVariables.map((v, idx) => (
                            <code 
                              key={`${v.var}-${idx}`} 
                              className="text-xs bg-background px-1.5 py-0.5 rounded border cursor-help"
                              title={v.desc}
                            >
                              {v.var}
                            </code>
                          ))}
                        </div>
                      </div>

                      <Button 
                        size="sm" 
                        onClick={handleSaveFormats}
                        disabled={isSaving}
                      >
                        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Guardar formato
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>
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
