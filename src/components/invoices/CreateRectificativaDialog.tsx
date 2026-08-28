import { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogDescription as DialogDescription,
  ResponsiveDialogFooter as DialogFooter,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { useCenter } from '@/hooks/useCenter';
import { useInvoiceSeries } from '@/hooks/useInvoiceSeries';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getCompleteInvoiceMissingFields } from '@/lib/complete-invoice-requirements';
import { Icon } from '@/components/ui/icon';

interface CreateRectificativaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalInvoice: InvoiceWithPatient | null;
}

// Rectification reason codes according to Verifactu
// R1-R4 for complete invoices (F1), R5 only for simplified invoices (F2)
const RECTIFICATION_REASONS_COMPLETE = [
  { 
    code: 'R1', 
    label: 'R1 - Error fundado en derecho', 
    description: 'Error en los requisitos del art. 6 o 7 del RD 1619/2012'
  },
  { 
    code: 'R2', 
    label: 'R2 - Art. 80.Uno LIVA', 
    description: 'Concurso de acreedores del destinatario'
  },
  { 
    code: 'R3', 
    label: 'R3 - Art. 80.Dos LIVA', 
    description: 'Créditos incobrables'
  },
  { 
    code: 'R4', 
    label: 'R4 - Resto de causas', 
    description: 'Otras causas de rectificación'
  },
];

const RECTIFICATION_REASONS_SIMPLIFIED = [
  { 
    code: 'R5', 
    label: 'R5 - Factura simplificada', 
    description: 'Rectificación de factura simplificada (Art. 80.Tres LIVA)'
  },
];

const formSchema = z.object({
  rectification_type: z.enum(['I', 'S'], {
    required_error: 'Selecciona el tipo de rectificación',
  }),
  rectification_reason_code: z.enum(['R1', 'R2', 'R3', 'R4', 'R5'], {
    required_error: 'Selecciona el motivo de rectificación',
  }),
  series_id: z.string().min(1, 'Selecciona una serie'),
  description: z.string().min(1, 'Añade una descripción'),
  amount: z.coerce.number(),
  // Fields for substitution type (S)
  base_rectificada: z.coerce.number().optional(),
  cuota_rectificada: z.coerce.number().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateRectificativaDialog({
  open,
  onOpenChange,
  originalInvoice,
}: CreateRectificativaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalInvoiceType, setOriginalInvoiceType] = useState<'simplified' | 'complete' | null>(null);
  const queryClient = useQueryClient();
  const { center } = useCenter();
  const { rectifyingSeries, series: allSeries } = useInvoiceSeries();

  // Filter rectifying series by the original invoice's type (simplified/complete)
  const rectificativaSeries = (rectifyingSeries?.filter(s => 
    !s.is_archived && 
    (originalInvoiceType ? s.invoice_type === originalInvoiceType : true)
  ) || []);

  // Helper function to get series display name
  const getSeriesDisplayName = (series: typeof rectificativaSeries[0]) => {
    const invoiceTypeLabel = series.invoice_type === 'simplified' ? 'Simplificada' : 'Completa';
    return `${series.name} - Rectificativa ${invoiceTypeLabel}`;
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rectification_type: 'I',
      rectification_reason_code: 'R4',
      series_id: '',
      description: '',
      amount: 0,
      base_rectificada: 0,
      cuota_rectificada: 0,
      notes: '',
    },
  });

  const rectificationType = useWatch({
    control: form.control,
    name: 'rectification_type',
  });

  const isSubstitution = rectificationType === 'S';

  // Get original invoice type when dialog opens
  useEffect(() => {
    if (open && originalInvoice?.series_id && allSeries.length > 0) {
      const originalSeries = allSeries.find(s => s.id === originalInvoice.series_id);
      if (originalSeries) {
        setOriginalInvoiceType(originalSeries.invoice_type as 'simplified' | 'complete');
      }
    } else if (open && !originalInvoice?.series_id) {
      // If original invoice has no series, default to complete
      setOriginalInvoiceType('complete');
    }
  }, [open, originalInvoice?.series_id, allSeries]);

  // Reset form when dialog opens with new invoice
  useEffect(() => {
    if (open && originalInvoice && rectificativaSeries.length > 0) {
      const defaultSeries = rectificativaSeries.find(s => s.is_default) || rectificativaSeries[0];
      // Default reason code based on original invoice type: R5 for simplified, R4 for complete
      const defaultReasonCode = originalInvoiceType === 'simplified' ? 'R5' : 'R4';
      form.reset({
        rectification_type: 'I',
        rectification_reason_code: defaultReasonCode,
        series_id: defaultSeries?.id || '',
        description: `Rectificación de factura ${originalInvoice.invoice_number}`,
        amount: -Number(originalInvoice.total),
        base_rectificada: Number(originalInvoice.subtotal),
        cuota_rectificada: Number(originalInvoice.tax_amount) || 0,
        notes: '',
      });
    }
  }, [open, originalInvoice, rectificativaSeries.length, originalInvoiceType]);

  const onSubmit = async (values: FormValues) => {
    if (!originalInvoice || !center) return;

    setIsSubmitting(true);
    try {
      // Get the selected series
      const series = rectificativaSeries.find(s => s.id === values.series_id);
      if (!series) {
        toast.error('Serie de facturación no encontrada');
        return;
      }

      if (series.invoice_type === 'complete') {
        const missingFields = getCompleteInvoiceMissingFields(originalInvoice.patients);
        if (missingFields.length > 0) {
          toast.error(`No se puede crear una rectificativa completa. Faltan datos fiscales del paciente: ${missingFields.join(', ')}.`);
          return;
        }
      }

      // Generate invoice number from series format
      const year = new Date().getFullYear();
      const numberStr = series.next_number.toString().padStart(5, '0');
      const invoiceNumber = series.format
        .replace('{SERIE}', series.name)
        .replace('{AAAA}', year.toString())
        .replace('{AA}', year.toString().slice(-2))
        .replace('{NNNNN}', numberStr)
        .replace('{NNNN}', series.next_number.toString().padStart(4, '0'))
        .replace('{NNN}', series.next_number.toString().padStart(3, '0'));

      // Calculate tax/retention based on center config
      const taxRate = center.default_tax_rate || 0;
      const retentionRate = center.retention_rate || 0;
      const baseAmount = values.amount / (1 + taxRate / 100);
      const taxAmount = values.amount - baseAmount;
      const retentionAmount = baseAmount * (retentionRate / 100);
      const total = values.amount - retentionAmount;

      // Map form values to database values
      // Form uses Verifactu codes (I, S), DB expects (differences, substitution)
      const rectificationTypeMap: Record<string, string> = {
        'I': 'differences',
        'S': 'substitution',
      };

      // Prepare invoice data
      const invoiceData = {
        center_id: center.id,
        patient_id: originalInvoice.patient_id,
        invoice_number: invoiceNumber,
        series_id: values.series_id,
        invoice_type: series.invoice_type,
        status: 'issued',
        issue_date: new Date().toISOString().split('T')[0],
        subtotal: baseAmount,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        retention_rate: retentionRate,
        retention_amount: retentionAmount,
        total: total,
        rectified_invoice_id: originalInvoice.id,
        rectification_type: rectificationTypeMap[values.rectification_type],
        rectification_reason_code: values.rectification_reason_code,
        verifactu_invoice_type: values.rectification_reason_code,
        notes: values.notes || `Rectificación ${values.rectification_reason_code} tipo ${values.rectification_type === 'I' ? 'por diferencias' : 'sustitutiva'} de ${originalInvoice.invoice_number}`,
        ...(values.rectification_type === 'S'
          ? {
              base_rectificada: values.base_rectificada,
              cuota_rectificada: values.cuota_rectificada,
            }
          : {}),
      } satisfies TablesInsert<'invoices'>;

      // Create the rectificativa invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Mark the original invoice as invalid (is_valid = false)
      const { error: invalidateError } = await supabase
        .from('invoices')
        .update({ is_valid: false })
        .eq('id', originalInvoice.id);

      if (invalidateError) {
        console.error('Error invalidating original invoice:', invalidateError);
        // Don't throw - the rectificativa was created successfully
      }

      // Handle payments linked to original invoice.
      // The improved RPC auto-reassigns payments to the new rectificativa when possible,
      // and marks the original invoice's debt as 'refunded' (closed) so it doesn't
      // appear as a normal pending debt.
      const { data: paymentsResult, error: paymentsError } = await supabase
        .rpc('handle_rectificativa_payments', { p_original_invoice_id: originalInvoice.id });

      if (paymentsError) {
        console.error('Error handling payments:', paymentsError);
        toast.warning('Factura rectificativa creada, pero hubo un error al gestionar los pagos previos. Revísalos manualmente.', { duration: 8000 });
      } else if (paymentsResult && typeof paymentsResult === 'object' && 'action' in paymentsResult) {
        const result = paymentsResult as { action: string; message: string };
        if (result.action === 'payments_auto_reassigned') {
          toast.info(result.message, { duration: 6000 });
        } else if (result.action === 'payments_unlinked') {
          toast.warning(result.message + ' Reasígnalos desde la pantalla de cobros.', { duration: 8000 });
        }
      }

      // Get the billable_event_id from the original invoice's items
      const { data: originalItems } = await supabase
        .from('invoice_items')
        .select('billable_event_id')
        .eq('invoice_id', originalInvoice.id)
        .limit(1)
        .maybeSingle();

      const billableEventId = originalItems?.billable_event_id || null;

      // Create invoice item (linking to same billable_event if exists)
      const { error: itemError } = await supabase
        .from('invoice_items')
        .insert({
          invoice_id: invoice.id,
          description: values.description,
          quantity: 1,
          unit_price: baseAmount,
          tax_rate: taxRate,
          tax_name: center.default_tax_name || 'IVA',
          tax_amount: taxAmount,
          retention_rate: retentionRate,
          retention_name: center.retention_name || 'IRPF',
          retention_amount: retentionAmount,
          total: total,
          billable_event_id: billableEventId,
        });

      if (itemError) throw itemError;

      // Increment series next_number
      await supabase
        .from('invoice_series')
        .update({ next_number: series.next_number + 1 })
        .eq('id', series.id);

      // If Verifactu is configured, seal the invoice
      if (center.verifactu_certificate_base64) {
        toast.info('Sellando factura rectificativa con Verifactu...');
        const { data: verifactuData, error: sealError } = await supabase.functions.invoke('sign-invoice-verifactu', {
          body: { invoice_id: invoice.id },
        });

        if (sealError) {
          console.error('Error sealing rectificativa:', sealError);
          toast.warning('Factura creada pero no se pudo sellar con Verifactu');
        } else if (verifactuData?.aeat_unavailable) {
          toast.info(`Factura ${invoiceNumber} emitida. La Agencia Tributaria no está disponible temporalmente. Se reintentará automáticamente.`, {
            duration: 6000,
          });
        } else if (verifactuData?.success) {
          const isTestMode = center?.verifactu_environment === 'test';
          if (isTestMode) {
            toast.success(`Factura rectificativa ${invoiceNumber} creada y sellada (modo pruebas)`);
          } else {
            toast.success(`Factura rectificativa ${invoiceNumber} creada y registrada en AEAT`);
          }
        } else {
          toast.success('Factura rectificativa creada correctamente');
        }
      } else {
        toast.success('Factura rectificativa creada correctamente');
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['debts'] });
      queryClient.invalidateQueries({ queryKey: ['debt-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['payment-stats'] });
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating rectificativa:', error);
      toast.error('Error al crear la factura rectificativa');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!originalInvoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Factura Rectificativa</DialogTitle>
          <DialogDescription>
            Rectificación de la factura {originalInvoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        {rectificativaSeries.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Icon name="warning" className="h-12 w-12 text-amber-500" />
            <div>
              <p className="font-semibold">No hay series de rectificativas</p>
              <p className="text-sm text-muted-foreground mt-1">
                Debes crear una serie de tipo "Rectificativa" en Configuración &gt; Facturación antes de poder emitir facturas rectificativas.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p><strong>Contacto:</strong> {originalInvoice.patients.first_name} {originalInvoice.patients.last_name}</p>
                <p><strong>Factura original:</strong> {originalInvoice.invoice_number}</p>
                <p><strong>Importe original:</strong> {Number(originalInvoice.total).toFixed(2)}€</p>
              </div>

              <FormField
                control={form.control}
                name="rectification_reason_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Motivo de rectificación (Verifactu)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona el motivo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(originalInvoiceType === 'simplified' 
                          ? RECTIFICATION_REASONS_SIMPLIFIED 
                          : RECTIFICATION_REASONS_COMPLETE
                        ).map(reason => (
                          <SelectItem key={reason.code} value={reason.code}>
                            <div className="flex flex-col">
                              <span>{reason.label}</span>
                              <span className="text-xs text-muted-foreground">{reason.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rectification_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de rectificación</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="I">
                          <div className="flex flex-col">
                            <span>I - Por diferencias</span>
                            <span className="text-xs text-muted-foreground">Solo incluye la diferencia a corregir</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="S">
                          <div className="flex flex-col">
                            <span>S - Sustitutiva</span>
                            <span className="text-xs text-muted-foreground">Reemplaza completamente la factura original</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === 'I' 
                        ? 'Incluye solo las diferencias (positivas o negativas) respecto a la factura original'
                        : 'Sustituye completamente la factura original con nuevos importes'
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isSubstitution && (
                <Alert>
                  <Icon name="info" className="h-4 w-4" />
                  <AlertDescription>
                    Para facturas sustitutivas, debes indicar los importes de la factura original que se rectifican (BaseRectificada y CuotaRectificada según Verifactu).
                  </AlertDescription>
                </Alert>
              )}

              {isSubstitution && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="base_rectificada"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base rectificada (€)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Base imponible de la factura original
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cuota_rectificada"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cuota rectificada (€)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" />
                        </FormControl>
                        <FormDescription className="text-xs">
                          IVA de la factura original
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name="series_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serie de facturación</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona serie rectificativa" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rectificativaSeries.map(series => (
                          <SelectItem key={series.id} value={series.id}>
                            {getSeriesDisplayName(series)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Descripción del concepto a rectificar" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Importe (€)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" placeholder="Importe con IVA" />
                    </FormControl>
                    <FormDescription>
                      {isSubstitution 
                        ? 'Nuevo importe total de la factura (sustituye al original)'
                        : 'Usa valores negativos para correcciones a favor del cliente'
                      }
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Notas adicionales..." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />}
                  Crear y Emitir
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
