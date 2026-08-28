import { useState } from 'react';
import { format } from 'date-fns';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCollectDebtPayment } from '@/hooks/useCollectDebtPayment';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { useCenter } from '@/hooks/useCenter';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

interface CollectBonoPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bonoId: string;
  bonoName: string;
  patientId: string;
  patientName: string;
  debtId: string;
  invoiceId: string | null;
  totalAmount: number;
  paidAmount: number;
  onSuccess?: () => void;
}

type Step = 'payment' | 'ask_invoice' | 'processing' | 'complete';

export function CollectBonoPaymentDialog({
  open,
  onOpenChange,
  bonoId,
  bonoName,
  patientId,
  patientName,
  debtId,
  invoiceId,
  totalAmount,
  paidAmount,
  onSuccess,
}: CollectBonoPaymentDialogProps) {
  const [step, setStep] = useState<Step>('payment');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentAmount, setPaymentAmount] = useState((totalAmount - paidAmount).toFixed(2));
  const [verifactuPending, setVerifactuPending] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<{
    amount: number;
    paymentMethod: string;
    reference: string;
    notes: string;
  } | null>(null);

  const { center } = useCenter();
  const isMobile = useIsMobile();
  const collectDebtPayment = useCollectDebtPayment();
  const createSignedInvoice = useCreateSignedInvoice();
  const queryClient = useQueryClient();

  const remainingAmount = totalAmount - paidAmount;
  const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;
  const invoiceOnPaymentMode = center?.invoice_on_payment_mode || 'ask';

  const resetForm = () => {
    setStep('payment');
    setPaymentMethod('cash');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReference('');
    setNotes('');
    setPaymentAmount(remainingAmount.toFixed(2));
    setVerifactuPending(false);
    setPendingPaymentData(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const processPayment = async (generateInvoice: boolean) => {
    if (!pendingPaymentData) return;
    
    setStep('processing');
    const { amount, paymentMethod: method, reference: ref, notes: n } = pendingPaymentData;

    try {
      let effectiveInvoiceId = invoiceId;

      // If we need to generate an invoice and don't have one yet
      if (generateInvoice && !effectiveInvoiceId) {
        // Fetch bono details
        const { data: bono } = await supabase
          .from('bonos')
          .select('id, name, total_sessions, total_price')
          .eq('id', bonoId)
          .single();

        if (bono) {
          const invoiceResult = await createSignedInvoice.mutateAsync({
            patientId,
            invoiceType: 'simplified',
            bonoId: bono.id,
            statusOverride: 'draft',
            items: [
              {
                description: `Bono: ${bono.name} (${bono.total_sessions} sesiones)`,
                quantity: 1,
                unit_price: totalAmount,
                tax_rate: 0,
                tax_amount: 0,
                total: totalAmount,
                bono_id: bono.id,
              },
            ],
            notes: `Bono: ${bono.name}`,
            sendNotification: false,
          });
          effectiveInvoiceId = invoiceResult.invoiceId;
        }
      }

      // Collect the payment
      const result = await collectDebtPayment.mutateAsync({
        debtId,
        amount,
        paymentMethod: method,
        reference: ref || undefined,
        notes: n || `Pago de bono: ${bonoName}`,
        invoiceId: effectiveInvoiceId || undefined,
        issueInvoice: generateInvoice, // Only issue if we're generating
      });

      // Check if there was an issue with Verifactu
      const newPaidAmount = paidAmount + amount;
      if (generateInvoice && newPaidAmount >= totalAmount && effectiveInvoiceId && !result.invoiceIssued) {
        setVerifactuPending(true);
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['bono-payment-status'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });

      setStep('complete');
    } catch (error) {
      console.error('Error collecting payment:', error);
      toast.error('Error al registrar el pago');
      setStep('payment');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(paymentAmount);
    const paymentData = {
      amount,
      paymentMethod,
      reference,
      notes: notes || `Pago de bono: ${bonoName}`,
    };
    setPendingPaymentData(paymentData);

    // If there's already an invoice, check invoice status first
    if (invoiceId) {
      // Check if invoice is still draft - if so, we need to respect invoice_on_payment_mode
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();

      const invoiceIsDraft = existingInvoice?.status === 'draft';
      
      // If invoice is draft and mode is 'ask', we need to ask the user
      if (invoiceIsDraft && invoiceOnPaymentMode === 'ask') {
        setStep('ask_invoice');
        return;
      }
      
      // If mode is 'disabled', don't issue the invoice
      const shouldIssue = invoiceOnPaymentMode !== 'disabled';
      
      setStep('processing');
      try {
        const result = await collectDebtPayment.mutateAsync({
          debtId,
          amount,
          paymentMethod,
          reference: reference || undefined,
          notes: paymentData.notes,
          invoiceId,
          issueInvoice: shouldIssue,
        });

        const newPaidAmount = paidAmount + amount;
        if (shouldIssue && newPaidAmount >= totalAmount && !result.invoiceIssued) {
          setVerifactuPending(true);
        }

        queryClient.invalidateQueries({ queryKey: ['bono-payment-status'] });
        queryClient.invalidateQueries({ queryKey: ['debts'] });
        queryClient.invalidateQueries({ queryKey: ['payments'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });

        setStep('complete');
      } catch (error) {
        console.error('Error collecting payment:', error);
        toast.error('Error al registrar el pago');
        setStep('payment');
      }
      return;
    }

    // No invoice yet - check center settings
    if (invoiceOnPaymentMode === 'auto') {
      await processPayment(true);
    } else if (invoiceOnPaymentMode === 'disabled') {
      await processPayment(false);
    } else {
      // 'ask' mode - show question step
      setStep('ask_invoice');
    }
  };

  const handleComplete = () => {
    handleClose();
    onSuccess?.();
  };

  const renderPaymentStep = () => (
    <form onSubmit={handlePaymentSubmit} className="space-y-4">
      {/* Bono Info */}
      <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 space-y-2">
        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
          <Icon name="package_2" className="h-5 w-5" />
          <span className="font-semibold">{bonoName}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Contacto: {patientName}
        </div>
      </div>

      {/* Amount Display */}
      <div className="p-4 rounded-lg bg-muted/50 text-center space-y-1">
        <p className="text-sm text-muted-foreground">Pendiente de cobro</p>
        <p className="text-3xl font-bold">{remainingAmount.toFixed(2)}€</p>
        {paidAmount > 0 && (
          <p className="text-xs text-muted-foreground">
            (Ya pagado: {paidAmount.toFixed(2)}€ de {totalAmount.toFixed(2)}€)
          </p>
        )}
      </div>

      {/* Payment Amount */}
      <div className="space-y-2">
        <Label htmlFor="payment-amount" className="flex items-center gap-2">
          <Icon name="credit_card" className="h-4 w-4" />
          Importe a cobrar (€)
        </Label>
        <Input
          id="payment-amount"
          type="number"
          step="0.01"
          min="0.01"
          max={remainingAmount}
          value={paymentAmount}
          onChange={(e) => setPaymentAmount(e.target.value)}
        />
      </div>

      {/* Payment Method */}
      <div className="space-y-2">
        <Label htmlFor="payment-method">Método de pago</Label>
        {isMobile ? (
          <select
            id="payment-method"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="cash">Efectivo</option>
            <option value="card">Tarjeta</option>
            <option value="transfer">Transferencia</option>
            <option value="bizum">Bizum</option>
          </select>
        ) : (
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger id="payment-method">
              <SelectValue placeholder="Seleccionar método" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Efectivo</SelectItem>
              <SelectItem value="card">Tarjeta</SelectItem>
              <SelectItem value="transfer">Transferencia</SelectItem>
              <SelectItem value="bizum">Bizum</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Payment Date */}
      <div className="space-y-2">
        <Label htmlFor="payment-date" className="flex items-center gap-2">
          <Icon name="calendar_month" className="h-4 w-4" />
          Fecha de pago
        </Label>
        <Input
          id="payment-date"
          type="date"
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </div>

      {/* Reference */}
      <div className="space-y-2">
        <Label htmlFor="reference" className="flex items-center gap-2">
          <Icon name="receipt_long" className="h-4 w-4" />
          Referencia (opcional)
        </Label>
        <Input
          id="reference"
          placeholder="Nº de recibo, transferencia..."
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes" className="flex items-center gap-2">
          <Icon name="description" className="h-4 w-4" />
          Notas (opcional)
        </Label>
        <Textarea
          id="notes"
          placeholder="Notas adicionales..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={handleClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={collectDebtPayment.isPending || createSignedInvoice.isPending}>
          {collectDebtPayment.isPending ? 'Procesando...' : 'Confirmar pago'}
        </Button>
      </div>
    </form>
  );

  const renderAskInvoiceStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Icon name="help" className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="font-semibold text-lg">¿Generar factura?</h3>
        <p className="text-sm text-muted-foreground">
          Elige si deseas generar una factura simplificada para este pago o solo registrar el cobro.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 text-center">
        <p className="text-sm text-muted-foreground">Importe a cobrar</p>
        <p className="text-2xl font-bold">{pendingPaymentData?.amount.toFixed(2)}€</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button 
          onClick={() => processPayment(true)}
          disabled={collectDebtPayment.isPending || createSignedInvoice.isPending}
          className="w-full"
        >
          <Icon name="receipt_long" className="h-4 w-4 mr-2" />
          Generar factura y cobrar
        </Button>
        <Button 
          variant="outline"
          onClick={() => processPayment(false)}
          disabled={collectDebtPayment.isPending || createSignedInvoice.isPending}
          className="w-full"
        >
          Solo registrar el pago
        </Button>
        <Button 
          variant="ghost"
          onClick={() => {
            setStep('payment');
            setPendingPaymentData(null);
          }}
          className="w-full"
        >
          Volver
        </Button>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="py-8 text-center space-y-4">
      <Icon name="progress_activity" className="h-12 w-12 animate-spin mx-auto text-primary" />
      <p className="text-muted-foreground">Registrando pago...</p>
      {verifactuAutoEnabled && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Icon name="verified_user" className="h-3 w-3" />
          Emitiendo factura...
        </p>
      )}
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${verifactuPending ? 'bg-yellow-100' : 'bg-green-100'}`}>
          {verifactuPending ? (
            <Icon name="warning" className="h-6 w-6 text-yellow-600" />
          ) : (
            <Icon name="check" className="h-6 w-6 text-green-600" />
          )}
        </div>
        <h3 className="font-semibold text-lg">
          {verifactuPending ? 'Pago registrado' : '¡Pago completado!'}
        </h3>
        <p className="text-muted-foreground">
          {verifactuPending 
            ? 'El pago se ha registrado pero la factura está pendiente de registro en AEAT.'
            : 'El pago del bono se ha registrado correctamente.'}
        </p>
      </div>

      {verifactuPending && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 space-y-2">
          <p className="text-sm font-medium text-yellow-800 flex items-center gap-2">
            <Icon name="verified_user" className="h-4 w-4" />
            Pendiente AEAT
          </p>
          <p className="text-xs text-yellow-700">
            La factura aparecerá en la pestaña "Pendientes AEAT" para su reintento.
          </p>
        </div>
      )}

      <div className="pt-4">
        <Button onClick={handleComplete} className="w-full">
          Cerrar
        </Button>
      </div>
    </div>
  );

  const content = (
    <>
      {step === 'payment' && renderPaymentStep()}
      {step === 'ask_invoice' && renderAskInvoiceStep()}
      {step === 'processing' && renderProcessingStep()}
      {step === 'complete' && renderCompleteStep()}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Icon name="package_2" className="h-5 w-5" />
              Cobrar bono
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="package_2" className="h-5 w-5" />
            Cobrar bono
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
