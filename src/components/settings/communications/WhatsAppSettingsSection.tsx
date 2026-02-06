import { useState, useEffect } from 'react';
import { Loader2, Save, Globe, Zap, ExternalLink, Eye, EyeOff, CheckCircle, Send, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { WhatsAppSendMethod } from '@/lib/whatsapp';
import { WhatsAppLinkDialog } from '@/components/agenda/WhatsAppLinkDialog';

export function WhatsAppSettingsSection() {
  const { center, updateCenter, isLoading } = useCenter();
  const { isAdmin } = useAuth();
  
  const [sendMethod, setSendMethod] = useState<WhatsAppSendMethod>('web');
  const [accessToken, setAccessToken] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (center) {
      setSendMethod((center.whatsapp_send_method as WhatsAppSendMethod) || 'web');
      // Don't populate token from center - it should be encrypted and not readable
      // Show placeholder if token exists
      setPhoneNumberId(center.whatsapp_phone_number_id || '');
      setBusinessAccountId(center.whatsapp_business_account_id || '');
    }
  }, [center]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // For 'web' method, just update the send method directly
      if (sendMethod === 'web') {
        await updateCenter.mutateAsync({
          whatsapp_send_method: sendMethod,
          // Clear API credentials when switching to web mode
          whatsapp_phone_number_id: null,
          whatsapp_business_account_id: null,
        });
        toast.success('Configuración de WhatsApp guardada');
        return;
      }

      // For 'api' method, use the secure edge function to encrypt credentials
      const { error } = await supabase.functions.invoke('save-oauth-credentials', {
        body: {
          provider: 'whatsapp',
          credentials: {
            accessToken: accessToken || undefined, // Only send if provided
            phoneNumberId,
            businessAccountId,
            sendMethod,
          },
        },
      });

      if (error) {
        console.error('Error saving WhatsApp credentials:', error);
        toast.error('Error al guardar las credenciales de WhatsApp');
        return;
      }

      // Clear the token field after successful save
      setAccessToken('');
      toast.success('Credenciales de WhatsApp guardadas de forma segura');
    } catch (error) {
      console.error('Error saving WhatsApp settings:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isApiConfigured = sendMethod === 'api' && accessToken && phoneNumberId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración de WhatsApp</CardTitle>
        <CardDescription>
          Elige cómo quieres enviar los mensajes de WhatsApp a tus contactos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup
          value={sendMethod}
          onValueChange={(value) => setSendMethod(value as WhatsAppSendMethod)}
          className="grid gap-4 md:grid-cols-2"
          disabled={!isAdmin}
        >
          {/* WhatsApp Web Option */}
          <div className="relative">
            <RadioGroupItem
              value="web"
              id="web"
              className="peer sr-only"
            />
            <Label
              htmlFor="web"
              className="flex flex-col gap-3 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2 dark:bg-green-900/30">
                  <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-medium">WhatsApp Web</p>
                  <p className="text-sm text-muted-foreground">Envío manual</p>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>✓ Sin coste adicional</li>
                <li>✓ Sin configuración</li>
                <li>• Requiere acción manual</li>
                <li>• Abre WhatsApp para enviar</li>
              </ul>
            </Label>
          </div>

          {/* Meta API Option */}
          <div className="relative">
            <RadioGroupItem
              value="api"
              id="api"
              className="peer sr-only"
            />
            <Label
              htmlFor="api"
              className="flex flex-col gap-3 rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="font-medium">API de Meta</p>
                  <p className="text-sm text-muted-foreground">Envío automático</p>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>✓ 100% automático</li>
                <li>✓ Sin intervención manual</li>
                <li>• Requiere cuenta Business</li>
                <li>• Coste por mensaje</li>
              </ul>
            </Label>
          </div>
        </RadioGroup>

        {/* API Configuration */}
        {sendMethod === 'api' && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Credenciales de la API de Meta</h4>
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                ¿Cómo obtener credenciales?
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <Alert>
              <AlertDescription>
                Necesitas una cuenta de Meta Business verificada para usar la API de WhatsApp.
                El proceso de verificación puede tardar varios días.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token *</Label>
                <div className="relative">
                  <Input
                    id="accessToken"
                    type={showToken ? 'text' : 'password'}
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="EAAxxxxxxx..."
                    disabled={!isAdmin}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Token de acceso permanente de la API de WhatsApp
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumberId">Phone Number ID *</Label>
                <Input
                  id="phoneNumberId"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="123456789012345"
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  ID del número de teléfono de WhatsApp Business
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAccountId">Business Account ID (opcional)</Label>
                <Input
                  id="businessAccountId"
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="123456789012345"
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  ID de tu cuenta de WhatsApp Business
                </p>
              </div>
            </div>

            {isApiConfigured && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="h-4 w-4" />
                API configurada correctamente
              </div>
            )}
          </div>
        )}

        {/* Current Status */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="mb-2 font-medium">Estado actual</h4>
          <div className="flex items-center gap-2">
            {sendMethod === 'web' ? (
              <>
                <Globe className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Usando <strong>WhatsApp Web</strong> - Los mensajes se abrirán en WhatsApp para enviar manualmente
                </span>
              </>
            ) : isApiConfigured ? (
              <>
                <Zap className="h-4 w-4 text-blue-600" />
                <span className="text-sm">
                  Usando <strong>API de Meta</strong> - Los mensajes se enviarán automáticamente
                </span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-600">
                  API de Meta seleccionada pero <strong>faltan credenciales</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {isAdmin && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar configuración
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
