import { useState } from 'react';
import { format } from 'date-fns';
import { CreditCard, Calendar, Receipt, FileText, Loader2, Check, X, Mail, MessageSquare, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useCollectSessionPayment } from '@/hooks/useSessionPayment';
import { useCenter } from '@/hooks/useCenter';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { toast } from 'sonner';

interface CollectSessionPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  amount: number;
  sessionDate?: string;
  sessionType?: string;
  onSuccess?: () => void;
}

type Step = 'payment' | 'invoice-question' | 'invoice-type' | 'processing' | 'complete';

export function CollectSessionPaymentDialog({
  open,
  onOpenChange,
  sessionId,
  patientId,
  patientName,
  patientEmail,
  patientPhone,
  amount,
  sessionDate,
  sessionType,
  onSuccess,
}: CollectSessionPaymentDialogProps) {
  const [step, setStep] = useState<Step>('payment');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'simplified' | 'complete'>('simplified');
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [verifactuPending, setVerifactuPending] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Generando factura...');

  const { center } = useCenter();
  const collectPayment = useCollectSessionPayment();
  const createSignedInvoice = useCreateSignedInvoice();

  const invoiceMode = (center?.invoice_on_payment_mode as string) || 'disabled';
  const sendChannel = (center?.invoice_send_channel as 'email' | 'whatsapp' | 'both') || 'email';
  const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;

  const resetForm = () => {
    setStep('payment');
    setPaymentMethod('cash');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReference('');
    setNotes('');
    setSelectedInvoiceType('simplified');
    setCreatedInvoiceId(null);
    setWhatsappLink(null);
    setVerifactuPending(false);
    setProcessingMessage('Generando factura...');
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const createInvoiceForSession = async (type: 'simplified' | 'complete') => {
    const description = sessionType 
      ? `${sessionType} - ${sessionDate ? format(new Date(sessionDate), 'dd/MM/yyyy') : 'Sesión'}`
      : `Sesión - ${sessionDate ? format(new Date(sessionDate), 'dd/MM/yyyy') : ''}`;

    const items = [{
      description,
      quantity: 1,
      unit_price: amount,
      tax_rate: 0,
      tax_amount: 0,
      total: amount,
      session_id: sessionId,
    }];

    // Update processing message if Verifactu is enabled
    if (verifactuAutoEnabled) {
      setProcessingMessage('Generando factura y registrando en AEAT...');
    }

    const result = await createSignedInvoice.mutateAsync({
      patientId,
      invoiceType: type,
      items,
      notes: 'Factura generada automáticamente al cobrar sesión',
      sendNotification: true,
      patientEmail,
      patientPhone,
    });

    if (result.invoiceId) {
      setCreatedInvoiceId(result.invoiceId);
    }
    if (result.whatsappLink) {
      setWhatsappLink(result.whatsappLink);
    }
    if (result.verifactuPending) {
      setVerifactuPending(true);
    }

    return result;
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Collect the payment first
    await collectPayment.mutateAsync({
      sessionId,
      patientId,
      amount,
      paymentMethod,
      paymentDate,
      reference: reference || undefined,
      notes: notes || undefined,
    });

    // Handle different modes
    if (invoiceMode === 'disabled') {
      handleClose();
      onSuccess?.();
    } else if (invoiceMode === 'ask') {
      setStep('invoice-question');
    } else if (invoiceMode === 'auto') {
      setStep('processing');
      try {
        await createInvoiceForSession('simplified');
        setStep('complete');
      } catch (error) {
        console.error('Error in auto invoice:', error);
        toast.error('Error al generar la factura automáticamente');
        setStep('complete');
      }
    }
  };

  const handleInvoiceQuestionNo = () => {
    handleClose();
    onSuccess?.();
  };

  const handleInvoiceQuestionYes = () => {
    setStep('invoice-type');
  };

  const handleInvoiceTypeSubmit = async () => {
    setStep('processing');
    try {
      await createInvoiceForSession(selectedInvoiceType);
      setStep('complete');
    } catch (error) {
      console.error('Error creating invoice:', error);
      toast.error('Error al generar la factura');
      setStep('complete');
    }
  };

  const handleComplete = () => {
    handleClose();
    onSuccess?.();
  };

  const renderPaymentStep = () => (
    <form onSubmit={handlePaymentSubmit} className="space-y-4">
      {/* Amount Display */}
      <div className="p-4 rounded-lg bg-muted/50 text-center">
        <p className="text-sm text-muted-foreground">Importe a cobrar</p>
        <p className="text-3xl font-bold">{amount.toFixed(2)}€</p>
      </div>

      {/* Payment Method */}
      <div className="space-y-2">
        <Label htmlFor="payment-method">Método de pago</Label>
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

      <DialogFooter>
        <Button 
          type="button" 
          variant="outline" 
          onClick={handleClose}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={collectPayment.isPending}>
          {collectPayment.isPending ? 'Procesando...' : 'Confirmar pago'}
        </Button>
      </DialogFooter>
    </form>
  );

  const renderInvoiceQuestionStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">Pago registrado</h3>
        <p className="text-muted-foreground">
          ¿Deseas generar y enviar la factura al paciente?
        </p>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={handleInvoiceQuestionNo} className="gap-2">
          <X className="h-4 w-4" />
          No, solo el pago
        </Button>
        <Button onClick={handleInvoiceQuestionYes} className="gap-2">
          <FileText className="h-4 w-4" />
          Sí, generar factura
        </Button>
      </div>
    </div>
  );

  const renderInvoiceTypeStep = () => (
    <div className="space-y-6">
      <div className="space-y-4">
        <Label className="text-base font-medium">Tipo de factura</Label>
        <RadioGroup
          value={selectedInvoiceType}
          onValueChange={(v) => setSelectedInvoiceType(v as 'simplified' | 'complete')}
          className="space-y-3"
        >
          <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50">
            <RadioGroupItem value="simplified" id="type-simplified" className="mt-1" />
            <div className="space-y-1">
              <Label htmlFor="type-simplified" className="font-medium cursor-pointer">
                Factura simplificada
              </Label>
              <p className="text-sm text-muted-foreground">
                Para importes menores. No requiere datos fiscales del paciente.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 rounded-lg border p-4 hover:bg-muted/50">
            <RadioGroupItem value="complete" id="type-complete" className="mt-1" />
            <div className="space-y-1">
              <Label htmlFor="type-complete" className="font-medium cursor-pointer">
                Factura completa
              </Label>
              <p className="text-sm text-muted-foreground">
                Incluye todos los datos fiscales. Requerida para importes mayores.
              </p>
            </div>
          </div>
        </RadioGroup>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
        {sendChannel === 'email' && <><Mail className="h-4 w-4" /> Se enviará por email</>}
        {sendChannel === 'whatsapp' && <><MessageSquare className="h-4 w-4" /> Se enviará por WhatsApp</>}
        {sendChannel === 'both' && <><Mail className="h-4 w-4" /><MessageSquare className="h-4 w-4" /> Se enviará por email y WhatsApp</>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleInvoiceQuestionNo}>
          Cancelar
        </Button>
        <Button onClick={handleInvoiceTypeSubmit} disabled={createSignedInvoice.isPending}>
          Generar y enviar
        </Button>
      </DialogFooter>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="py-8 text-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
      <p className="text-muted-foreground">{processingMessage}</p>
      {verifactuAutoEnabled && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          Registrando en AEAT...
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
          {verifactuPending ? 'Factura pendiente de registro' : '¡Proceso completado!'}
        </h3>
        <p className="text-muted-foreground">
          {verifactuPending 
            ? 'La factura se ha generado pero está pendiente de registro en AEAT. El envío al cliente se realizará cuando se complete el registro.'
            : createdInvoiceId 
              ? 'Pago registrado y factura generada correctamente.'
              : 'Pago registrado correctamente.'}
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

      {whatsappLink && !verifactuPending && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">Enviar factura por WhatsApp:</p>
          <Button asChild className="w-full gap-2">
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="h-4 w-4" />
              Abrir WhatsApp
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button onClick={handleComplete} className="w-full">
          Cerrar
        </Button>
      </DialogFooter>
    </div>
  );

  const getDialogTitle = () => {
    switch (step) {
      case 'payment': return 'Cobrar sesión';
      case 'invoice-question': return 'Generar factura';
      case 'invoice-type': return 'Tipo de factura';
      case 'processing': return 'Procesando...';
      case 'complete': return 'Completado';
    }
  };

  const getDialogDescription = () => {
    switch (step) {
      case 'payment': return `Registra el pago de la sesión para ${patientName}`;
      case 'invoice-question': return 'El pago ha sido registrado correctamente';
      case 'invoice-type': return 'Selecciona el tipo de factura a generar';
      case 'processing': return 'Por favor espera...';
      case 'complete': return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {getDialogTitle()}
          </DialogTitle>
          {getDialogDescription() && (
            <DialogDescription>
              {getDialogDescription()}
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'payment' && renderPaymentStep()}
        {step === 'invoice-question' && renderInvoiceQuestionStep()}
        {step === 'invoice-type' && renderInvoiceTypeStep()}
        {step === 'processing' && renderProcessingStep()}
        {step === 'complete' && renderCompleteStep()}
      </DialogContent>
    </Dialog>
  );
}
