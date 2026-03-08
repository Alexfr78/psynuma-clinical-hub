import { useState, useEffect } from 'react';
import { FileText, Link2 } from 'lucide-react';
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
import { useInvoices } from '@/hooks/useInvoices';
import { useLinkPaymentToInvoice } from '@/hooks/useLinkPaymentToInvoice';
import type { PaymentWithRelations } from '@/hooks/usePayments';

interface LinkPaymentToInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentWithRelations | null;
}

export function LinkPaymentToInvoiceDialog({
  open,
  onOpenChange,
  payment,
}: LinkPaymentToInvoiceDialogProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  
  // Get issued invoices for the same patient
  const { data: invoices } = useInvoices({ status: 'issued' });
  const linkPayment = useLinkPaymentToInvoice();

  // Filter invoices by patient
  const patientInvoices = invoices?.filter(
    (inv) => payment && inv.patient_id === payment.patient_id
  ) || [];

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedInvoiceId('');
    }
  }, [open]);

  const handleLink = async () => {
    if (!payment || !selectedInvoiceId) return;

    await linkPayment.mutateAsync({
      paymentId: payment.id,
      invoiceId: selectedInvoiceId,
      amount: payment.amount,
    });
    
    onOpenChange(false);
  };

  if (!payment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular pago a factura
          </DialogTitle>
          <DialogDescription>
            Asocia este pago de {Number(payment.amount).toFixed(2)}€ a una factura emitida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm font-medium">
              Contacto: {payment.patients.first_name} {payment.patients.last_name}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Importe: {Number(payment.amount).toFixed(2)}€
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-select">Seleccionar factura</Label>
            {patientInvoices.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3 border rounded-lg">
                <FileText className="h-4 w-4 inline mr-2" />
                No hay facturas emitidas para este contacto
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
                  {patientInvoices.map((invoice) => (
                    <SelectItem key={invoice.id} value={invoice.id}>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>{invoice.invoice_number}</span>
                        <span className="text-muted-foreground">
                          - {Number(invoice.total).toFixed(2)}€
                        </span>
                      </div>
                    </SelectItem>
                  ))}
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
