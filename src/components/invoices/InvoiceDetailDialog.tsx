import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FileText, 
  ShieldCheck, 
  ExternalLink, 
  Copy, 
  User, 
  Calendar, 
  Receipt,
  RefreshCw,
  AlertTriangle,
  Wrench,
  HardDrive
} from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useInvoice, useInvoiceItems, type InvoiceWithPatient } from '@/hooks/useInvoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { hasInvoiceAeatRegistration, isInvoiceFiscalLocked } from '@/lib/invoice-immutability';
import { useAuth } from '@/hooks/useAuth';
import { FixInvoiceTypeDialog } from '@/components/invoices/FixInvoiceTypeDialog';

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
  const { data: invoice, isLoading: invoiceLoading, refetch: refetchInvoice } = useInvoice(invoiceId || undefined);
  const { data: items, isLoading: itemsLoading } = useInvoiceItems(invoiceId || undefined);
  const [retrying, setRetrying] = useState(false);
  const [fixTypeOpen, setFixTypeOpen] = useState(false);
  const { isAdmin } = useAuth();

  const isLoading = invoiceLoading || itemsLoading;
  const isFiscalLocked = isInvoiceFiscalLocked(invoice);
  const hasAeatRegistration = hasInvoiceAeatRegistration(invoice);
  const isPendingVerifactu = !!invoice?.verifactu_pending && !hasAeatRegistration;
  const isPermanentError = !!invoice?.verifactu_error_permanent && !hasAeatRegistration;
  const permanentErrorMessage = invoice?.verifactu_error_message;
  const canFixInvoiceType = !!invoice
    && isAdmin
    && (invoice.status === 'issued' || invoice.status === 'paid')
    && invoice.is_valid
    && !invoice.rectified_invoice_id
    && isFiscalLocked
    && !isPendingVerifactu;

  const handleRetryVerifactu = async () => {
    if (!invoiceId) return;
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('sign-invoice-verifactu', {
        body: { invoice_id: invoiceId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.success) {
        toast.success('Factura registrada en AEAT correctamente');
        refetchInvoice();
      } else if (data?.pending) {
        toast.info('AEAT no disponible temporalmente. Se reintentará más tarde.');
      } else {
        toast.error('Error inesperado al registrar en AEAT');
      }
    } catch (err: unknown) {
      console.error('Retry verifactu error:', err);
      toast.error(err instanceof Error ? err.message : 'Error al registrar en AEAT');
    } finally {
      setRetrying(false);
    }
  };

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
    <>
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
                {hasAeatRegistration && (
                  <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                    <ShieldCheck className="h-3 w-3" />
                    AEAT
                  </Badge>
                )}
                {isFiscalLocked && !hasAeatRegistration && (
                  <Badge variant="outline" className="gap-1 border-green-600 text-green-700">
                    <ShieldCheck className="h-3 w-3" />
                    Cierre fiscal
                  </Badge>
                )}
              </div>
              {invoice.drive_url && (
                <a
                  href={invoice.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  Ver en Google Drive
                </a>
              )}
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
            {isFiscalLocked && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    Cierre fiscal
                  </h3>
                  <div className="rounded-lg border border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20 p-4">
                    <div className="flex gap-4">
                      {/* QR Code */}
                      {invoice.verifactu_qr && (
                        <div className="flex-shrink-0">
                          <div className="w-24 h-24 rounded border bg-white p-1 flex items-center justify-center">
                            <QRCodeSVG
                              value={invoice.verifactu_qr}
                              size={88}
                              level="M"
                              includeMargin={false}
                              bgColor="hsl(0 0% 100%)"
                              fgColor="hsl(0 0% 0%)"
                              title="QR Verifactu"
                            />
                          </div>
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
                        {!invoice.verifactu_registration_id && (
                          <div>
                            <span className="text-muted-foreground">Estado: </span>
                            <span className="font-medium">Pendiente de CSV AEAT</span>
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
                        {invoice.invoice_hash && invoice.invoice_hash !== invoice.verifactu_hash && (
                          <div>
                            <span className="text-muted-foreground">Huella factura: </span>
                            <span className="font-mono text-xs break-all">
                              {invoice.invoice_hash.substring(0, 32)}...
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

            {/* Verifactu Pending - Retry */}
            {isPendingVerifactu && !isPermanentError && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Registro AEAT pendiente
                  </h3>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Esta factura no se ha podido registrar en AEAT.
                      {invoice.verifactu_retry_count ? ` Intentos: ${invoice.verifactu_retry_count}` : ''}
                    </p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleRetryVerifactu}
                      disabled={retrying}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Registrando...' : 'Reintentar registro AEAT'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Verifactu Permanent Error */}
            {isPermanentError && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Error permanente AEAT
                  </h3>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm font-medium text-destructive">
                      {permanentErrorMessage || 'AEAT ha rechazado esta factura por un error en los datos.'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Este error no se resolverá con reintentos. Corrija los datos del paciente (NIF, nombre, etc.) y pulse reintentar.
                    </p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={handleRetryVerifactu}
                      disabled={retrying}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Registrando...' : 'Reintentar tras corrección'}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {canFixInvoiceType && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Acciones fiscales
                  </h3>
                  <div className="rounded-lg border p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <div>
                      <p className="text-sm font-medium">¿Se emitió con un tipo incorrecto?</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Emite una rectificativa sustitutiva o una factura completa F3 sin duplicar cobros.
                      </p>
                    </div>
                    <Button className="mt-3 min-h-11 sm:mt-0" variant="outline" onClick={() => setFixTypeOpen(true)}>
                      <Wrench className="mr-2 h-4 w-4" />
                      Corregir tipo de factura
                    </Button>
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
    {invoice && (
      <FixInvoiceTypeDialog
        open={fixTypeOpen}
        onOpenChange={setFixTypeOpen}
        invoice={invoice}
        onCompleted={() => refetchInvoice()}
      />
    )}
    </>
  );
}
