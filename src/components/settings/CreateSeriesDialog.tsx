import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useInvoiceSeries, useInvoiceSeriesUsage, InvoiceSeries } from '@/hooks/useInvoiceSeries';
import { Icon } from '@/components/ui/icon';

const seriesSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(200),
  format: z.string().min(1, 'El formato es obligatorio').max(200),
  series_type: z.enum(['ordinary', 'rectifying']),
  invoice_type: z.enum(['simplified', 'complete']),
  next_number: z.coerce.number().min(1, 'El número debe ser mayor a 0'),
  is_default: z.boolean(),
});

type SeriesFormValues = z.infer<typeof seriesSchema>;

interface CreateSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSeries: InvoiceSeries | null;
}

export function CreateSeriesDialog({ open, onOpenChange, editingSeries }: CreateSeriesDialogProps) {
  const { createSeries, updateSeries } = useInvoiceSeries();
  const isEditing = !!editingSeries;
  const { data: invoiceCount = 0, isLoading: isUsageLoading } = useInvoiceSeriesUsage(editingSeries?.id);
  const classificationLocked = isEditing && (isUsageLoading || invoiceCount > 0);

  const form = useForm<SeriesFormValues>({
    resolver: zodResolver(seriesSchema),
    defaultValues: {
      name: '',
      format: '{SERIE}-{AAAA}-{NNNNN}',
      series_type: 'ordinary',
      invoice_type: 'complete',
      next_number: 1,
      is_default: false,
    },
  });

  useEffect(() => {
    if (editingSeries) {
      form.reset({
        name: editingSeries.name,
        format: editingSeries.format,
        series_type: editingSeries.series_type,
        invoice_type: editingSeries.invoice_type,
        next_number: editingSeries.next_number,
        is_default: editingSeries.is_default,
      });
    } else {
      form.reset({
        name: '',
        format: '{SERIE}-{AAAA}-{NNNNN}',
        series_type: 'ordinary',
        invoice_type: 'complete',
        next_number: 1,
        is_default: false,
      });
    }
  }, [editingSeries, form]);

  const onSubmit = async (data: SeriesFormValues) => {
    try {
      if (isEditing) {
        await updateSeries.mutateAsync({ id: editingSeries.id, ...data });
      } else {
        await createSeries.mutateAsync({
          name: data.name,
          format: data.format,
          series_type: data.series_type,
          invoice_type: data.invoice_type,
          next_number: data.next_number,
          is_default: data.is_default,
        });
      }
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the hook
    }
  };

  const watchName = form.watch('name');
  const watchFormat = form.watch('format');
  const watchNextNumber = form.watch('next_number');

  const previewNumber = () => {
    const year = new Date().getFullYear();
    const paddedNumber = String(watchNextNumber || 1).padStart(5, '0');
    return watchFormat
      .replace('{SERIE}', watchName || 'A')
      .replace('{AAAA}', String(year))
      .replace('{AA}', String(year).slice(-2))
      .replace('{NNNNN}', paddedNumber)
      .replace('{NNNN}', paddedNumber.slice(-4))
      .replace('{NNN}', paddedNumber.slice(-3));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar serie' : 'Nueva serie de facturación'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modifica los datos de la serie de facturación'
              : 'Crea una nueva serie para organizar la numeración de tus facturas'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre de la serie *</Label>
            <Input
              id="name"
              {...form.register('name')}
              placeholder="A, B, R1..."
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 grid-cols-2">
            {invoiceCount > 0 && (
              <Alert className="col-span-2 border-amber-500/50 bg-amber-500/10">
                <Icon name="warning" className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  Esta serie ya tiene {invoiceCount} {invoiceCount === 1 ? 'factura vinculada' : 'facturas vinculadas'}.
                  Sus tipos fiscal y documental no se pueden cambiar. Si necesitas otra clasificación, archiva esta serie y crea una nueva.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="series_type">Tipo de serie</Label>
              <Select
                value={form.watch('series_type')}
                onValueChange={(value: 'ordinary' | 'rectifying') => form.setValue('series_type', value)}
                disabled={classificationLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ordinary">Ordinaria</SelectItem>
                  <SelectItem value="rectifying">Rectificativa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_type">Tipo de factura</Label>
              <Select
                value={form.watch('invoice_type')}
                onValueChange={(value: 'simplified' | 'complete') => form.setValue('invoice_type', value)}
                disabled={classificationLocked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="complete">Completa</SelectItem>
                  <SelectItem value="simplified">Simplificada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="format">Formato de numeración</Label>
            <Input
              id="format"
              {...form.register('format')}
              placeholder="{SERIE}-{AAAA}-{NNNNN}"
            />
            <p className="text-xs text-muted-foreground">
              Variables: {'{SERIE}'}, {'{AAAA}'} (año 4 dígitos), {'{AA}'} (año 2 dígitos), 
              {'{NNNNN}'} (5 dígitos), {'{NNNN}'} (4 dígitos), {'{NNN}'} (3 dígitos)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_number">Próximo número</Label>
            <Input
              id="next_number"
              type="number"
              min={1}
              {...form.register('next_number')}
            />
          </div>

          {watchName && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">Vista previa:</p>
              <p className="font-mono font-medium">{previewNumber()}</p>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_default"
              checked={form.watch('is_default')}
              onCheckedChange={(checked) => form.setValue('is_default', !!checked)}
            />
            <Label htmlFor="is_default" className="text-sm font-normal">
              Establecer como serie predeterminada
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createSeries.isPending || updateSeries.isPending}
            >
              {(createSeries.isPending || updateSeries.isPending) && (
                <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEditing ? 'Guardar cambios' : 'Crear serie'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
