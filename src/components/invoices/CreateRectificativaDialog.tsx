import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { useInvoiceSeries } from '@/hooks/useInvoiceSeries';
import type { InvoiceWithPatient } from '@/hooks/useInvoices';

interface CreateRectificativaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalInvoice: InvoiceWithPatient | null;
}

const formSchema = z.object({
  rectification_type: z.enum(['I', 'S'], {
    required_error: 'Selecciona el tipo de rectificación',
  }),
  series_id: z.string().min(1, 'Selecciona una serie'),
  description: z.string().min(1, 'Añade una descripción'),
  amount: z.coerce.number(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateRectificativaDialog({
  open,
  onOpenChange,
  originalInvoice,
}: CreateRectificativaDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { center } = useCenter();
  const { rectifyingSeries } = useInvoiceSeries();

  // Use the pre-filtered rectifying series
  const rectificativaSeries = rectifyingSeries?.filter(s => !s.is_archived) || [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      rectification_type: 'I',
      series_id: '',
      description: '',
      amount: 0,
      notes: '',
    },
  });

  // Reset form when dialog opens with new invoice
  useEffect(() => {
    if (open && originalInvoice) {
      const defaultSeries = rectificativaSeries.find(s => s.is_default) || rectificativaSeries[0];
      form.reset({
        rectification_type: 'I',
        series_id: defaultSeries?.id || '',
        description: `Rectificación de factura ${originalInvoice.invoice_number}`,
        amount: -Number(originalInvoice.total),
        notes: '',
      });
    }
  }, [open, originalInvoice, rectificativaSeries.length]);

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

      // Create the rectificativa invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          center_id: center.id,
          patient_id: originalInvoice.patient_id,
          invoice_number: invoiceNumber,
          series_id: values.series_id,
          status: 'issued',
          issue_date: new Date().toISOString().split('T')[0],
          subtotal: baseAmount,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          retention_rate: retentionRate,
          retention_amount: retentionAmount,
          total: total,
          rectified_invoice_id: originalInvoice.id,
          rectification_type: values.rectification_type,
          notes: values.notes || `Rectificación tipo ${values.rectification_type === 'I' ? 'por diferencias' : 'sustitutiva'} de ${originalInvoice.invoice_number}`,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice item
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
        const { error: sealError } = await supabase.functions.invoke('sign-invoice-verifactu', {
          body: { invoice_id: invoice.id },
        });

        if (sealError) {
          console.error('Error sealing rectificativa:', sealError);
          toast.warning('Factura creada pero no se pudo sellar con Verifactu');
        } else {
          toast.success('Factura rectificativa creada y sellada con Verifactu');
        }
      } else {
        toast.success('Factura rectificativa creada correctamente');
      }

      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Crear Factura Rectificativa</DialogTitle>
          <DialogDescription>
            Rectificación de la factura {originalInvoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        {rectificativaSeries.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
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
                <p><strong>Paciente:</strong> {originalInvoice.patients.first_name} {originalInvoice.patients.last_name}</p>
                <p><strong>Factura original:</strong> {originalInvoice.invoice_number}</p>
                <p><strong>Importe original:</strong> {Number(originalInvoice.total).toFixed(2)}€</p>
              </div>

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
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="series_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Serie de facturación</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona serie" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {rectificativaSeries.map(series => (
                          <SelectItem key={series.id} value={series.id}>
                            {series.name} ({series.format})
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
                    <p className="text-xs text-muted-foreground">
                      Usa valores negativos para correcciones a favor del cliente
                    </p>
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
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
