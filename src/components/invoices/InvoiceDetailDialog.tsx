import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FileText, 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  User, 
  Calendar, 
  Receipt 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoice, useInvoiceItems, type InvoiceWithPatient } from '@/hooks/useInvoices';
import { toast } from 'sonner';

interface InvoiceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
}

const statusConfig = {
  draft: { label: 'Borrador', variant: 'secondary' as const },
  issued: { label: 'Emitida', variant: 'default' as const },
  paid: { label: 'Pagada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'destructive' as const },
};

export function InvoiceDetailDialog({ open, onOpenChange, invoiceId }: InvoiceDetailDialogProps) {
  const { data: invoice, isLoading: invoiceLoading } = useInvoice(invoiceId || undefined);
  const { data: items, isLoading: itemsLoading } = useInvoiceItems(invoiceId || undefined);

  const isLoading = invoiceLoading || itemsLoading;
  const isSealed = !!invoice?.verifactu_hash;

  const handleCopyQR = () => {
    if (invoice?.verifactu_qr) {
      navigator.clipboard.writeText(invoice.verifactu_qr);
      toast.success('URL del QR copiada');
    }
  };

  const handleOpenVerification = () => {
    if (invoice?.verifactu_qr) {
      window.open(invoice.verifactu_qr, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isLoading ? <Skeleton className="h-6 w-48" /> : `Factura ${invoice?.invoice_number}`}
          </DialogTitle>
          <DialogDescription>
            Detalles completos de la factura
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : invoice ? (
          <div className="space-y-6">
            {/* General Info */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Datos Generales
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Paciente</p>
                    <p className="font-medium">
                      {invoice.patients.first_name} {invoice.patients.last_name}
                    </p>
                    {invoice.patients.tax_id && (
                      <p className="text-xs text-muted-foreground">{invoice.patients.tax_id}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha emisión</p>
                    <p className="font-medium">
                      {format(new Date(invoice.issue_date), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusConfig[invoice.status]?.variant || 'secondary'}>
                  {statusConfig[invoice.status]?.label || invoice.status}
                </Badge>
                {invoice.is_recapitulative && (
                  <Badge variant="outline">Recapitulativa</Badge>
                )}
                {isSealed && (
                  <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                    <ShieldCheck className="h-3 w-3" />
                    Verifactu
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Line Items */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Conceptos
              </h3>
              <div className="space-y-2">
                {items?.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex justify-between items-start">
                      <p className="font-medium">{item.description}</p>
                      <p className="font-semibold">{Number(item.total).toFixed(2)}€</p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{item.quantity} x {Number(item.unit_price).toFixed(2)}€</span>
                      {item.tax_rate > 0 && (
                        <span>{item.tax_name} {item.tax_rate}%: {Number(item.tax_amount).toFixed(2)}€</span>
                      )}
                      {item.retention_rate > 0 && (
                        <span className="text-destructive">
                          -{item.retention_name} {item.retention_rate}%: {Number(item.retention_amount).toFixed(2)}€
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Totales
              </h3>
              <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Base imponible</span>
                  <span>{Number(invoice.subtotal).toFixed(2)}€</span>
                </div>
                {invoice.tax_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span>IVA ({invoice.tax_rate}%)</span>
                    <span>{Number(invoice.tax_amount).toFixed(2)}€</span>
                  </div>
                )}
                {invoice.retention_amount && invoice.retention_amount > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>Retención ({invoice.retention_rate}%)</span>
                    <span>-{Number(invoice.retention_amount).toFixed(2)}€</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>{Number(invoice.total).toFixed(2)}€</span>
                </div>
              </div>
            </div>

            {/* Verifactu Section */}
            {isSealed && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    Verifactu
                  </h3>
                  <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20 p-4">
                    <div className="flex gap-4">
                      {/* QR Code */}
                      {invoice.verifactu_qr && (
                        <div className="flex-shrink-0">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(invoice.verifactu_qr)}`}
                            alt="QR Verifactu"
                            className="w-24 h-24 rounded border bg-white p-1"
                          />
                        </div>
                      )}
                      
                      {/* Details */}
                      <div className="flex-1 space-y-2 text-sm">
                        {invoice.verifactu_registration_id && (
                          <div>
                            <span className="text-muted-foreground">CSV: </span>
                            <span className="font-mono font-medium">{invoice.verifactu_registration_id}</span>
                          </div>
                        )}
                        {invoice.verifactu_timestamp && (
                          <div>
                            <span className="text-muted-foreground">Registrado: </span>
                            <span>{format(new Date(invoice.verifactu_timestamp), "dd/MM/yyyy HH:mm:ss")}</span>
                          </div>
                        )}
                        {invoice.verifactu_hash && (
                          <div>
                            <span className="text-muted-foreground">Hash: </span>
                            <span className="font-mono text-xs break-all">
                              {invoice.verifactu_hash.substring(0, 32)}...
                            </span>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          {invoice.verifactu_qr && (
                            <>
                              <Button size="sm" variant="outline" onClick={handleOpenVerification}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Verificar en AEAT
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCopyQR}>
                                <Copy className="h-3 w-3 mr-1" />
                                Copiar URL
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Notes */}
            {invoice.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Notas
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            No se encontró la factura
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
