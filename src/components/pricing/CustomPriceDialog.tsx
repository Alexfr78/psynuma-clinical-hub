import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Info, Tag } from 'lucide-react';
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
  FormDescription,
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
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { useBonoTemplates } from '@/hooks/useBonos';
import {
  useCreateCustomPrice,
  useUpdateCustomPrice,
  type CustomPrice,
  type CustomPriceTargetType,
} from '@/hooks/useCustomPrices';

// ── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  target_type: z.enum(['session_type', 'bono_template'], {
    required_error: 'Selecciona el tipo',
  }),
  target_id: z.string().uuid('Selecciona un servicio o bono'),
  custom_price: z.coerce
    .number({ invalid_type_error: 'Introduce un precio válido' })
    .min(0, 'El precio no puede ser negativo'),
  start_date: z.date({ required_error: 'Selecciona fecha de inicio' }),
  end_date: z.date().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

// ── Props ─────────────────────────────────────────────────────────────────────

interface CustomPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** Si se pasa, es modo edición */
  existingPrice?: CustomPrice;
  /** Pre-selecciona el tipo al abrir (útil desde ficha de servicio/bono) */
  defaultTargetType?: CustomPriceTargetType;
  defaultTargetId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CustomPriceDialog({
  open,
  onOpenChange,
  patientId,
  existingPrice,
  defaultTargetType,
  defaultTargetId,
}: CustomPriceDialogProps) {
  const { data: sessionTypes } = useSessionTypes();
  const { data: bonoTemplates } = useBonoTemplates();
  const createPrice = useCreateCustomPrice();
  const updatePrice = useUpdateCustomPrice();

  const [basePrice, setBasePrice] = useState<number | null>(null);
  const isEditing = !!existingPrice;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      target_type: (existingPrice?.target_type ?? defaultTargetType) || 'session_type',
      target_id: existingPrice?.target_id ?? defaultTargetId ?? '',
      custom_price: existingPrice?.custom_price ?? 0,
      start_date: existingPrice?.start_date ? new Date(existingPrice.start_date + 'T00:00:00') : new Date(),
      end_date: existingPrice?.end_date ? new Date(existingPrice.end_date + 'T00:00:00') : null,
      notes: existingPrice?.notes ?? '',
    },
  });

  const watchTargetType = form.watch('target_type');
  const watchTargetId = form.watch('target_id');

  // Actualizar precio base cuando cambia el target
  useEffect(() => {
    if (!watchTargetId) {
      setBasePrice(null);
      return;
    }
    if (watchTargetType === 'session_type') {
      const st = sessionTypes?.find(s => s.id === watchTargetId);
      setBasePrice(st?.default_price ?? null);
      if (st && !isEditing) form.setValue('custom_price', st.default_price);
    } else {
      const bt = bonoTemplates?.find(b => b.id === watchTargetId);
      setBasePrice(bt ? Number(bt.total_price) : null);
      if (bt && !isEditing) form.setValue('custom_price', Number(bt.total_price));
    }
  }, [watchTargetType, watchTargetId, sessionTypes, bonoTemplates, form, isEditing]);

  // Limpiar target_id al cambiar tipo
  const prevTargetType = form.getValues('target_type');
  useEffect(() => {
    if (prevTargetType !== watchTargetType && !existingPrice) {
      form.setValue('target_id', '');
      setBasePrice(null);
    }
  }, [watchTargetType]);

  const onSubmit = async (values: FormValues) => {
    const startIso = format(values.start_date, 'yyyy-MM-dd');
    const endIso = values.end_date ? format(values.end_date, 'yyyy-MM-dd') : null;

    if (isEditing && existingPrice) {
      await updatePrice.mutateAsync({
        id: existingPrice.id,
        custom_price: values.custom_price,
        start_date: startIso,
        end_date: endIso,
        notes: values.notes || null,
      });
    } else {
      await createPrice.mutateAsync({
        patient_id: patientId,
        target_type: values.target_type,
        target_id: values.target_id,
        custom_price: values.custom_price,
        start_date: startIso,
        end_date: endIso,
        notes: values.notes || null,
      });
    }
    onOpenChange(false);
    form.reset();
  };

  const isPending = createPrice.isPending || updatePrice.isPending;

  // Opciones según tipo seleccionado
  const targetOptions =
    watchTargetType === 'session_type'
      ? (sessionTypes ?? []).filter(s => s.is_active !== false).map(s => ({
          id: s.id,
          label: s.name,
          price: s.default_price,
        }))
      : (bonoTemplates ?? []).filter(b => b.is_active !== false).map(b => ({
          id: b.id,
          label: b.name,
          price: Number(b.total_price),
        }));

  const watchCustomPrice = form.watch('custom_price');
  const discount =
    basePrice != null && watchCustomPrice != null && basePrice > 0
      ? ((basePrice - watchCustomPrice) / basePrice) * 100
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-emerald-600" />
            {isEditing ? 'Editar tarifa personalizada' : 'Nueva tarifa personalizada'}
          </DialogTitle>
          <DialogDescription>
            Define el precio especial que se aplicará automáticamente a este paciente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Tipo */}
            <FormField
              control={form.control}
              name="target_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="session_type">Tipo de sesión / Servicio</SelectItem>
                      <SelectItem value="bono_template">Plantilla de bono</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Servicio / Bono */}
            <FormField
              control={form.control}
              name="target_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {watchTargetType === 'session_type' ? 'Servicio' : 'Plantilla de bono'}
                  </FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {targetOptions.map(opt => (
                        <SelectItem key={opt.id} value={opt.id}>
                          <span className="flex items-center justify-between w-full gap-4">
                            <span>{opt.label}</span>
                            <span className="text-muted-foreground text-xs">{opt.price.toFixed(2)} €</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Precio base (informativo) */}
            {basePrice != null && (
              <Alert className="py-2 bg-muted/50">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Tarifa general actual:{' '}
                  <strong>{basePrice.toFixed(2)} €</strong>
                  {discount != null && Math.abs(discount) > 0.01 && (
                    <span className={cn('ml-2 font-medium', discount > 0 ? 'text-emerald-600' : 'text-red-500')}>
                      ({discount > 0 ? '-' : '+'}{Math.abs(discount).toFixed(1)}%)
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Precio personalizado */}
            <FormField
              control={form.control}
              name="custom_price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tarifa personalizada (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder="0.00"
                      {...field}
                      className="text-lg font-semibold"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Rango de vigencia */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha inicio *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value
                              ? format(field.value, 'dd/MM/yyyy')
                              : 'Seleccionar'}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Fecha fin (opcional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? format(field.value, 'dd/MM/yyyy') : 'Indefinida'}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value ?? undefined}
                          onSelect={(d) => field.onChange(d ?? null)}
                          initialFocus
                          locale={es}
                          disabled={(date) => {
                            const start = form.getValues('start_date');
                            return start ? date < start : false;
                          }}
                        />
                        {field.value && (
                          <div className="p-2 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-muted-foreground"
                              onClick={() => field.onChange(null)}
                            >
                              Quitar fecha fin (indefinida)
                            </Button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                    <FormDescription className="text-xs">
                      Sin fecha fin = vigente indefinidamente
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Notas */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ej: Precio acordado en contrato de aseguradora..."
                      className="resize-none"
                      rows={2}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Crear tarifa'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
