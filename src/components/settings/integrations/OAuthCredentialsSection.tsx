import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Key, Eye, EyeOff, Save, Check, Loader2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCenter } from "@/hooks/useCenter";

interface CredentialFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  isSecret?: boolean;
}

function CredentialField({ label, placeholder, value, onChange, isSecret = false }: CredentialFieldProps) {
  const [showValue, setShowValue] = useState(false);
  
  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={isSecret && !showValue ? "password" : "text"}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="pr-10"
          />
          {isSecret && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowValue(!showValue)}
            >
              {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ProviderCredentials {
  clientId: string;
  clientSecret: string;
}

export function OAuthCredentialsSection() {
  const { center } = useCenter();
  const [google, setGoogle] = useState<ProviderCredentials>({ clientId: "", clientSecret: "" });
  const [googleDrive, setGoogleDrive] = useState<ProviderCredentials>({ clientId: "", clientSecret: "" });
  const [zoom, setZoom] = useState<ProviderCredentials>({ clientId: "", clientSecret: "" });
  const [stripe, setStripe] = useState<{ publishableKey: string; secretKey: string }>({ publishableKey: "", secretKey: "" });
  const [savedProviders, setSavedProviders] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  // Load saved credentials status and Client IDs on mount
  useEffect(() => {
    if (center) {
      const configured: string[] = [];
      
      // Google: load Client ID and check if configured
      if (center.oauth_google_credentials) configured.push('google');
      if (center.oauth_google_client_id) {
        setGoogle(prev => ({ ...prev, clientId: center.oauth_google_client_id || "" }));
      }

      // Google Drive: separate OAuth client, load Client ID and check if configured
      if (center.oauth_google_drive_credentials) configured.push('google_drive');
      if (center.oauth_google_drive_client_id) {
        setGoogleDrive(prev => ({ ...prev, clientId: center.oauth_google_drive_client_id || "" }));
      }

      // Zoom: load Client ID and check if configured
      if (center.oauth_zoom_credentials) configured.push('zoom');
      if (center.oauth_zoom_client_id) {
        setZoom(prev => ({ ...prev, clientId: center.oauth_zoom_client_id || "" }));
      }
      
      // Stripe: load Publishable Key and check if configured
      if (center.oauth_stripe_credentials) configured.push('stripe');
      if (center.oauth_stripe_publishable_key) {
        setStripe(prev => ({ ...prev, publishableKey: center.oauth_stripe_publishable_key || "" }));
      }
      
      setSavedProviders(configured);
    }
  }, [center]);

  const saveCredentials = async (provider: string, credentials: Record<string, string>) => {
    setSaving(provider);
    try {
      const { data, error } = await supabase.functions.invoke('save-oauth-credentials', {
        body: { provider, credentials }
      });

      if (error) throw error;

      setSavedProviders(prev => [...prev.filter(p => p !== provider), provider]);
      toast.success(`Credenciales de ${provider} guardadas correctamente`);
      
      // Clear fields after saving
      if (provider === 'google') setGoogle({ clientId: "", clientSecret: "" });
      if (provider === 'google_drive') setGoogleDrive({ clientId: "", clientSecret: "" });
      if (provider === 'zoom') setZoom({ clientId: "", clientSecret: "" });
      if (provider === 'stripe') setStripe({ publishableKey: "", secretKey: "" });
      
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast.error('Error al guardar las credenciales');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveGoogle = () => {
    saveCredentials('google', { clientId: google.clientId, clientSecret: google.clientSecret });
  };

  const handleSaveGoogleDrive = () => {
    saveCredentials('google_drive', { clientId: googleDrive.clientId, clientSecret: googleDrive.clientSecret });
  };

  const handleSaveZoom = () => {
    saveCredentials('zoom', { clientId: zoom.clientId, clientSecret: zoom.clientSecret });
  };

  const handleSaveStripe = () => {
    saveCredentials('stripe', { publishableKey: stripe.publishableKey, secretKey: stripe.secretKey });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Key className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-lg">Credenciales OAuth</CardTitle>
            <CardDescription>
              Configura los Client ID y Secrets de las integraciones
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {/* Google Credentials */}
          <AccordionItem value="google">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-red-500/10">
                  <svg className="h-4 w-4 text-red-600" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <span className="font-medium">Google (Calendar, Meet)</span>
                {savedProviders.includes('google') && (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <CredentialField
                label="Client ID"
                placeholder="123456789-abcdef.apps.googleusercontent.com"
                value={google.clientId}
                onChange={(v) => setGoogle(prev => ({ ...prev, clientId: v }))}
              />
              <CredentialField
                label="Client Secret"
                placeholder="GOCSPX-..."
                value={google.clientSecret}
                onChange={(v) => setGoogle(prev => ({ ...prev, clientSecret: v }))}
                isSecret
              />
              <div className="pt-2">
                <Button 
                  size="sm" 
                  onClick={handleSaveGoogle}
                  disabled={!google.clientId || !google.clientSecret || saving === 'google'}
                  className="gap-2"
                >
                  {saving === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar credenciales Google
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtén estas credenciales en{" "}
                <a 
                  href="https://console.cloud.google.com/apis/credentials" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Cloud Console
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Google Drive Credentials */}
          <AccordionItem value="google_drive">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-yellow-500/10">
                  <svg className="h-4 w-4 text-yellow-600" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M7.71 3.5L1.15 15l3.43 6L11.14 9.5 7.71 3.5zM9.14 22h9.72l3.43-6H5.71l3.43 6zM22.85 15L16.29 3.5h-6.86L16 15h6.85z"/>
                  </svg>
                </div>
                <span className="font-medium">Google Drive (documentos)</span>
                {savedProviders.includes('google_drive') && (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Cliente OAuth independiente del de Calendar/Meet, con permiso limitado a los archivos que la propia app cree en Drive.
              </p>
              <CredentialField
                label="Client ID"
                placeholder="123456789-abcdef.apps.googleusercontent.com"
                value={googleDrive.clientId}
                onChange={(v) => setGoogleDrive(prev => ({ ...prev, clientId: v }))}
              />
              <CredentialField
                label="Client Secret"
                placeholder="GOCSPX-..."
                value={googleDrive.clientSecret}
                onChange={(v) => setGoogleDrive(prev => ({ ...prev, clientSecret: v }))}
                isSecret
              />
              <div className="pt-2">
                <Button
                  size="sm"
                  onClick={handleSaveGoogleDrive}
                  disabled={!googleDrive.clientId || !googleDrive.clientSecret || saving === 'google_drive'}
                  className="gap-2"
                >
                  {saving === 'google_drive' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar credenciales Google Drive
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtén estas credenciales en{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google Cloud Console
                </a>
                {" "}(scope <code className="text-[11px]">drive.file</code>)
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Zoom Credentials */}
          <AccordionItem value="zoom">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-blue-500/10">
                  <svg className="h-4 w-4 text-blue-600" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M4.585 6.188h9.037c.862 0 1.561.698 1.561 1.56v5.412c0 .862-.699 1.561-1.561 1.561H4.585c-.862 0-1.561-.699-1.561-1.561V7.748c0-.862.699-1.56 1.561-1.56zm11.937 2.124 4.454-3.167v12.71l-4.454-3.167v-6.376z"/>
                  </svg>
                </div>
                <span className="font-medium">Zoom</span>
                {savedProviders.includes('zoom') && (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <CredentialField
                label="Client ID"
                placeholder="aBcDeFgHiJkLmNoPqRsT"
                value={zoom.clientId}
                onChange={(v) => setZoom(prev => ({ ...prev, clientId: v }))}
              />
              <CredentialField
                label="Client Secret"
                placeholder="AbCdEfGhIjKlMnOpQrStUvWxYz123456"
                value={zoom.clientSecret}
                onChange={(v) => setZoom(prev => ({ ...prev, clientSecret: v }))}
                isSecret
              />
              <div className="pt-2">
                <Button 
                  size="sm" 
                  onClick={handleSaveZoom}
                  disabled={!zoom.clientId || !zoom.clientSecret || saving === 'zoom'}
                  className="gap-2"
                >
                  {saving === 'zoom' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar credenciales Zoom
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtén estas credenciales en{" "}
                <a 
                  href="https://marketplace.zoom.us/develop/create" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Zoom Marketplace
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>

          {/* Stripe Credentials */}
          <AccordionItem value="stripe">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded bg-purple-500/10">
                  <svg className="h-4 w-4 text-purple-600" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                  </svg>
                </div>
                <span className="font-medium">Stripe</span>
                {savedProviders.includes('stripe') && (
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Configurado
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <CredentialField
                label="Publishable Key"
                placeholder="pk_live_... o pk_test_..."
                value={stripe.publishableKey}
                onChange={(v) => setStripe(prev => ({ ...prev, publishableKey: v }))}
              />
              <CredentialField
                label="Secret Key"
                placeholder="sk_live_... o sk_test_..."
                value={stripe.secretKey}
                onChange={(v) => setStripe(prev => ({ ...prev, secretKey: v }))}
                isSecret
              />
              <div className="pt-2">
                <Button 
                  size="sm" 
                  onClick={handleSaveStripe}
                  disabled={(!stripe.publishableKey && !stripe.secretKey) || saving === 'stripe'}
                  className="gap-2"
                >
                  {saving === 'stripe' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar credenciales Stripe
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtén tu Secret Key en{" "}
                <a 
                  href="https://dashboard.stripe.com/apikeys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Stripe Dashboard
                </a>
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
