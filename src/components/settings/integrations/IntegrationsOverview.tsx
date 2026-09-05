import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useCenter } from "@/hooks/useCenter";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Icon } from '@/components/ui/icon';

interface IntegrationStatusProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  enabled: boolean;
  connected?: boolean;
}

function IntegrationStatus({ icon, name, description, enabled, connected }: IntegrationStatusProps) {
  const isActive = enabled && (connected !== false);
  
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
          {icon}
        </div>
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <Badge variant={isActive ? "default" : "secondary"} className="gap-1">
        {isActive ? (
          <>
            <Icon name="check_circle" className="h-3 w-3" />
            Activo
          </>
        ) : (
          <>
            <Icon name="cancel" className="h-3 w-3" />
            Inactivo
          </>
        )}
      </Badge>
    </div>
  );
}

export function IntegrationsOverview() {
  const { integrations, isLoading, isProviderConnected, updateIntegrations } = useProfessionalIntegrations();
  const { center } = useCenter();
  const { profile } = useAuth();

  const { data: plaudStatus } = useQuery({
    queryKey: ["plaud-connection", profile?.center_id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ connected: boolean; enabled?: boolean | null }>(
        "plaud-connection",
        { body: { action: "status" } }
      );
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });

  const bothVideoEnabled =
    (integrations?.zoom_enabled && isProviderConnected('zoom')) &&
    (integrations?.google_meet_enabled && isProviderConnected('google'));

  const handleDefaultProviderChange = (value: string) => {
    updateIntegrations.mutate({
      default_video_provider: value as 'zoom' | 'google_meet',
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumen de Integraciones</CardTitle>
        <CardDescription>
          Estado actual de tus integraciones conectadas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <IntegrationStatus
          icon={<Icon name="mail" className="h-5 w-5" />}
          name="Email (Resend)"
          description="Envío de facturas, recordatorios y notificaciones"
          enabled={true}
          connected={true}
        />
        
        <IntegrationStatus
          icon={<Icon name="forum" className="h-5 w-5" />}
          name="WhatsApp Business"
          description="Envío de notificaciones y recordatorios"
          enabled={integrations?.whatsapp_enabled ?? false}
        />
        
        <IntegrationStatus
          icon={<Icon name="forum" className="h-5 w-5" />}
          name="WasenderAPI"
          description="Automatización WhatsApp con tu número"
          enabled={center?.wasender_enabled ?? false}
        />
        
        <IntegrationStatus
          icon={<Icon name="videocam" className="h-5 w-5" />}
          name="Zoom"
          description="Videollamadas automáticas"
          enabled={integrations?.zoom_enabled ?? false}
          connected={isProviderConnected('zoom')}
        />
        
        <IntegrationStatus
          icon={<Icon name="calendar_month" className="h-5 w-5" />}
          name="Google Calendar"
          description="Sincronización de citas"
          enabled={integrations?.google_calendar_enabled ?? false}
          connected={isProviderConnected('google')}
        />
        
        <IntegrationStatus
          icon={<Icon name="videocam" className="h-5 w-5" />}
          name="Google Meet"
          description="Videollamadas con Google Meet"
          enabled={integrations?.google_meet_enabled ?? false}
          connected={isProviderConnected('google')}
        />
        
        <IntegrationStatus
          icon={<Icon name="credit_card" className="h-5 w-5" />}
          name="Stripe"
          description="Cobros online"
          enabled={integrations?.stripe_enabled ?? false}
          connected={isProviderConnected('stripe')}
        />
        
        <IntegrationStatus
          icon={<Icon name="psychology" className="h-5 w-5" />}
          name="Inteligencia Artificial"
          description="Análisis de transcripciones y generación de informes"
          enabled={!!(center?.openai_api_key_encrypted || center?.gemini_api_key_encrypted)}
          connected={!!(center?.openai_api_key_encrypted || center?.gemini_api_key_encrypted)}
        />

        <IntegrationStatus
          icon={<Icon name="mic" className="h-5 w-5" />}
          name="Plaud"
          description="Ingesta de grabaciones y transcripciones"
          enabled={!!plaudStatus?.enabled}
          connected={!!plaudStatus?.connected}
        />

        {bothVideoEnabled && (
          <div className="border rounded-lg p-4 space-y-2">
            <Label htmlFor="default-video-provider">Aplicación de videollamada por defecto</Label>
            <p className="text-sm text-muted-foreground">
              Se usará al crear sesiones online automáticamente
            </p>
            <Select
              value={integrations?.default_video_provider ?? 'zoom'}
              onValueChange={handleDefaultProviderChange}
            >
              <SelectTrigger id="default-video-provider" className="w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zoom">Zoom</SelectItem>
                <SelectItem value="google_meet">Google Meet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
