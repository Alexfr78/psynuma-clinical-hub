import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreateSession } from '@/hooks/useSessions';
import { usePatients, useProfessionals } from '@/hooks/usePatients';
import { useAuth } from '@/hooks/useAuth';
import { usePatientActiveBonos, useDeductBonoSession } from '@/hooks/useBonos';

const sessionSchema = z.object({
  patient_id: z.string().uuid('Selecciona un paciente'),
  professional_id: z.string().uuid('Selecciona un profesional'),
  session_date: z.date({ required_error: 'Selecciona una fecha' }),
  start_time: z.string().min(1, 'Selecciona hora de inicio'),
  end_time: z.string().min(1, 'Selecciona hora de fin'),
  session_type: z.string().optional(),
  price: z.coerce.number().min(0, 'El precio debe ser positivo'),
  notes: z.string().max(1000).optional(),
  status: z.string().default('scheduled'),
  bono_id: z.string().optional(),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  initialTime?: string;
}

const TIME_SLOTS = Array.from({ length: 25 }, (_, i) => {
  const hour = Math.floor(i / 2) + 8;
  const minutes = i % 2 === 0 ? '00' : '30';
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
}).filter((t) => t <= '20:30');

export function CreateSessionDialog({
  open,
  onOpenChange,
  initialDate,
  initialTime,
}: CreateSessionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const createSession = useCreateSession();
  const deductBonoSession = useDeductBonoSession();
  const { data: patients } = usePatients();
  const { data: professionals } = useProfessionals();

  const form = useForm<SessionFormValues>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      patient_id: '',
      professional_id: user?.id || '',
      session_date: initialDate || new Date(),
      start_time: initialTime || '09:00',
      end_time: initialTime ? calculateEndTime(initialTime) : '10:00',
      session_type: 'individual',
      price: 60,
      notes: '',
      status: 'scheduled',
      bono_id: '',
    },
  });

  const watchPatientId = form.watch('patient_id');
  const watchBonoId = form.watch('bono_id');
  const { data: patientBonos } = usePatientActiveBonos(watchPatientId || undefined);

  // When bono is selected, set price to 0
  useEffect(() => {
    if (watchBonoId && watchBonoId !== 'none') {
      form.setValue('price', 0);
    }
  }, [watchBonoId, form]);

  useEffect(() => {
    if (initialDate) {
      form.setValue('session_date', initialDate);
    }
    if (initialTime) {
      form.setValue('start_time', initialTime);
      form.setValue('end_time', calculateEndTime(initialTime));
    }
  }, [initialDate, initialTime, form]);

  function calculateEndTime(startTime: string): string {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endHour = hours + 1;
    return `${endHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  const onSubmit = async (values: SessionFormValues) => {
    try {
      const sessionData = {
        patient_id: values.patient_id,
        professional_id: values.professional_id,
        session_date: format(values.session_date, 'yyyy-MM-dd'),
        start_time: values.start_time,
        end_time: values.end_time,
        session_type: values.session_type || 'individual',
        price: values.price,
        notes: values.notes || null,
        status: values.status as 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
        bono_id: values.bono_id && values.bono_id !== 'none' ? values.bono_id : null,
      };

      const newSession = await createSession.mutateAsync(sessionData);

      // If bono was used, deduct a session
      if (values.bono_id && values.bono_id !== 'none' && newSession?.id) {
        await deductBonoSession.mutateAsync({
          bonoId: values.bono_id,
          sessionId: newSession.id,
        });
      }

      toast({
        title: 'Sesión creada',
        description: values.bono_id && values.bono_id !== 'none' 
          ? 'Sesión programada y descontada del bono.'
          : 'La sesión se ha programado correctamente.',
      });

      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear la sesión. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nueva Sesión</DialogTitle>
          <DialogDescription>
            Programa una nueva sesión con un paciente.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paciente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar paciente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {patients?.map((patient) => (
                        <SelectItem key={patient.id} value={patient.id}>
                          {patient.first_name} {patient.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bono selection - only show if patient has active bonos */}
            {watchPatientId && patientBonos && patientBonos.length > 0 && (
              <FormField
                control={form.control}
                name="bono_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Usar bono
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar bono (opcional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No usar bono</SelectItem>
                        {patientBonos.map((bono) => (
                          <SelectItem key={bono.id} value={bono.id}>
                            <span className="flex items-center gap-2">
                              {bono.name}
                              <Badge variant="secondary" className="ml-2">
                                {bono.total_sessions - bono.used_sessions} restantes
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {field.value && field.value !== 'none' && (
                      <p className="text-xs text-muted-foreground">
                        El precio se establecerá a 0€ al usar el bono
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="professional_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profesional *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar profesional" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {professionals?.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.first_name} {prof.last_name}
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
              name="session_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Fecha *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: es })
                          ) : (
                            <span>Seleccionar fecha</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora inicio *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
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
                name="end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora fin *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="session_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de sesión</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="individual">Individual</SelectItem>
                        <SelectItem value="pareja">Pareja</SelectItem>
                        <SelectItem value="familia">Familia</SelectItem>
                        <SelectItem value="grupo">Grupo</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio (€) *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min={0} 
                        step={0.01} 
                        {...field} 
                        disabled={watchBonoId && watchBonoId !== 'none'}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="scheduled">Programada</SelectItem>
                      <SelectItem value="confirmed">Confirmada</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observaciones sobre la sesión..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createSession.isPending}>
                {createSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Sesión
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
