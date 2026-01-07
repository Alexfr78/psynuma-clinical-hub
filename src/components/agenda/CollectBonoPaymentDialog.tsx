import { useState } from 'react';
import { format } from 'date-fns';
import { CreditCard, Calendar, Receipt, FileText, Loader2, Check, Package, ShieldCheck, AlertTriangle } from 'lucide-react';
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
import { useCenter } from '@/hooks/useCenter';
import { useIsMobile } from '@/hooks/use-mobile';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

type Step = 'payment' | 'processing' | 'complete';

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

  const { center } = useCenter();
  const isMobile = useIsMobile();
  const collectDebtPayment = useCollectDebtPayment();
  const queryClient = useQueryClient();

  const remainingAmount = totalAmount - paidAmount;
  const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;

  const resetForm = () => {
    setStep('payment');
    setPaymentMethod('cash');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReference('');
    setNotes('');
    setPaymentAmount(remainingAmount.toFixed(2));
    setVerifactuPending(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('processing');

    try {
      const amount = parseFloat(paymentAmount);
      
      // Collect the payment (hook handles invoice issuance automatically)
      const result = await collectDebtPayment.mutateAsync({
        debtId,
        amount,
        paymentMethod,
        reference: reference || undefined,
        notes: notes || `Pago de bono: ${bonoName}`,
      });

      // Check if there was an issue with Verifactu (invoice wasn't issued)
      const newPaidAmount = paidAmount + amount;
      if (newPaidAmount >= totalAmount && invoiceId && !result.invoiceIssued) {
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

  const handleComplete = () => {
    handleClose();
    onSuccess?.();
  };

  const renderPaymentStep = () => (
    <form onSubmit={handlePaymentSubmit} className="space-y-4">
      {/* Bono Info */}
      <div className="p-4 rounded-lg bg-purple-50 dark:bg-purple-950/30 space-y-2">
        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
          <Package className="h-5 w-5" />
          <span className="font-semibold">{bonoName}</span>
        </div>
        <div className="text-sm text-muted-foreground">
          Paciente: {patientName}
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
          <CreditCard className="h-4 w-4" />
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
          <Calendar className="h-4 w-4" />
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
          <Receipt className="h-4 w-4" />
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
          <FileText className="h-4 w-4" />
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
        <Button type="submit" disabled={collectDebtPayment.isPending}>
          {collectDebtPayment.isPending ? 'Procesando...' : 'Confirmar pago'}
        </Button>
      </div>
    </form>
  );

  const renderProcessingStep = () => (
    <div className="py-8 text-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
      <p className="text-muted-foreground">Registrando pago...</p>
      {verifactuAutoEnabled && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <ShieldCheck className="h-3 w-3" />
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
            <AlertTriangle className="h-6 w-6 text-yellow-600" />
          ) : (
            <Check className="h-6 w-6 text-green-600" />
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
            <ShieldCheck className="h-4 w-4" />
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
              <Package className="h-5 w-5" />
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
            <Package className="h-5 w-5" />
            Cobrar bono
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
