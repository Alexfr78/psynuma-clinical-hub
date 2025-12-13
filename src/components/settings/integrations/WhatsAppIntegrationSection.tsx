import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useProfessionalIntegrations } from "@/hooks/useProfessionalIntegrations";
import { MessageSquare, Eye, EyeOff, ExternalLink, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export function WhatsAppIntegrationSection() {
  const { integrations, isLoading, updateIntegrations } = useProfessionalIntegrations();
  
  const [enabled, setEnabled] = useState(false);
  const [sendMethod, setSendMethod] = useState<'web' | 'api'>('web');
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (integrations) {
      setEnabled(integrations.whatsapp_enabled);
      setSendMethod(integrations.whatsapp_send_method);
      setAccessToken(integrations.whatsapp_access_token || '');
      setPhoneNumberId(integrations.whatsapp_phone_number_id || '');
      setBusinessAccountId(integrations.whatsapp_business_account_id || '');
    }
  }, [integrations]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateIntegrations.mutateAsync({
        whatsapp_enabled: enabled,
        whatsapp_send_method: sendMethod,
        whatsapp_access_token: sendMethod === 'api' ? accessToken : null,
        whatsapp_phone_number_id: sendMethod === 'api' ? phoneNumberId : null,
        whatsapp_business_account_id: sendMethod === 'api' ? businessAccountId : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  const isConfigured = sendMethod === 'web' || (accessToken && phoneNumberId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <MessageSquare className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-lg">WhatsApp Business</CardTitle>
              <CardDescription>
                Envío de notificaciones y recordatorios por WhatsApp
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>
      </CardHeader>
      
      {enabled && (
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Método de envío</Label>
            <RadioGroup value={sendMethod} onValueChange={(v) => setSendMethod(v as 'web' | 'api')}>
              <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="web" id="whatsapp-web" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="whatsapp-web" className="cursor-pointer font-medium">
                    WhatsApp Web
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Abre enlaces de WhatsApp Web para enviar manualmente
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
                <RadioGroupItem value="api" id="whatsapp-api" className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor="whatsapp-api" className="cursor-pointer font-medium">
                    Meta API (Automático)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Envío automático mediante la API de WhatsApp Business
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {sendMethod === 'api' && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Credenciales de Meta API</Label>
                <a 
                  href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Documentación
                </a>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="access-token">Access Token</Label>
                <div className="relative">
                  <Input
                    id="access-token"
                    type={showToken ? "text" : "password"}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxx..."
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone-number-id">Phone Number ID</Label>
                <Input
                  id="phone-number-id"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-account-id">Business Account ID</Label>
                <Input
                  id="business-account-id"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="123456789012345"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {isConfigured && enabled && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
                  <CheckCircle2 className="h-3 w-3" />
                  Configurado
                </Badge>
              )}
            </div>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar configuración"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
