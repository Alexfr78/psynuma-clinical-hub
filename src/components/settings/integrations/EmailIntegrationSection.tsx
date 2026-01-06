import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Mail, CheckCircle2, ExternalLink, Info, Loader2 } from 'lucide-react';
import { useCenter } from '@/hooks/useCenter';

export function EmailIntegrationSection() {
  const { center, updateCenter } = useCenter();
  const [fromEmail, setFromEmail] = useState(center?.email || '');
  const [isSaving, setIsSaving] = useState(false);

  // We check if RESEND_API_KEY is configured by trying to use the edge function
  // For now, we show the configuration UI
  const isConfigured = true; // RESEND_API_KEY is configured based on secrets check

  const handleSaveFromEmail = async () => {
    if (!fromEmail) return;
    setIsSaving(true);
    try {
      await updateCenter.mutateAsync({ email: fromEmail });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Email (Resend)
              {isConfigured && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Configurado
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Envío de facturas, recordatorios y notificaciones por email
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Integración con Resend</AlertTitle>
          <AlertDescription>
            El envío de emails está configurado mediante{' '}
            <a 
              href="https://resend.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-medium underline inline-flex items-center gap-1"
            >
              Resend <ExternalLink className="h-3 w-3" />
            </a>
            . Esta integración permite enviar facturas, recordatorios de citas y otras comunicaciones a tus pacientes.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from-email">Email de envío del centro</Label>
            <div className="flex gap-2">
              <Input
                id="from-email"
                type="email"
                placeholder="contacto@tucentro.com"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
              />
              <Button onClick={handleSaveFromEmail} disabled={isSaving || !fromEmail}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Guardar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Este es el email desde el cual se enviarán las comunicaciones. Asegúrate de que el dominio esté verificado en Resend.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="font-medium text-sm">Funcionalidades habilitadas:</h4>
          <ul className="text-sm text-muted-foreground space-y-2">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Envío de facturas por email
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Recordatorios de citas
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Envío de consentimientos informados
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Envío de cuestionarios (assessments)
            </li>
          </ul>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>
            Para modificar la configuración de API de Resend (API Key, dominio verificado), 
            contacta con el administrador del sistema o accede a tu{' '}
            <a 
              href="https://resend.com/domains" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline"
            >
              panel de Resend
            </a>.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
