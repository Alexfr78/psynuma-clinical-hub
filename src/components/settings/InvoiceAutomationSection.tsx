
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useCenter } from '@/hooks/useCenter';
import { useAuth } from '@/hooks/useAuth';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';

type InvoiceOnPaymentMode = 'ask' | 'auto' | 'disabled';
type InvoiceSendChannel = 'email' | 'whatsapp' | 'both';

export function InvoiceAutomationSection() {
  const { center, updateCenter } = useCenter();
  const { isAdmin } = useAuth();

  const invoiceMode = (center?.invoice_on_payment_mode as InvoiceOnPaymentMode) || 'disabled';
  const sendChannel = (center?.invoice_send_channel as InvoiceSendChannel) || 'email';
  const autoInvoicingEnabled = center?.auto_invoicing_enabled || false;
  const verifactuAutoEnabled = center?.verifactu_auto_enabled || false;
  const hasCertificate = !!center?.verifactu_certificate_base64;
  const verifactuEnvironment = center?.verifactu_environment || 'test';

  const handleModeChange = (mode: InvoiceOnPaymentMode) => {
    updateCenter.mutate({ invoice_on_payment_mode: mode });
  };

  const handleChannelChange = (channel: InvoiceSendChannel) => {
    updateCenter.mutate({ invoice_send_channel: channel });
  };

  const handleAutoInvoicingToggle = (enabled: boolean) => {
    updateCenter.mutate({ auto_invoicing_enabled: enabled });
  };

  const handleVerifactuAutoToggle = (enabled: boolean) => {
    if (enabled && !hasCertificate) {
      return; // Don't enable if no certificate
    }
    updateCenter.mutate({ verifactu_auto_enabled: enabled });
  };

  return (
    <div className="space-y-6">
      {/* Invoice on Payment Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="bolt" className="h-5 w-5 text-primary" />
            Facturación al cobrar sesión
          </CardTitle>
          <CardDescription>
            Configura cómo se generan y envían las facturas al registrar un pago
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode Selection */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Comportamiento al cobrar</Label>
            {isAdmin ? (
              <RadioGroup
                value={invoiceMode}
                onValueChange={(value) => handleModeChange(value as InvoiceOnPaymentMode)}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="ask" id="mode-ask" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-ask" className="font-medium cursor-pointer">
                      Preguntar antes de generar
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Al cobrar, te preguntará si deseas generar la factura o solo registrar el pago.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="auto" id="mode-auto" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-auto" className="font-medium cursor-pointer">
                      Generar y enviar automáticamente
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Al cobrar, se genera la factura simplificada automáticamente y se envía al contacto.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="disabled" id="mode-disabled" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-disabled" className="font-medium cursor-pointer">
                      Solo registrar el pago
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Al cobrar, solo se registra el pago sin generar factura automáticamente.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                Modo actual: {
                  invoiceMode === 'ask' ? 'Preguntar antes de generar' :
                  invoiceMode === 'auto' ? 'Generar automáticamente' :
                  'Solo registrar pago'
                }
              </p>
            )}
          </div>

          {/* Send Channel Selection - Only show if not disabled */}
          {invoiceMode !== 'disabled' && (
            <>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base font-medium">Canal de envío</Label>
                {isAdmin ? (
                  <RadioGroup
                    value={sendChannel}
                    onValueChange={(value) => handleChannelChange(value as InvoiceSendChannel)}
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                  >
                    <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="email" id="channel-email" />
                      <Label htmlFor="channel-email" className="flex items-center gap-2 cursor-pointer">
                        <Icon name="mail" className="h-4 w-4" />
                        Email
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="whatsapp" id="channel-whatsapp" />
                      <Label htmlFor="channel-whatsapp" className="flex items-center gap-2 cursor-pointer">
                        <Icon name="forum" className="h-4 w-4" />
                        WhatsApp
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="both" id="channel-both" />
                      <Label htmlFor="channel-both" className="flex items-center gap-2 cursor-pointer">
                        <Icon name="mail" className="h-4 w-4" />
                        <Icon name="forum" className="h-4 w-4" />
                        Ambos
                      </Label>
                    </div>
                  </RadioGroup>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Canal: {
                      sendChannel === 'email' ? 'Email' :
                      sendChannel === 'whatsapp' ? 'WhatsApp' :
                      'Email y WhatsApp'
                    }
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Verifactu Auto Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="verified_user" className="h-5 w-5 text-primary" />
            Verifactu automático
            {verifactuAutoEnabled && (
              <Badge variant={verifactuEnvironment === 'production' ? 'default' : 'secondary'} className="ml-2">
                {verifactuEnvironment === 'production' ? 'Producción' : 'Test'}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Registra automáticamente las facturas en la Agencia Tributaria (AEAT)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasCertificate && (
            <Alert variant="destructive">
              <Icon name="warning" className="h-4 w-4" />
              <AlertDescription>
                No hay certificado digital configurado. Configúralo en Verifactu antes de activar esta opción.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-2">
                <Icon name="verified_user" className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="verifactu-auto" className="text-base font-medium">
                  Registro automático en AEAT
                </Label>
                <p className="text-sm text-muted-foreground">
                  Las facturas se registran automáticamente en Verifactu al generarse.
                  El envío al cliente solo se realizará tras el registro exitoso.
                </p>
              </div>
            </div>
            {isAdmin ? (
              <Switch
                id="verifactu-auto"
                checked={verifactuAutoEnabled}
                onCheckedChange={handleVerifactuAutoToggle}
                disabled={updateCenter.isPending || !hasCertificate}
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {verifactuAutoEnabled ? 'Activado' : 'Desactivado'}
              </span>
            )}
          </div>

          {verifactuAutoEnabled && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <h4 className="font-medium text-sm">¿Cómo funciona?</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">1.</span>
                  Al generar una factura, se firma y registra automáticamente en la AEAT.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">2.</span>
                  La factura incluirá el código QR de verificación y el hash de Verifactu.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">3.</span>
                  <strong>El envío al cliente se retrasa</strong> hasta confirmar el registro en AEAT.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">4.</span>
                  Si el registro falla, la factura queda "Pendiente AEAT" para reintento manual.
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Auto-Invoicing Section */}
      <Card>
        <CardHeader>
          <CardTitle>Facturación mensual automática</CardTitle>
          <CardDescription>
            Genera facturas recapitulativas al final de cada mes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-primary/10 p-2">
                <Icon name="bolt" className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="auto-invoicing" className="text-base font-medium">
                  Facturación recapitulativa mensual
                </Label>
                <p className="text-sm text-muted-foreground">
                  Genera automáticamente una factura recapitulativa al final de cada mes 
                  con todas las sesiones completadas de cada contacto.
                </p>
              </div>
            </div>
            {isAdmin ? (
              <Switch
                id="auto-invoicing"
                checked={autoInvoicingEnabled}
                onCheckedChange={handleAutoInvoicingToggle}
                disabled={updateCenter.isPending}
              />
            ) : (
              <span className="text-sm text-muted-foreground">
                {autoInvoicingEnabled ? 'Activado' : 'Desactivado'}
              </span>
            )}
          </div>

          {autoInvoicingEnabled && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <h4 className="font-medium text-sm">¿Cómo funciona?</h4>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">1.</span>
                  Al finalizar cada mes, el sistema recopila todas las sesiones completadas que no han sido facturadas.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">2.</span>
                  Se agrupa por contacto y se genera una factura recapitulativa para cada uno.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">3.</span>
                  Las facturas se crean en estado "borrador" para que puedas revisarlas antes de enviarlas.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-medium">4.</span>
                  Se usa la serie predeterminada configurada en "Series y numeración".
                </li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
