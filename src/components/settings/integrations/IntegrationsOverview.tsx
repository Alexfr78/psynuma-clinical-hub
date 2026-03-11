import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { useCenter } from "@/hooks/useCenter";
import { MessageSquare, Video, Calendar, CreditCard, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
            <CheckCircle2 className="h-3 w-3" />
            Activo
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3" />
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
          icon={<Mail className="h-5 w-5" />}
          name="Email (Resend)"
          description="Envío de facturas, recordatorios y notificaciones"
          enabled={true}
          connected={true}
        />
        
        <IntegrationStatus
          icon={<MessageSquare className="h-5 w-5" />}
          name="WhatsApp Business"
          description="Envío de notificaciones y recordatorios"
          enabled={integrations?.whatsapp_enabled ?? false}
        />
        
        <IntegrationStatus
          icon={<MessageSquare className="h-5 w-5" />}
          name="WasenderAPI"
          description="Automatización WhatsApp con tu número"
          enabled={center?.wasender_enabled ?? false}
        />
        
        <IntegrationStatus
          icon={<Video className="h-5 w-5" />}
          name="Zoom"
          description="Videollamadas automáticas"
          enabled={integrations?.zoom_enabled ?? false}
          connected={isProviderConnected('zoom')}
        />
        
        <IntegrationStatus
          icon={<Calendar className="h-5 w-5" />}
          name="Google Calendar"
          description="Sincronización de citas"
          enabled={integrations?.google_calendar_enabled ?? false}
          connected={isProviderConnected('google')}
        />
        
        <IntegrationStatus
          icon={<Video className="h-5 w-5" />}
          name="Google Meet"
          description="Videollamadas con Google Meet"
          enabled={integrations?.google_meet_enabled ?? false}
          connected={isProviderConnected('google')}
        />
        
        <IntegrationStatus
          icon={<CreditCard className="h-5 w-5" />}
          name="Stripe"
          description="Cobros online"
          enabled={integrations?.stripe_enabled ?? false}
          connected={isProviderConnected('stripe')}
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
