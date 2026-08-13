import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CreditCard, Smartphone, Package, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { usePublicDebt, usePublicBonoTemplates } from '@/hooks/usePublicDebt';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PayDebt() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const showBonoOption = searchParams.get('bono') === '1';
  
  const { data: debt, isLoading, error } = usePublicDebt(token);
  const { data: bonoTemplates = [] } = usePublicBonoTemplates(token);
  
  const [selectedBono, setSelectedBono] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState<'session' | 'bono' | null>(null);
  const [showBizum, setShowBizum] = useState(false);

  // Preselect first bono when coming from bono link
  useEffect(() => {
    if (showBonoOption && bonoTemplates.length > 0 && !selectedBono) {
      setSelectedBono(bonoTemplates[0].id);
    }
  }, [showBonoOption, bonoTemplates, selectedBono]);

  const pendingAmount = debt ? Number(debt.amount) - Number(debt.paid_amount || 0) : 0;
  const hasStripe = !!debt?.center.has_stripe;
  const hasBizum = !!debt?.center.bizum_phone;

  const handlePaySession = async () => {
    if (!debt) return;
    
    setProcessingPayment('session');
    try {
      const { data, error } = await supabase.functions.invoke('create-debt-payment-checkout', {
        body: {
          debt_id: debt.id,
          success_url: `${window.location.origin}/pago-exitoso?debt_id=${debt.id}`,
          cancel_url: window.location.href,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error creating checkout:', err);
      setProcessingPayment(null);
    }
  };

  const handlePayBono = async (templateId: string) => {
    if (!debt) return;
    
    setProcessingPayment('bono');
    setSelectedBono(templateId);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-bono-checkout', {
        body: {
          patient_id: debt.patient?.first_name ? undefined : undefined, // Will be fetched from debt
          debt_id: debt.id,
          bono_template_id: templateId,
          success_url: `${window.location.origin}/pago-exitoso?bono=1&debt_id=${debt.id}`,
          cancel_url: window.location.href,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Error creating bono checkout:', err);
      setProcessingPayment(null);
      setSelectedBono(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !debt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Enlace no válido</h2>
            <p className="text-muted-foreground">
              Este enlace de pago no existe o ha expirado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (debt.status === 'paid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Pago completado</h2>
            <p className="text-muted-foreground">
              Esta deuda ya ha sido saldada. ¡Gracias!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">{debt.center.name}</CardTitle>
            <CardDescription>
              Hola {debt.patient.first_name}, tienes un pago pendiente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Importe pendiente</span>
                <span className="text-2xl font-bold">{pendingAmount.toFixed(2)}€</span>
              </div>
              {debt.session && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Sesión</span>
                  <span>
                    {debt.session.session_type || 'Terapia'} - {format(new Date(debt.session.session_date), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
                </div>
              )}
              {debt.status === 'partial' && (
                <Badge variant="outline" className="w-fit">
                  Pago parcial realizado
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Options */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Opciones de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Pay session with card */}
            {hasStripe && (
              <Button
                onClick={handlePaySession}
                disabled={processingPayment !== null}
                className="w-full justify-start h-auto py-4"
                size="lg"
              >
                {processingPayment === 'session' ? (
                  <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                ) : (
                  <CreditCard className="h-5 w-5 mr-3" />
                )}
                <div className="text-left">
                  <div className="font-semibold">Pagar {pendingAmount.toFixed(2)}€ con tarjeta</div>
                  <div className="text-sm opacity-70">Pago seguro con Stripe</div>
                </div>
              </Button>
            )}

            {/* Bizum */}
            {hasBizum && (
              <Button
                onClick={() => setShowBizum(!showBizum)}
                variant="outline"
                className="w-full justify-start h-auto py-4"
                size="lg"
              >
                <Smartphone className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <div className="font-semibold">Pagar con Bizum</div>
                  <div className="text-sm opacity-70">Transferencia instantánea</div>
                </div>
              </Button>
            )}

            {showBizum && hasBizum && (
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-semibold mb-1">Envía {pendingAmount.toFixed(2)}€ por Bizum a:</p>
                  <p className="text-2xl font-mono font-bold">{debt.center.bizum_phone}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Indica tu nombre en el concepto. Te confirmaremos la recepción del pago.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Bono Options */}
        {(showBonoOption || bonoTemplates.length > 0) && hasStripe && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                Bonos de sesiones
              </CardTitle>
              <CardDescription>
                Ahorra comprando un bono. La sesión pendiente se incluirá automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bonoTemplates.map((template) => {
                const savings = (template.price_per_session * template.total_sessions) - template.total_price;
                const isProcessing = selectedBono === template.id && processingPayment === 'bono';
                const isPreselected = showBonoOption && selectedBono === template.id && processingPayment !== 'bono';
                
                return (
                  <Button
                    key={template.id}
                    onClick={() => handlePayBono(template.id)}
                    disabled={processingPayment !== null}
                    variant={isPreselected ? "default" : "outline"}
                    className={`w-full justify-between h-auto py-4 ${isPreselected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                    size="lg"
                  >
                    <div className="flex items-center">
                      {isProcessing ? (
                        <Loader2 className="h-5 w-5 mr-3 animate-spin" />
                      ) : (
                        <Package className="h-5 w-5 mr-3" />
                      )}
                      <div className="text-left">
                        <div className="font-semibold">{template.name}</div>
                        <div className="text-sm opacity-70">
                          {template.total_sessions} sesiones a {template.price_per_session.toFixed(0)}€/sesión
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{template.total_price.toFixed(0)}€</div>
                      {savings > 0 && (
                        <Badge variant={isPreselected ? "outline" : "secondary"} className="text-xs">
                          Ahorras {savings.toFixed(0)}€
                        </Badge>
                      )}
                    </div>
                  </Button>
                );
              })}

              {bonoTemplates.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay bonos disponibles en este momento
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Pago seguro gestionado por{' '}
          <a 
            href="https://stripe.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            Stripe
          </a>
        </p>
      </div>
    </div>
  );
}
