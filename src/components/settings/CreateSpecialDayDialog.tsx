import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, Info } from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useCenter } from '@/hooks/useCenter';
import { useProfessionals } from '@/hooks/usePatients';
import {
  useCreateSpecialDay,
  useUpdateSpecialDay,
} from '@/hooks/useSpecialDays';
import {
  SPECIAL_DAY_TYPE_DESCRIPTIONS,
  getSpecialDayErrorMessage,
  type SpecialDay,
  type SpecialDayType,
} from '@/lib/special-days';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotSchema = z.object({
  start_time: z.string().regex(timeRegex, 'HH:MM'),
  end_time: z.string().regex(timeRegex, 'HH:MM'),
}).refine((s) => s.end_time > s.start_time, {
  message: 'Fin debe ser posterior al inicio',
  path: ['end_time'],
});

const schema = z.object({
  scope: z.enum(['center', 'professional']),
  professional_id: z.string().optional(),
  type: z.enum(['closed', 'custom', 'extended']),
  start_date: z.date({ required_error: 'Fecha inicio obligatoria' }),
  end_date: z.date({ required_error: 'Fecha fin obligatoria' }),
  label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  affects_public_booking: z.boolean().default(true),
  slots: z.array(slotSchema).default([]),
}).refine((data) => {
  if (data.scope === 'professional' && !data.professional_id) return false;
  return true;
}, { message: 'Selecciona un profesional', path: ['professional_id'] }).refine((data) => {
  return data.end_date >= data.start_date;
}, { message: 'Fecha fin no puede ser anterior al inicio', path: ['end_date'] }).refine((data) => {
  if (data.type === 'closed') return true;
  return data.slots.length > 0;
}, { message: 'Añade al menos un tramo horario', path: ['slots'] });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editSpecialDay?: SpecialDay | null;
}

export function CreateSpecialDayDialog({ open, onOpenChange, editSpecialDay }: Props) {
  const { user } = useAuth();
  const { center } = useCenter();
  const { data: professionals } = useProfessionals();
  const createSpecialDay = useCreateSpecialDay();
  const updateSpecialDay = useUpdateSpecialDay();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      scope: 'center',
      type: 'closed',
      affects_public_booking: true,
      slots: [],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'slots' });

  const watchScope = form.watch('scope');
  const watchType = form.watch('type');
  const watchStartDate = form.watch('start_date');

  useEffect(() => {
    const sub = form.watch(() => setConflictWarning(null));
    return () => sub.unsubscribe();
  }, [form]);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setConflictWarning(null);
    if (editSpecialDay) {
      form.reset({
        scope: editSpecialDay.scope,
        professional_id: editSpecialDay.professional_id || undefined,
        type: editSpecialDay.type,
        start_date: new Date(editSpecialDay.start_date + 'T00:00:00'),
        end_date: new Date(editSpecialDay.end_date + 'T00:00:00'),
        label: editSpecialDay.label || undefined,
        notes: editSpecialDay.notes || undefined,
        affects_public_booking: editSpecialDay.affects_public_booking,
        slots: (editSpecialDay.special_day_slots || []).map((s) => ({
          start_time: s.start_time.slice(0, 5),
          end_time: s.end_time.slice(0, 5),
        })),
      });
    } else {
      form.reset({
        scope: 'center',
        type: 'closed',
        affects_public_booking: true,
        start_date: new Date(),
        end_date: new Date(),
        slots: [],
      });
    }
  }, [open, editSpecialDay, form]);

  const fetchSessionConflicts = async (values: FormValues): Promise<SessionConflict[]> => {
    if (values.type === 'extended') return [];

    const startStr = format(values.start_date, 'yyyy-MM-dd');
    const endStr = format(values.end_date, 'yyyy-MM-dd');

    let query = supabase
      .from('sessions')
      .select('id, session_date, start_time, end_time')
      .eq('center_id', center!.id)
      .gte('session_date', startStr)
      .lte('session_date', endStr)
      .in('status', ACTIVE_SESSION_STATUSES as unknown as string[]);

    if (values.scope === 'professional' && values.professional_id) {
      query = query.eq('professional_id', values.professional_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []) as SessionConflict[];
    if (values.type === 'closed') return rows;

    return rows.filter((s) => {
      const sStart = s.start_time.slice(0, 5);
      const sEnd = s.end_time.slice(0, 5);
      return !values.slots.some(
        (slot) => slot.start_time <= sStart && slot.end_time >= sEnd,
      );
    });
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitError(null);

    if (!conflictWarning) {
      setIsCheckingConflicts(true);
      try {
        const conflicts = await fetchSessionConflicts(values);
        if (conflicts.length > 0) {
          setConflictWarning({
            total: conflicts.length,
            samples: conflicts.slice(0, 3),
          });
          return;
        }
      } catch (err) {
        console.warn('No se pudieron comprobar conflictos con sesiones', err);
      } finally {
        setIsCheckingConflicts(false);
      }
    }

    const payload = {
      center_id: center!.id,
      scope: values.scope,
      professional_id: values.scope === 'professional' ? values.professional_id! : null,
      type: values.type as SpecialDayType,
      start_date: format(values.start_date, 'yyyy-MM-dd'),
      end_date: format(values.end_date, 'yyyy-MM-dd'),
      label: values.label || null,
      notes: values.notes || null,
      affects_public_booking: values.affects_public_booking,
      created_by: user?.id || null,
      slots: values.type === 'closed' ? [] : values.slots.map((s) => ({
        start_time: `${s.start_time}:00`,
        end_time: `${s.end_time}:00`,
      })),
    };

    try {
      if (editSpecialDay) {
        await updateSpecialDay.mutateAsync({ id: editSpecialDay.id, ...payload });
      } else {
        await createSpecialDay.mutateAsync(payload);
      }
      onOpenChange(false);
    } catch (err: unknown) {
      setSubmitError(getSpecialDayErrorMessage(err, 'Error al guardar.'));
    }
  };

  const isPending = createSpecialDay.isPending || updateSpecialDay.isPending || isCheckingConflicts;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editSpecialDay ? 'Editar día especial' : 'Nuevo día especial'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
            {/* Scope */}
            <FormField control={form.control} name="scope" render={({ field }) => (
              <FormItem>
                <FormLabel>Alcance</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="center">Todo el centro</SelectItem>
                    <SelectItem value="professional">Profesional específico</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {watchScope === 'professional' && (
              <FormField control={form.control} name="professional_id" render={({ field }) => (
                <FormItem>
                  <FormLabel>Profesional</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger></FormControl>
                    <SelectContent>
                      {professionals?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Type */}
            <FormField control={form.control} name="type" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="closed">Cerrado</SelectItem>
                    <SelectItem value="custom">Horario personalizado</SelectItem>
                    <SelectItem value="extended">Horario ampliado</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {SPECIAL_DAY_TYPE_DESCRIPTIONS[field.value as SpecialDayType]}
                </p>
                <FormMessage />
              </FormItem>
            )} />

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="start_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha inicio</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                          {field.value ? format(field.value, 'dd/MM/yyyy') : 'Seleccionar'}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(d) => {
                          field.onChange(d);
                          const endVal = form.getValues('end_date');
                          if (d && (!endVal || d > endVal)) form.setValue('end_date', d);
                        }}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="end_date" render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha fin</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button variant="outline" className={cn('w-full pl-3 text-left font-normal', !field.value && 'text-muted-foreground')}>
                          {field.value ? format(field.value, 'dd/MM/yyyy') : 'Seleccionar'}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(d) => watchStartDate ? d < watchStartDate : false}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* Slots (hidden when closed) */}
            {watchType !== 'closed' && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-sm">Tramos horarios</FormLabel>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => append({ start_time: '09:00', end_time: '14:00' })}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />Añadir tramo
                  </Button>
                </div>

                {fields.length === 0 && (
                  <p className="text-xs text-muted-foreground">Sin tramos. Añade al menos uno.</p>
                )}

                {fields.map((f, idx) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <FormField control={form.control} name={`slots.${idx}.start_time`} render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl><Input type="time" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <span className="mt-2 text-muted-foreground text-xs">—</span>
                    <FormField control={form.control} name={`slots.${idx}.end_time`} render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl><Input type="time" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive shrink-0"
                      onClick={() => remove(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                {form.formState.errors.slots?.message && (
                  <p className="text-xs text-destructive">{form.formState.errors.slots.message as string}</p>
                )}
              </div>
            )}

            {/* Label */}
            <FormField control={form.control} name="label" render={({ field }) => (
              <FormItem>
                <FormLabel>Etiqueta (opcional)</FormLabel>
                <FormControl><Input placeholder="Ej: Puente de diciembre" {...field} /></FormControl>
              </FormItem>
            )} />

            {/* Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem>
                <FormLabel>Notas internas (opcional)</FormLabel>
                <FormControl><Textarea placeholder="Notas..." rows={2} {...field} /></FormControl>
              </FormItem>
            )} />

            {/* affects_public_booking */}
            <FormField control={form.control} name="affects_public_booking" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <FormLabel className="!mt-0">Aplicar a reservas públicas</FormLabel>
                  <p className="text-xs text-muted-foreground">
                    Si se desactiva, el horario solo afecta a la agenda interna y no a los portales públicos.
                  </p>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />

            {conflictWarning && (
              <Alert variant="destructive">
                <AlertDescription>
                  <p>
                    {conflictWarning.total === 1
                      ? 'Hay 1 sesión existente '
                      : `Hay ${conflictWarning.total} sesiones existentes `}
                    en el rango{watchType === 'custom' ? ' que no encaja en los tramos definidos' : ''}.
                    No se cancelarán automáticamente.
                  </p>
                  {conflictWarning.samples.length > 0 && (
                    <ul className="mt-2 text-xs list-disc list-inside space-y-0.5">
                      {conflictWarning.samples.map((s) => (
                        <li key={s.id}>
                          {s.session_date} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                        </li>
                      ))}
                      {conflictWarning.total > conflictWarning.samples.length && (
                        <li>… y {conflictWarning.total - conflictWarning.samples.length} más</li>
                      )}
                    </ul>
                  )}
                  <p className="mt-2 text-xs">
                    Revisa la agenda antes de continuar o pulsa "Crear de todos modos" para guardar igualmente.
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                type="submit"
                disabled={isPending}
                variant={conflictWarning ? 'destructive' : 'default'}
              >
                {conflictWarning
                  ? 'Crear de todos modos'
                  : editSpecialDay
                    ? 'Guardar cambios'
                    : 'Crear día especial'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
