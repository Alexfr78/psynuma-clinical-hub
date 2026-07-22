import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileCheck2, Loader2, ReceiptText } from 'lucide-react';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';
import {
  type CorrectionRecipient,
  type FixInvoiceTypeResult,
  type InvoiceTypeCorrectionOperation,
  useFixInvoiceType,
  useInvoiceTypeCorrectionContext,
} from '@/hooks/useFixInvoiceType';

interface FixInvoiceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceWithPatient;
  onCompleted?: (invoiceId: string) => void;
}

const BLOCKER_MESSAGES: Record<string, string> = {
  already_corrected: 'Esta factura ya tiene una corrección de tipo asociada.',
  invalid_status: 'Solo pueden corregirse facturas emitidas o pagadas.',
  invalidated: 'La factura ya está invalidada o sustituida.',
  is_rectificativa: 'No se puede iniciar este flujo desde una factura rectificativa.',
  not_fiscally_sealed: 'La factura debe estar cerrada fiscalmente antes de corregirla.',
  aeat_pending: 'La factura original todavía tiene un registro AEAT pendiente.',
};

const EMPTY_RECIPIENT: CorrectionRecipient = {
  name: '',
  tax_id: '',
  address: '',
  city: '',
  postal_code: '',
  email: '',
};

export function FixInvoiceTypeDialog({
  open,
  onOpenChange,
  invoice,
  onCompleted,
}: FixInvoiceTypeDialogProps) {
  const contextQuery = useInvoiceTypeCorrectionContext(invoice.id, open);
  const fixInvoiceType = useFixInvoiceType();
  const [operationType, setOperationType] = useState<InvoiceTypeCorrectionOperation | ''>('');
  const [seriesId, setSeriesId] = useState('');
  const [recipient, setRecipient] = useState<CorrectionRecipient>(EMPTY_RECIPIENT);
  const [updatePatient, setUpdatePatient] = useState(true);
  const [result, setResult] = useState<FixInvoiceTypeResult | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const context = contextQuery.data;
  const availableSeries = useMemo(() => {
    if (!context || !operationType) return [];
    return context.series.filter((series) => operationType === 'f3_replacement'
      ? series.series_type === 'ordinary' && series.invoice_type === 'complete'
      : series.series_type === 'rectifying' && series.invoice_type === context.source_invoice_type);
  }, [context, operationType]);

  useEffect(() => {
    if (!open) return;
    setOperationType('');
    setSeriesId('');
    setResult(null);
    setUpdatePatient(true);
    idempotencyKey.current = crypto.randomUUID();
  }, [open, invoice.id]);

  useEffect(() => {
    if (!context?.recipient) return;
    setRecipient({
      name: context.recipient.name || '',
      tax_id: context.recipient.tax_id || '',
      address: context.recipient.address || '',
      city: context.recipient.city || '',
      postal_code: context.recipient.postal_code || '',
      email: context.recipient.email || '',
    });
  }, [context]);

  useEffect(() => {
    if (!operationType || availableSeries.length === 0) {
      setSeriesId('');
      return;
    }
    const defaultSeries = availableSeries.find((series) => series.is_default) || availableSeries[0];
    setSeriesId(defaultSeries.id);
  }, [operationType, availableSeries]);

  const requiresTaxId = operationType === 'f3_replacement'
    || (operationType === 'rectificativa_substitution' && context?.source_invoice_type === 'complete');
  const recipientValid = recipient.name.trim().length > 0 && (!requiresTaxId || recipient.tax_id.trim().length > 0);
  const canSubmit = !!operationType && !!seriesId && recipientValid && !!context?.eligible && !fixInvoiceType.isPending;

  const setRecipientField = (field: keyof CorrectionRecipient, value: string) => {
    setRecipient((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!canSubmit || !operationType) return;
    try {
      const response = await fixInvoiceType.mutateAsync({
        originalInvoiceId: invoice.id,
        operationType,
        seriesId,
        recipient,
        updatePatient,
        idempotencyKey: idempotencyKey.current,
      });
      setResult(response);
      onCompleted?.(response.invoice_id);
    } catch {
      // The mutation exposes the recoverable error inline.
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (fixInvoiceType.isPending) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Corregir tipo de factura
          </DialogTitle>
          <DialogDescription>
            Factura {invoice.invoice_number}. Psycma aplicará el tratamiento fiscal según el motivo indicado.
          </DialogDescription>
        </DialogHeader>

        {contextQuery.isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : contextQuery.isError ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No se pudo comprobar la factura</AlertTitle>
            <AlertDescription>{contextQuery.error.message}</AlertDescription>
          </Alert>
        ) : !context?.eligible ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Factura no elegible</AlertTitle>
            <AlertDescription>
              {BLOCKER_MESSAGES[context?.blocker || ''] || 'Esta factura no puede corregirse mediante este flujo.'}
            </AlertDescription>
          </Alert>
        ) : result ? (
          <Alert className={result.status === 'registered' || result.status === 'already_completed'
            ? 'border-green-600/40 bg-green-50 dark:bg-green-950/20'
            : 'border-amber-500/40 bg-amber-50 dark:bg-amber-950/20'} role="status">
            {result.status === 'registered' || result.status === 'already_completed'
              ? <CheckCircle2 className="h-4 w-4 text-green-700" />
              : <AlertCircle className="h-4 w-4 text-amber-700" />}
            <AlertTitle>
              {result.status === 'registered' || result.status === 'already_completed'
                ? 'Corrección registrada'
                : 'Factura creada, registro AEAT pendiente'}
            </AlertTitle>
            <AlertDescription>
              Se ha creado la factura {result.invoice_number}.
              {result.status === 'pending_aeat' && ' El reintento continuará sobre este mismo documento.'}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-6">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">1. ¿Qué ocurrió con la factura original?</legend>
              <RadioGroup
                value={operationType}
                onValueChange={(value) => setOperationType(value as InvoiceTypeCorrectionOperation)}
                className="grid gap-3"
              >
                <Label htmlFor="rectificativa-substitution" className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/50">
                  <RadioGroupItem id="rectificativa-substitution" value="rectificativa_substitution" className="mt-1" />
                  <span>
                    <span className="block font-medium">La factura era incorrecta al emitirla</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      Se emitirá una rectificativa sustitutiva {context.source_invoice_type === 'simplified' ? 'R5-S' : 'R4-S'}.
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor="f3-replacement"
                  className={`flex min-h-16 items-start gap-3 rounded-lg border p-4 ${context.can_create_f3 ? 'cursor-pointer hover:bg-muted/50' : 'cursor-not-allowed opacity-50'}`}
                >
                  <RadioGroupItem id="f3-replacement" value="f3_replacement" className="mt-1" disabled={!context.can_create_f3} />
                  <span>
                    <span className="block font-medium">Era válida y ahora solicitan una factura completa</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      Se emitirá una factura completa F3 que sustituye a la simplificada.
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </fieldset>

            {operationType && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="correction-series">2. Serie de facturación</Label>
                  <Select value={seriesId} onValueChange={setSeriesId}>
                    <SelectTrigger id="correction-series" className="min-h-11">
                      <SelectValue placeholder="Selecciona una serie" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSeries.map((series) => (
                        <SelectItem key={series.id} value={series.id}>{series.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableSeries.length === 0 && (
                    <p className="text-sm text-destructive" role="alert">
                      No hay una serie activa compatible. Créala en Configuración → Facturación.
                    </p>
                  )}
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">3. Datos fiscales que quedarán congelados</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="recipient-name">Nombre o razón social</Label>
                      <Input id="recipient-name" value={recipient.name} onChange={(event) => setRecipientField('name', event.target.value)} className="min-h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recipient-tax-id">NIF{requiresTaxId ? ' *' : ''}</Label>
                      <Input id="recipient-tax-id" value={recipient.tax_id} onChange={(event) => setRecipientField('tax_id', event.target.value)} className="min-h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="recipient-postal-code">Código postal</Label>
                      <Input id="recipient-postal-code" value={recipient.postal_code} onChange={(event) => setRecipientField('postal_code', event.target.value)} className="min-h-11" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="recipient-address">Dirección</Label>
                      <Input id="recipient-address" value={recipient.address} onChange={(event) => setRecipientField('address', event.target.value)} className="min-h-11" />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="recipient-city">Localidad</Label>
                      <Input id="recipient-city" value={recipient.city} onChange={(event) => setRecipientField('city', event.target.value)} className="min-h-11" />
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
                    <Checkbox id="update-patient" checked={updatePatient} onCheckedChange={(checked) => setUpdatePatient(checked === true)} />
                    <Label htmlFor="update-patient" className="font-normal leading-5">
                      Actualizar también estos datos fiscales en la ficha del contacto.
                    </Label>
                  </div>
                </fieldset>

                <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">Resumen irreversible</p>
                  <p className="mt-1 text-muted-foreground">
                    Se reservará un nuevo número, se copiarán los conceptos, se trasladarán los cobros y la factura original quedará sustituida en Psycma.
                  </p>
                </div>
              </div>
            )}

            {fixInvoiceType.isPending && (
              <div className="rounded-lg border p-4" role="status" aria-live="polite">
                <div className="flex items-center gap-2 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creando y registrando la corrección…
                </div>
                <p className="mt-1 text-sm text-muted-foreground">No cierres esta ventana. Si AEAT tarda, podrás reanudar sin crear otra factura.</p>
              </div>
            )}

            {fixInvoiceType.isError && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No se pudo completar la corrección</AlertTitle>
                <AlertDescription>{fixInvoiceType.error.message}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={fixInvoiceType.isPending}>
            {result ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!result && context?.eligible && (
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="min-h-11">
              {fixInvoiceType.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-2 h-4 w-4" />}
              {operationType === 'f3_replacement' ? 'Emitir factura completa F3' : 'Emitir rectificativa sustitutiva'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
