import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
import { useInvoice, useInvoiceItems } from '@/hooks/useInvoices';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { hasInvoiceAeatRegistration, isInvoiceFiscalLocked } from '@/lib/invoice-immutability';
import { useAuth } from '@/hooks/useAuth';
import { FixInvoiceTypeDialog } from '@/components/invoices/FixInvoiceTypeDialog';
import { SendInvoiceDialog } from '@/components/invoices/SendInvoiceDialog';
import { downloadPdfFromUrl } from '@/lib/download-pdf';
import { Icon } from '@/components/ui/icon';

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
  const [sendOpen, setSendOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
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

  const handleGeneratePDF = async () => {
    if (!invoice) return;
    setGeneratingPdf(true);
    try {
      toast.info('Generando PDF...');
      const { data, error } = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { invoice_id: invoice.id },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('PDF sin contenido');
      const ok = await downloadPdfFromUrl(data.url, `Factura-${invoice.invoice_number || invoice.id}`);
      if (!ok) {
        toast.error('El navegador ha bloqueado la descarga. Desactiva el bloqueador e inténtalo de nuevo.');
        return;
      }
      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="description" className="h-5 w-5" />
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left column: invoice document */}
            <div className="space-y-6 lg:col-span-8">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={statusConfig[invoice.status]?.variant || 'secondary'}>
                  {statusConfig[invoice.status]?.label || invoice.status}
                </Badge>
                {invoice.is_recapitulative && (
                  <Badge variant="outline">Recapitulativa</Badge>
                )}
                {hasAeatRegistration && (
                  <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                    <Icon name="verified_user" className="h-3 w-3" />
                    AEAT
                  </Badge>
                )}
                {isFiscalLocked && !hasAeatRegistration && (
                  <Badge variant="outline" className="gap-1 border-green-600 text-green-700">
                    <Icon name="verified_user" className="h-3 w-3" />
                    Cierre fiscal
                  </Badge>
                )}
              </div>

              {/* Document card */}
              <div className="rounded-2xl border bg-card p-6 shadow-card">
                <div className="mb-6 flex items-start justify-between gap-4 border-b pb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon name="person" className="h-4 w-4 text-muted-foreground" />
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
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Fecha emisión</p>
                    <p className="font-medium">
                      {format(new Date(invoice.issue_date), "d 'de' MMMM yyyy", { locale: es })}
                    </p>
                  </div>
                </div>

                {invoice.drive_url && (
                  <a
                    href={invoice.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Icon name="hard_drive" className="h-3.5 w-3.5" />
                    Ver en Google Drive
                  </a>
                )}

                {/* Line Items */}
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

                <Separator className="my-6" />

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Base imponible</span>
                      <span>{Number(invoice.subtotal).toFixed(2)}€</span>
                    </div>
                    {invoice.tax_amount > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
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
                    <div className="flex justify-between text-lg font-bold text-primary">
                      <span>Total</span>
                      <span>{Number(invoice.total).toFixed(2)}€</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Verifactu Pending - Retry */}
              {isPendingVerifactu && !isPermanentError && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Icon name="warning" className="h-4 w-4 text-amber-500" />
                    Registro AEAT pendiente
                  </h3>
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20 p-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      Esta factura no se ha podido registrar en AEAT.
                      {invoice.verifactu_retry_count ? ` Intentos: ${invoice.verifactu_retry_count}` : ''}
                    </p>
                    <Button size="sm" variant="outline" onClick={handleRetryVerifactu} disabled={retrying}>
                      <Icon name="refresh" className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Registrando...' : 'Reintentar registro AEAT'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Verifactu Permanent Error */}
              {isPermanentError && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Icon name="warning" className="h-4 w-4 text-destructive" />
                    Error permanente AEAT
                  </h3>
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm font-medium text-destructive">
                      {permanentErrorMessage || 'AEAT ha rechazado esta factura por un error en los datos.'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Este error no se resolverá con reintentos. Corrija los datos del paciente (NIF, nombre, etc.) y pulse reintentar.
                    </p>
                    <Button size="sm" variant="outline" onClick={handleRetryVerifactu} disabled={retrying}>
                      <Icon name="refresh" className={`h-3 w-3 mr-1 ${retrying ? 'animate-spin' : ''}`} />
                      {retrying ? 'Registrando...' : 'Reintentar tras corrección'}
                    </Button>
                  </div>
                </div>
              )}

              {canFixInvoiceType && (
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
                      <Icon name="build" className="mr-2 h-4 w-4" />
                      Corregir tipo de factura
                    </Button>
                  </div>
                </div>
              )}

              {/* Notes */}
              {invoice.notes && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Notas
                  </h3>
                  <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
            </div>

            {/* Right column: Verifactu panel + actions */}
            <div className="flex flex-col gap-4 lg:col-span-4">
              {isFiscalLocked ? (
                <div className="rounded-2xl border bg-card p-4 shadow-card">
                  <div className="mb-4 flex items-center gap-3 border-b pb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
                      <Icon name="verified_user" className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold">VeriFactu AEAT</h3>
                      <p className="text-xs font-medium text-success">Registro sellado y verificado</p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    {invoice.verifactu_registration_id ? (
                      <div>
                        <span className="block text-xs text-muted-foreground">CSV</span>
                        <span className="font-mono font-medium">{invoice.verifactu_registration_id}</span>
                      </div>
                    ) : (
                      <div>
                        <span className="block text-xs text-muted-foreground">Estado</span>
                        <span className="font-medium">Pendiente de CSV AEAT</span>
                      </div>
                    )}
                    {invoice.verifactu_timestamp && (
                      <div>
                        <span className="block text-xs text-muted-foreground">Registrado</span>
                        <span>{format(new Date(invoice.verifactu_timestamp), "dd/MM/yyyy HH:mm:ss")}</span>
                      </div>
                    )}
                    {invoice.verifactu_hash && (
                      <div>
                        <span className="block text-xs text-muted-foreground">Hash</span>
                        <div className="mt-1 break-all rounded-md border bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground">
                          {invoice.verifactu_hash.substring(0, 32)}...
                        </div>
                      </div>
                    )}
                  </div>
                  {invoice.verifactu_qr && (
                    <>
                      <div className="mt-4 flex justify-center border-t pt-4">
                        <div className="flex h-28 w-28 items-center justify-center rounded-lg border bg-white p-1">
                          <QRCodeSVG
                            value={invoice.verifactu_qr}
                            size={100}
                            level="M"
                            includeMargin={false}
                            bgColor="hsl(0 0% 100%)"
                            fgColor="hsl(0 0% 0%)"
                            title="QR Verifactu"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={handleOpenVerification}>
                          <Icon name="open_in_new" className="mr-1 h-3.5 w-3.5" />
                          Verificar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCopyQR}>
                          <Icon name="content_copy" className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {/* Actions Card */}
              <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4 shadow-card">
                <Button className="w-full" onClick={() => setSendOpen(true)}>
                  <Icon name="send" className="mr-2 h-4 w-4" />
                  Enviar al paciente
                </Button>
                <Button variant="outline" className="w-full" onClick={handleGeneratePDF} disabled={generatingPdf}>
                  <Icon name={generatingPdf ? 'progress_activity' : 'download'} className={`mr-2 h-4 w-4 ${generatingPdf ? 'animate-spin' : ''}`} />
                  Descargar PDF
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">
            No se encontró la factura
          </p>
        )}
      </DialogContent>
    </Dialog>
    {invoice && (
      <>
        <FixInvoiceTypeDialog
          open={fixTypeOpen}
          onOpenChange={setFixTypeOpen}
          invoice={invoice}
          onCompleted={() => refetchInvoice()}
        />
        <SendInvoiceDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          invoice={invoice}
        />
      </>
    )}
    </>
  );
}
