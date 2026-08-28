import { useState, useEffect } from 'react';

import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
  ResponsiveDialogDescription as DialogDescription,
} from '@/components/ui/responsive-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInvoices } from '@/hooks/useInvoices';
import { useLinkPaymentToInvoice } from '@/hooks/useLinkPaymentToInvoice';
import type { PaymentWithRelations } from '@/hooks/usePayments';
import { Icon } from '@/components/ui/icon';

interface LinkPaymentToInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentWithRelations | null;
}

const STATUS_LABELS: Record<string, string> = {
  issued: 'Emitida',
  paid: 'Pagada',
  draft: 'Borrador',
  cancelled: 'Cancelada',
};

export function LinkPaymentToInvoiceDialog({
  open,
  onOpenChange,
  payment,
}: LinkPaymentToInvoiceDialogProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');

  // Load all non-draft invoices (we filter client-side for validity)
  const { data: allInvoices } = useInvoices();
  const linkPayment = useLinkPaymentToInvoice();

  // Filter: only valid invoices for the same patient, issued or paid, not cancelled.
  // Business rule: invoices invalidated by rectificativa (is_valid=false) must not
  // appear as selectable targets.
  const patientInvoices = (allInvoices || []).filter((inv) => {
    if (!payment) return false;
    if (inv.patient_id !== payment.patient_id) return false;
    if (inv.is_valid === false) return false;
    if (inv.status === 'cancelled' || inv.status === 'draft') return false;
    // Don't show the invoice the payment is already linked to
    if (payment.invoice_id && inv.id === payment.invoice_id) return false;
    return true;
  });

  // Find if the payment's current invoice was rectified, and if so which rectificativa replaces it
  const rectificativaForCurrent = payment?.invoice_id
    ? (allInvoices || []).find(
        (inv) =>
          inv.rectified_invoice_id === payment.invoice_id &&
          inv.is_valid === true &&
          inv.status !== 'cancelled'
      )
    : null;

  // Sort: prioritize rectificativa of the current invoice, then by issue_date desc
  const sortedInvoices = [...patientInvoices].sort((a, b) => {
    if (rectificativaForCurrent) {
      if (a.id === rectificativaForCurrent.id) return -1;
      if (b.id === rectificativaForCurrent.id) return 1;
    }
    return new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime();
  });

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      // Auto-select rectificativa if available
      setSelectedInvoiceId(rectificativaForCurrent?.id || '');
    }
  }, [open, rectificativaForCurrent?.id]);

  const handleLink = async () => {
    if (!payment || !selectedInvoiceId) return;

    await linkPayment.mutateAsync({
      paymentId: payment.id,
      invoiceId: selectedInvoiceId,
    });

    onOpenChange(false);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="link" className="h-5 w-5" />
            Vincular pago a factura
          </DialogTitle>
          <DialogDescription>
            Asocia este pago de {Number(payment.amount).toFixed(2)}&euro; a una factura v&aacute;lida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">
              Contacto: {payment.patients.first_name} {payment.patients.last_name}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Importe: {Number(payment.amount).toFixed(2)}&euro;
            </p>
            {payment.invoices && (
              <p className="text-sm text-muted-foreground mt-1">
                Factura actual: {payment.invoices.invoice_number}
              </p>
            )}
          </div>

          {rectificativaForCurrent && (
            <Alert>
              <Icon name="error" className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-1 text-sm">
                La factura actual fue rectificada.
                <Icon name="arrow_forward" className="h-3 w-3" />
                Se sugiere reasignar a la rectificativa.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="invoice-select">Seleccionar factura</Label>
            {sortedInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border rounded-lg">
                <Icon name="description" className="h-4 w-4 inline mr-2" />
                No hay facturas v&aacute;lidas disponibles para este contacto
              </div>
            ) : (
              <Select
                value={selectedInvoiceId}
                onValueChange={setSelectedInvoiceId}
              >
                <SelectTrigger id="invoice-select">
                  <SelectValue placeholder="Selecciona una factura" />
                </SelectTrigger>
                <SelectContent>
                  {sortedInvoices.map((invoice) => {
                    const isRectificativa = !!invoice.rectified_invoice_id;
                    const isRecommended = rectificativaForCurrent?.id === invoice.id;

                    return (
                      <SelectItem key={invoice.id} value={invoice.id}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Icon name="description" className="h-4 w-4 shrink-0" />
                          <span className="font-medium">{invoice.invoice_number}</span>
                          <span className="text-muted-foreground">
                            {Number(invoice.total).toFixed(2)}&euro;
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {STATUS_LABELS[invoice.status] || invoice.status}
                          </Badge>
                          {isRectificativa && (
                            <Badge variant="secondary" className="text-xs">
                              Rectificativa
                            </Badge>
                          )}
                          {isRecommended && (
                            <Badge className="text-xs bg-blue-100 text-blue-800 hover:bg-blue-100">
                              Sugerida
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleLink}
            disabled={!selectedInvoiceId || linkPayment.isPending}
          >
            {linkPayment.isPending ? 'Vinculando...' : 'Vincular pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
