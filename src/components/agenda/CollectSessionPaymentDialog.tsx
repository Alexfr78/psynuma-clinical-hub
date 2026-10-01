import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useCollectSessionPayment, useCollectSessionPaymentSplit } from '@/hooks/useSessionPayment';
import { useCenter } from '@/hooks/useCenter';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { useSessionInvoiceStatus } from '@/hooks/useInvoices';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

interface CollectSessionPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  /** Outstanding balance: the most that can be collected now. */
  amount: number;
  /** Full session price. The invoice is always issued for this, even on a partial payment. */
  sessionPrice?: number;
  sessionDate?: string;
  sessionType?: string;
  onSuccess?: (invoiceData?: { id: string; invoice_number: string; total: number }) => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'bizum', label: 'Bizum' },
];

interface SplitRow {
  method: string;
  amount: string;
}

const defaultSplitRows = (): SplitRow[] => [
  { method: 'cash', amount: '' },
  { method: 'bizum', amount: '' },
];

const parseAmount = (value: string) => {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

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
  sessionPrice,
  sessionDate,
  sessionType,
  onSuccess,
}: CollectSessionPaymentDialogProps) {
  const [step, setStep] = useState<Step>('payment');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSplit, setIsSplit] = useState(false);
  const [splitRows, setSplitRows] = useState<SplitRow[]>(defaultSplitRows);
  const [singleAmount, setSingleAmount] = useState(amount.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedInvoiceType, setSelectedInvoiceType] = useState<'simplified' | 'complete'>('simplified');
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);
  const [createdInvoiceTotal, setCreatedInvoiceTotal] = useState<number>(0);
  const [verifactuPending, setVerifactuPending] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Generando factura...');

  const { center } = useCenter();
  const isMobile = useIsMobile();
  const collectPayment = useCollectSessionPayment();
  const collectSplitPayment = useCollectSessionPaymentSplit();
  const isCollecting = collectPayment.isPending || collectSplitPayment.isPending;

  // Whatever is not collected now stays pending on the session's debt (status 'partial').
  const collectTotal = isSplit
    ? splitRows.reduce((sum, row) => sum + parseAmount(row.amount), 0)
    : parseAmount(singleAmount);
  const pendingAfter = Math.round((amount - collectTotal) * 100) / 100;
  const amountValid =
    (isSplit ? splitRows.every((row) => parseAmount(row.amount) > 0) : collectTotal > 0) &&
    pendingAfter > -0.01;

  // The outstanding balance can change while closed (e.g. after a partial payment).
  useEffect(() => {
    if (open) setSingleAmount(amount.toFixed(2));
  }, [open, amount]);
  const createSignedInvoice = useCreateSignedInvoice();
  const { data: invoiceStatus, refetch: refetchInvoiceStatus } = useSessionInvoiceStatus(sessionId);

  const invoiceMode = (center?.invoice_on_payment_mode as string) || 'disabled';
  const sendChannel = (center?.invoice_send_channel as 'email' | 'whatsapp' | 'both') || 'email';
  const verifactuAutoEnabled = center?.verifactu_auto_enabled === true;
  
  // Check if session already has a valid invoice
  const hasExistingInvoice = invoiceStatus?.hasValidInvoice;

  const resetForm = () => {
    setStep('payment');
    setPaymentMethod('cash');
    setIsSplit(false);
    setSplitRows(defaultSplitRows());
    setSingleAmount(amount.toFixed(2));
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setReference('');
    setNotes('');
    setSelectedInvoiceType('simplified');
    setCreatedInvoiceId(null);
    setCreatedInvoiceNumber(null);
    setCreatedInvoiceTotal(0);
    setVerifactuPending(false);
    setProcessingMessage('Generando factura...');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => resetForm(), 350);
  };

  const createInvoiceForSession = async (type: 'simplified' | 'complete') => {
    const formattedDate = sessionDate 
      ? format(new Date(sessionDate), "d 'de' MMMM yyyy", { locale: es })
      : format(new Date(), "d 'de' MMMM yyyy", { locale: es });
    const description = `Sesión de ${sessionType || 'psicoterapia'} - ${formattedDate}`;

    const invoiceAmount = sessionPrice && sessionPrice > 0 ? sessionPrice : amount;
    const items = [{
      description,
      quantity: 1,
      unit_price: invoiceAmount,
      tax_rate: 0,
      tax_amount: 0,
      total: invoiceAmount,
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
      sendNotification: false,
      patientEmail,
      patientPhone,
    });

    if (result.invoiceId) {
      setCreatedInvoiceId(result.invoiceId);
      
      // Fetch invoice number for the send dialog
      const { data: invoiceRow } = await supabase
        .from('invoices')
        .select('invoice_number, total')
        .eq('id', result.invoiceId)
        .single();
      
      if (invoiceRow) {
        setCreatedInvoiceNumber(invoiceRow.invoice_number);
        setCreatedInvoiceTotal(invoiceRow.total);
      }
    }
    if (result.verifactuPending) {
      setVerifactuPending(true);
    }

    return result;
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // The backend RPC (collect_session_payment_v2) will atomically:
    // - Resolve the valid invoice/debt for the session
    // - Block if already fully paid (remaining <= 0.01)
    // - Block if amount > remaining
    // - Insert payment and recompute everything
    // This prevents double-charging even on concurrent/repeated clicks.
    if (!amountValid) return;

    if (isSplit) {
      // collect_session_payment_split records every part in a single transaction.
      await collectSplitPayment.mutateAsync({
        sessionId,
        patientId,
        parts: splitRows.map((row) => ({
          method: row.method,
          amount: Math.round(parseAmount(row.amount) * 100) / 100,
        })),
        paymentDate,
        reference: reference || undefined,
        notes: notes || undefined,
      });
    } else {
      await collectPayment.mutateAsync({
        sessionId,
        patientId,
        amount: Math.round(collectTotal * 100) / 100,
        paymentMethod,
        paymentDate,
        reference: reference || undefined,
        notes: notes || undefined,
      });
    }

    // Handle different modes
    // If session already has a valid invoice, skip invoice creation flow
    if (hasExistingInvoice) {
      handleClose();
      onSuccess?.();
      return;
    }
    
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
    // Double check if invoice was created in the meantime
    refetchInvoiceStatus();
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
    const invoiceData = createdInvoiceId && createdInvoiceNumber
      ? { id: createdInvoiceId, invoice_number: createdInvoiceNumber, total: createdInvoiceTotal }
      : undefined;
    // Close the dialog/drawer first
    onOpenChange(false);
    // Defer the callback so the Drawer animation completes before opening the next dialog
    setTimeout(() => {
      onSuccess?.(invoiceData);
      resetForm();
    }, 350);
  };

  const updateSplitRow = (index: number, patch: Partial<SplitRow>) => {
    setSplitRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  // With two parts, typing the first amount fills the second with the rest. Editing the
  // second never touches the first, so it can be lowered to leave part of it pending.
  const handleSplitAmountChange = (index: number, value: string) => {
    setSplitRows((rows) => {
      const next = rows.map((row, i) => (i === index ? { ...row, amount: value } : row));
      if (next.length === 2 && index === 0) {
        const rest = Math.round((amount - parseAmount(value)) * 100) / 100;
        next[1] = { ...next[1], amount: rest > 0 ? rest.toFixed(2) : '' };
      }
      return next;
    });
  };

  const renderPendingAfter = () => {
    if (pendingAfter < -0.01) {
      return <p className="text-sm text-destructive">Supera lo pendiente en {Math.abs(pendingAfter).toFixed(2)}€</p>;
    }
    if (pendingAfter < 0.01) {
      return <p className="text-sm text-green-600">Queda cobrada entera</p>;
    }
    return <p className="text-sm text-amber-600">Quedarán {pendingAfter.toFixed(2)}€ pendientes</p>;
  };

  const renderMethodSelect = (id: string, value: string, onChange: (value: string) => void) =>
    isMobile ? (
      // Select nativo para móvil - evita problemas de portales/modales
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        {PAYMENT_METHODS.map((m) => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    ) : (
      // Select de Radix para desktop - mejor UX visual
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Seleccionar método" />
        </SelectTrigger>
        <SelectContent>
          {PAYMENT_METHODS.map((m) => (
            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

  const renderPaymentStep = () => (
    <form onSubmit={handlePaymentSubmit} className="space-y-4">
      {/* Amount Display */}
      <div className="p-4 rounded-lg bg-muted/50 text-center">
        <p className="text-sm text-muted-foreground">Pendiente de cobro</p>
        <p className="text-3xl font-bold">{amount.toFixed(2)}€</p>
      </div>

      {/* Split toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="split-payment" className="cursor-pointer">Dividir entre varios métodos</Label>
          <p className="text-xs text-muted-foreground">Por ejemplo, una parte en efectivo y otra por Bizum. Lo que no se cobre queda pendiente.</p>
        </div>
        <Switch id="split-payment" checked={isSplit} onCheckedChange={setIsSplit} />
      </div>

      {isSplit ? (
        <div className="space-y-3">
          {splitRows.map((row, index) => (
            <div key={index} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {index === 0 && <Label htmlFor={`split-method-${index}`}>Método</Label>}
                {renderMethodSelect(`split-method-${index}`, row.method, (value) => updateSplitRow(index, { method: value }))}
              </div>
              <div className="w-28 space-y-1">
                {index === 0 && <Label htmlFor={`split-amount-${index}`}>Importe (€)</Label>}
                <Input
                  id={`split-amount-${index}`}
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={row.amount}
                  onChange={(e) => handleSplitAmountChange(index, e.target.value)}
                />
              </div>
              {splitRows.length > 2 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSplitRows((rows) => rows.filter((_, i) => i !== index))}
                  aria-label="Quitar método"
                >
                  <Icon name="close" className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSplitRows((rows) => [...rows, { method: 'card', amount: '' }])}
              disabled={splitRows.length >= PAYMENT_METHODS.length}
            >
              <Icon name="add" className="h-4 w-4 mr-1" />
              Añadir método
            </Button>
            {renderPendingAfter()}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="payment-method">Método de pago</Label>
            {renderMethodSelect('payment-method', paymentMethod, setPaymentMethod)}
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-amount">Importe que paga ahora (€)</Label>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={singleAmount}
              onChange={(e) => setSingleAmount(e.target.value)}
            />
            <div className="flex justify-end">{renderPendingAfter()}</div>
          </div>
        </div>
      )}

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
        <Button 
          type="button" 
          variant="outline" 
          onClick={handleClose}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isCollecting || !amountValid}>
          {isCollecting ? 'Procesando...' : 'Confirmar pago'}
        </Button>
      </div>
    </form>
  );

  const renderInvoiceQuestionStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon name="check" className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-semibold text-lg">Pago registrado</h3>
        <p className="text-muted-foreground">
          ¿Deseas generar y enviar la factura al paciente?
        </p>
      </div>

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={handleInvoiceQuestionNo} className="gap-2">
          <Icon name="close" className="h-4 w-4" />
          No, solo el pago
        </Button>
        <Button onClick={handleInvoiceQuestionYes} className="gap-2">
          <Icon name="description" className="h-4 w-4" />
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
        {sendChannel === 'email' && <><Icon name="mail" className="h-4 w-4" /> Se enviará por email</>}
        {sendChannel === 'whatsapp' && <><Icon name="forum" className="h-4 w-4" /> Se enviará por WhatsApp</>}
        {sendChannel === 'both' && <><Icon name="mail" className="h-4 w-4" /><Icon name="forum" className="h-4 w-4" /> Se enviará por email y WhatsApp</>}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4">
        <Button variant="outline" onClick={handleInvoiceQuestionNo}>
          Cancelar
        </Button>
        <Button onClick={handleInvoiceTypeSubmit} disabled={createSignedInvoice.isPending}>
          Generar y enviar
        </Button>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="py-8 text-center space-y-4">
      <Icon name="progress_activity" className="h-12 w-12 animate-spin mx-auto text-primary" />
      <p className="text-muted-foreground">{processingMessage}</p>
      {verifactuAutoEnabled && (
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Icon name="verified_user" className="h-3 w-3" />
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
            <Icon name="warning" className="h-6 w-6 text-yellow-600" />
          ) : (
            <Icon name="check" className="h-6 w-6 text-green-600" />
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

  const renderContent = () => (
    <>
      {step === 'payment' && renderPaymentStep()}
      {step === 'invoice-question' && renderInvoiceQuestionStep()}
      {step === 'invoice-type' && renderInvoiceTypeStep()}
      {step === 'processing' && renderProcessingStep()}
      {step === 'complete' && renderCompleteStep()}
    </>
  );

  // En móvil usamos Drawer para evitar conflictos con el SessionDetailDrawer
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              <Icon name="credit_card" className="h-5 w-5" />
              {getDialogTitle()}
            </DrawerTitle>
            {getDialogDescription() && (
              <p className="text-sm text-muted-foreground">
                {getDialogDescription()}
              </p>
            )}
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            {renderContent()}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // En desktop usamos Dialog
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="credit_card" className="h-5 w-5" />
            {getDialogTitle()}
          </DialogTitle>
          {getDialogDescription() && (
            <DialogDescription>
              {getDialogDescription()}
            </DialogDescription>
          )}
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
