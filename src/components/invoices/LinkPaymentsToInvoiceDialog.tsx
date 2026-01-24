import { useState, useEffect } from 'react';
import { Link2, CreditCard, Check } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePayments } from '@/hooks/usePayments';
import { useLinkPaymentToInvoice } from '@/hooks/useLinkPaymentToInvoice';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';

interface LinkPaymentsToInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithPatient | null;
}

const methodLabels: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  bizum: 'Bizum',
  stripe: 'Stripe',
};

export function LinkPaymentsToInvoiceDialog({
  open,
  onOpenChange,
  invoice,
}: LinkPaymentsToInvoiceDialogProps) {
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [isLinking, setIsLinking] = useState(false);
  
  // Get all payments for the patient
  const { data: allPayments } = usePayments({ patientId: invoice?.patient_id });
  const linkPayment = useLinkPaymentToInvoice();

  // Filter payments without invoice (unlinked) for the same patient
  const unlinkedPayments = allPayments?.filter(
    (p) => !p.invoice_id && invoice && p.patient_id === invoice.patient_id
  ) || [];

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedPaymentIds([]);
    }
  }, [open]);

  const handleTogglePayment = (paymentId: string) => {
    setSelectedPaymentIds((prev) =>
      prev.includes(paymentId)
        ? prev.filter((id) => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const handleLink = async () => {
    if (!invoice || selectedPaymentIds.length === 0) return;

    setIsLinking(true);
    try {
      // Link each selected payment
      for (const paymentId of selectedPaymentIds) {
        const payment = unlinkedPayments.find((p) => p.id === paymentId);
        if (payment) {
          await linkPayment.mutateAsync({
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: Number(payment.amount),
          });
        }
      }
      onOpenChange(false);
    } finally {
      setIsLinking(false);
    }
  };

  const selectedTotal = unlinkedPayments
    .filter((p) => selectedPaymentIds.includes(p.id))
    .reduce((sum, p) => sum + Number(p.amount), 0);

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular cobros a factura
          </DialogTitle>
          <DialogDescription>
            Selecciona los cobros existentes que deseas vincular a la factura{' '}
            <strong>{invoice.invoice_number}</strong> ({Number(invoice.total).toFixed(2)}€).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">
              Paciente: {invoice.patients.first_name} {invoice.patients.last_name}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Total factura: {Number(invoice.total).toFixed(2)}€
            </p>
          </div>

          {unlinkedPayments.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-lg text-center">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay cobros sin vincular para este paciente</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[300px] pr-4">
              <div className="space-y-2">
                {unlinkedPayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                    onClick={() => handleTogglePayment(payment.id)}
                  >
                    <Checkbox
                      id={`payment-${payment.id}`}
                      checked={selectedPaymentIds.includes(payment.id)}
                      onCheckedChange={() => handleTogglePayment(payment.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor={`payment-${payment.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {format(new Date(payment.payment_date), "d MMM yyyy", { locale: es })}
                        </Label>
                        <span className="font-semibold text-sm">
                          {Number(payment.amount).toFixed(2)}€
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {methodLabels[payment.payment_method] || payment.payment_method}
                        {payment.notes && ` · ${payment.notes}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedPaymentIds.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
              <span className="text-sm font-medium">
                {selectedPaymentIds.length} cobro(s) seleccionado(s)
              </span>
              <span className="text-sm font-bold">
                {selectedTotal.toFixed(2)}€
              </span>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleLink}
            disabled={selectedPaymentIds.length === 0 || isLinking}
          >
            {isLinking ? (
              'Vinculando...'
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Vincular {selectedPaymentIds.length > 0 && `(${selectedPaymentIds.length})`}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
