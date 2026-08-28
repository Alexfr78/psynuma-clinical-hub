import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useForm } from 'react-hook-form';
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
import { useCreateScheduleException, useUpdateScheduleException, useConflictingSessions } from '@/hooks/useScheduleExceptions';
import { ScheduleException } from '@/lib/schedule-exceptions';
import { Icon } from '@/components/ui/icon';

const REASON_OPTIONS = [
  { value: 'holiday', label: 'Festivo' },
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'sick_leave', label: 'Baja médica' },
  { value: 'training', label: 'Formación' },
  { value: 'closure', label: 'Cierre' },
  { value: 'other', label: 'Otro' },
];

const schema = z.object({
  scope: z.enum(['center', 'professional']),
  professional_id: z.string().optional(),
  start_date: z.date({ required_error: 'Fecha inicio obligatoria' }),
  end_date: z.date({ required_error: 'Fecha fin obligatoria' }),
  all_day: z.boolean().default(true),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  reason_type: z.string().min(1),
  reason_label: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  affects_booking: z.boolean().default(true),
}).refine((data) => {
  if (data.scope === 'professional' && !data.professional_id) return false;
  return true;
}, { message: 'Selecciona un profesional', path: ['professional_id'] });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editException?: ScheduleException | null;
}

export function CreateScheduleExceptionDialog({ open, onOpenChange, editException }: Props) {
  const { user } = useAuth();
  const { center } = useCenter();
  const { data: professionals } = useProfessionals();
  const createException = useCreateScheduleException();
  const updateException = useUpdateScheduleException();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      scope: 'center',
      all_day: true,
      reason_type: 'holiday',
      affects_booking: true,
    },
  });

  const watchScope = form.watch('scope');
  const watchAllDay = form.watch('all_day');
  const watchStartDate = form.watch('start_date');
  const watchEndDate = form.watch('end_date');
  const watchProfessionalId = form.watch('professional_id');

  // Fetch conflicting sessions
  const startDateStr = watchStartDate ? format(watchStartDate, 'yyyy-MM-dd') : undefined;
  const endDateStr = watchEndDate ? format(watchEndDate, 'yyyy-MM-dd') : undefined;
  const { data: conflictingSessions } = useConflictingSessions(
    center?.id,
    startDateStr,
    endDateStr,
    watchScope === 'professional' ? watchProfessionalId : undefined,
    open && !!watchStartDate && !!watchEndDate
  );

  useEffect(() => {
    if (open && editException) {
      form.reset({
        scope: editException.scope,
        professional_id: editException.professional_id || undefined,
        start_date: new Date(editException.start_date + 'T00:00:00'),
        end_date: new Date(editException.end_date + 'T00:00:00'),
        all_day: editException.all_day,
        start_time: editException.start_time?.slice(0, 5) || undefined,
        end_time: editException.end_time?.slice(0, 5) || undefined,
        reason_type: editException.reason_type,
        reason_label: editException.reason_label || undefined,
        notes: editException.notes || undefined,
        affects_booking: editException.affects_booking,
      });
    } else if (open) {
      form.reset({
        scope: 'center',
        all_day: true,
        reason_type: 'holiday',
        affects_booking: true,
        start_date: new Date(),
        end_date: new Date(),
      });
    }
  }, [open, editException, form]);

  const onSubmit = async (values: FormValues) => {
    const payload = {
      center_id: center!.id,
      scope: values.scope as 'center' | 'professional',
      professional_id: values.scope === 'professional' ? values.professional_id! : null,
      start_date: format(values.start_date, 'yyyy-MM-dd'),
      end_date: format(values.end_date, 'yyyy-MM-dd'),
      all_day: values.all_day,
      start_time: !values.all_day ? values.start_time || null : null,
      end_time: !values.all_day ? values.end_time || null : null,
      reason_type: values.reason_type as ScheduleException['reason_type'],
      reason_label: values.reason_label || null,
      notes: values.notes || null,
      affects_booking: values.affects_booking,
      created_by: user?.id || null,
    };

    if (editException) {
      await updateException.mutateAsync({ id: editException.id, ...payload });
    } else {
      await createException.mutateAsync(payload);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editException ? 'Editar bloqueo' : 'Nuevo bloqueo de disponibilidad'}</DialogTitle>
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

            {/* Professional (conditional) */}
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
                          <Icon name="calendar_month" className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={(d) => { field.onChange(d); if (d && (!watchEndDate || d > watchEndDate)) form.setValue('end_date', d); }} className="p-3 pointer-events-auto" />
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
                          <Icon name="calendar_month" className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={field.value} onSelect={field.onChange} disabled={(d) => watchStartDate ? d < watchStartDate : false} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* All day toggle */}
            <FormField control={form.control} name="all_day" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <FormLabel className="!mt-0">Todo el día</FormLabel>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />

            {/* Time range (if not all day) */}
            {!watchAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="start_time" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora inicio</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="end_time" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora fin</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
            )}

            {/* Reason */}
            <FormField control={form.control} name="reason_type" render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    {REASON_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            {/* Custom label */}
            <FormField control={form.control} name="reason_label" render={({ field }) => (
              <FormItem>
                <FormLabel>Etiqueta personalizada (opcional)</FormLabel>
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

            {/* Affects booking */}
            <FormField control={form.control} name="affects_booking" render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <FormLabel className="!mt-0">Bloquear nuevas citas</FormLabel>
                  <p className="text-xs text-muted-foreground">Impide agendar citas en este periodo</p>
                </div>
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
              </FormItem>
            )} />

            {/* Conflict warning */}
            {conflictingSessions && conflictingSessions.length > 0 && (
              <Alert variant="destructive">
                <Icon name="warning" className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium mb-1">Hay {conflictingSessions.length} cita(s) en este rango:</p>
                  <ul className="text-xs space-y-0.5 max-h-24 overflow-y-auto">
                    {conflictingSessions.slice(0, 5).map((s: any) => (
                      <li key={s.id}>
                        {s.session_date} {s.start_time?.slice(0, 5)} — {s.patient?.first_name} {s.patient?.last_name}
                      </li>
                    ))}
                    {conflictingSessions.length > 5 && <li>...y {conflictingSessions.length - 5} más</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={createException.isPending || updateException.isPending}>
                {editException ? 'Guardar cambios' : 'Crear bloqueo'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
