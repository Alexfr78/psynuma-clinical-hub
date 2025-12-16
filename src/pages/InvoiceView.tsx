import { useParams } from 'react-router-dom';
import { usePublicInvoice } from '@/hooks/usePublicInvoice';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Printer, Download, FileText, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export default function InvoiceView() {
  const { token } = useParams<{ token: string }>();
  const { data: invoice, isLoading, error } = usePublicInvoice(token);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 p-4 md:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="text-xl font-semibold">Factura no encontrada</h1>
            <p className="text-muted-foreground">
              El enlace de la factura no es válido o ha expirado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Borrador', variant: 'secondary' },
    issued: { label: 'Emitida', variant: 'default' },
    paid: { label: 'Pagada', variant: 'default' },
    cancelled: { label: 'Anulada', variant: 'destructive' },
  };

  const status = statusConfig[invoice.status || 'draft'] || statusConfig.draft;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header - Hidden on print */}
      <div className="print:hidden bg-background border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-primary" />
            <div>
              <h1 className="font-semibold">Factura {invoice.invoice_number}</h1>
              <p className="text-sm text-muted-foreground">
                {invoice.center.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Imprimir
            </Button>
            <Button size="sm" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-2" />
              Descargar PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Invoice Content */}
      <div className="max-w-4xl mx-auto p-4 md:p-8 print:p-0 print:max-w-none">
        <Card className="print:shadow-none print:border-0">
          <CardContent className="p-6 md:p-10 space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-6">
              <div className="space-y-2">
                {invoice.center.invoice_logo_url && (
                  <img 
                    src={invoice.center.invoice_logo_url} 
                    alt={invoice.center.name}
                    className="h-16 object-contain mb-4"
                  />
                )}
                <h2 className="text-xl font-bold">{invoice.center.name}</h2>
                {invoice.center.tax_id && (
                  <p className="text-sm text-muted-foreground">NIF: {invoice.center.tax_id}</p>
                )}
                <div className="text-sm text-muted-foreground">
                  {invoice.center.address && <p>{invoice.center.address}</p>}
                  {(invoice.center.postal_code || invoice.center.city) && (
                    <p>{[invoice.center.postal_code, invoice.center.city].filter(Boolean).join(' ')}</p>
                  )}
                  {invoice.center.province && <p>{invoice.center.province}</p>}
                </div>
                {invoice.center.phone && (
                  <p className="text-sm text-muted-foreground">Tel: {invoice.center.phone}</p>
                )}
                {invoice.center.email && (
                  <p className="text-sm text-muted-foreground">{invoice.center.email}</p>
                )}
              </div>

              <div className="text-right space-y-2">
                <div className="flex items-center justify-end gap-2">
                  <h1 className="text-2xl font-bold">FACTURA</h1>
                  <Badge variant={status.variant} className="print:hidden">
                    {status.label}
                  </Badge>
                </div>
                <p className="text-xl font-semibold text-primary">{invoice.invoice_number}</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">Fecha emisión:</span>{' '}
                    {format(new Date(invoice.issue_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                  {invoice.due_date && (
                    <p>
                      <span className="font-medium">Fecha vencimiento:</span>{' '}
                      {format(new Date(invoice.due_date), "d 'de' MMMM 'de' yyyy", { locale: es })}
                    </p>
                  )}
                </div>
                {!invoice.is_valid && (
                  <Badge variant="destructive">ANULADA</Badge>
                )}
                {invoice.is_recapitulative && (
                  <Badge variant="outline">Recapitulativa</Badge>
                )}
              </div>
            </div>

            {/* Client Info */}
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="font-semibold mb-2">Datos del cliente</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">
                  {invoice.patient.first_name} {invoice.patient.last_name}
                </p>
                {invoice.patient.tax_id && <p>NIF/CIF: {invoice.patient.tax_id}</p>}
                {invoice.patient.address && <p>{invoice.patient.address}</p>}
                {(invoice.patient.postal_code || invoice.patient.city) && (
                  <p>{[invoice.patient.postal_code, invoice.patient.city].filter(Boolean).join(' ')}</p>
                )}
                {invoice.patient.email && <p>{invoice.patient.email}</p>}
                {invoice.patient.phone && <p>Tel: {invoice.patient.phone}</p>}
              </div>
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Concepto</th>
                    <th className="text-right py-3 px-2 w-20">Cant.</th>
                    <th className="text-right py-3 px-2 w-24">Precio</th>
                    <th className="text-right py-3 px-2 w-20">IVA</th>
                    <th className="text-right py-3 px-2 w-20">IRPF</th>
                    <th className="text-right py-3 px-2 w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-3 px-2">{item.description}</td>
                      <td className="text-right py-3 px-2">{item.quantity}</td>
                      <td className="text-right py-3 px-2">{formatCurrency(item.unit_price)}</td>
                      <td className="text-right py-3 px-2">
                        {item.tax_rate ? `${item.tax_rate}%` : '-'}
                      </td>
                      <td className="text-right py-3 px-2">
                        {item.retention_rate ? `-${item.retention_rate}%` : '-'}
                      </td>
                      <td className="text-right py-3 px-2 font-medium">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Base imponible:</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {invoice.tax_amount !== null && invoice.tax_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>IVA ({invoice.tax_rate}%):</span>
                    <span>{formatCurrency(invoice.tax_amount)}</span>
                  </div>
                )}
                {invoice.retention_amount !== null && invoice.retention_amount > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Retención IRPF ({invoice.retention_rate}%):</span>
                    <span>-{formatCurrency(invoice.retention_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Observaciones</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {invoice.notes}
                </p>
              </div>
            )}

            {/* Verifactu QR */}
            {invoice.verifactu_qr && (
              <div className="border-t pt-4 flex items-center gap-4">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(invoice.verifactu_qr)}`}
                  alt="Código QR Verifactu"
                  className="w-24 h-24"
                />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium">Factura registrada en Verifactu</p>
                  <p>Puede verificar la autenticidad de esta factura escaneando el código QR</p>
                </div>
              </div>
            )}

            {/* Footer */}
            {invoice.center.invoice_footer && (
              <div className="border-t pt-4 text-xs text-muted-foreground text-center whitespace-pre-wrap">
                {invoice.center.invoice_footer}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:border-0 {
            border: none !important;
          }
          .print\\:p-0 {
            padding: 0 !important;
          }
          .print\\:max-w-none {
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}
