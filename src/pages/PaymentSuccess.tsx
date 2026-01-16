import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Download, Home, Package } from 'lucide-react';

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const isBono = searchParams.get('bono') === '1';
  const debtId = searchParams.get('debt_id');
  const invoiceToken = searchParams.get('invoice_token');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="pb-4">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <CardTitle className="text-2xl">¡Pago completado!</CardTitle>
          <CardDescription>
            {isBono 
              ? 'Tu bono ha sido activado correctamente'
              : 'Hemos recibido tu pago correctamente'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isBono && (
            <div className="bg-muted rounded-lg p-4">
              <Package className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-medium">Bono activado</p>
              <p className="text-sm text-muted-foreground">
                La sesión pendiente ya ha sido incluida en tu bono
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Recibirás un email con la factura correspondiente.
            </p>
            
            {invoiceToken && (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/factura/${invoiceToken}`}>
                  <Download className="h-4 w-4 mr-2" />
                  Ver y descargar factura
                </Link>
              </Button>
            )}
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-4">
              Ya puedes cerrar esta página
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
