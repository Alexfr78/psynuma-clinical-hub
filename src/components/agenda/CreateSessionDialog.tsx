import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, Loader2, Package, Mail, Phone, MessageSquare, Plus, CreditCard, Settings2, MapPin, Clock } from 'lucide-react';
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
  FormDescription,
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
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreateSession } from '@/hooks/useSessions';
import { useQueryClient } from '@tanstack/react-query';
import { usePatients, useProfessionals } from '@/hooks/usePatients';
import { useAuth } from '@/hooks/useAuth';
import { usePatientActiveBonos, useDeductBonoSession } from '@/hooks/useBonos';

import { sendSessionNotificationDirect, WhatsAppDialogData } from '@/hooks/useSendSessionNotification';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { SessionNotificationSettings } from './SessionNotificationSettings';
import { WhatsAppLinkDialog } from './WhatsAppLinkDialog';
import { useCenter } from '@/hooks/useCenter';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';

const PAYMENT_MODE_OPTIONS = [
  { value: '__default__', label: 'Usar predeterminado del centro', icon: Settings2 },
  { value: 'required_now', label: 'Pago obligatorio (antes de confirmar)', icon: CreditCard },
  { value: 'in_session', label: 'Pago en sesión', icon: MapPin },
  { value: 'post_session', label: 'Pago post-sesión', icon: CalendarIcon },
  { value: 'scheduled_before', label: 'Programado (X horas antes)', icon: Clock },
];

const sessionSchema = z.object({
  patient_id: z.string().uuid('Selecciona un contacto'),
  professional_id: z.string().uuid('Selecciona un profesional'),
  session_date: z.date({ required_error: 'Selecciona una fecha' }),
  start_time: z.string().min(1, 'Selecciona hora de inicio'),
  end_time: z.string().min(1, 'Selecciona hora de fin'),
  session_type: z.string().optional(),
  price: z.coerce.number().min(0, 'El precio debe ser positivo'),
  notes: z.string().max(1000).optional(),
  status: z.string().default('scheduled'),
  bono_id: z.string().optional(),
  payment_mode: z.string().optional(),
  // Immediate notifications
  notify_whatsapp: z.boolean().default(false),
  notify_email: z.boolean().default(false),
  notify_sms: z.boolean().default(false),
  // Reminders
  send_reminder_email: z.boolean().default(true),
  send_reminder_sms: z.boolean().default(false),
  send_reminder_whatsapp: z.boolean().default(false),
});

type SessionFormValues = z.infer<typeof sessionSchema>;

interface CreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  initialTime?: string;
}

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
  const { user, profile } = useAuth();
  const createSession = useCreateSession();
  const deductBonoSession = useDeductBonoSession();
  
  const { data: patients } = usePatients();
  const { data: professionals } = useProfessionals();
  const { center } = useCenter();
  const { isAutomatic } = useWhatsAppDelivery();
  const queryClient = useQueryClient();
  const [showCreateBonoDialog, setShowCreateBonoDialog] = useState(false);
  // Track newly created bono and its price
  const [newlyCreatedBonoId, setNewlyCreatedBonoId] = useState<string | null>(null);
  const [newlyCreatedBonoPrice, setNewlyCreatedBonoPrice] = useState<number | null>(null);
  // WhatsApp dialog state
  const [whatsappDialogData, setWhatsappDialogData] = useState<WhatsAppDialogData | null>(null);

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
      payment_mode: '__default__',
      notify_whatsapp: false,
      notify_email: false,
      notify_sms: false,
      send_reminder_email: true,
      send_reminder_sms: false,
      send_reminder_whatsapp: false,
    },
  });

  const watchPatientId = form.watch('patient_id');
  const watchBonoId = form.watch('bono_id');
  const { data: patientBonos, refetch: refetchBonos } = usePatientActiveBonos(watchPatientId || undefined);

  // Bono selection no longer changes session price - bono is billed separately

  // Auto-select first active bono when patient has bonos available
  useEffect(() => {
    if (patientBonos && patientBonos.length > 0 && watchPatientId) {
      const currentBono = form.getValues('bono_id');
      if (!currentBono || currentBono === 'none' || currentBono === '') {
        form.setValue('bono_id', patientBonos[0].id);
      }
    } else if (watchPatientId) {
      form.setValue('bono_id', 'none');
    }
  }, [patientBonos, watchPatientId, form]);
  
  // Clear new bono tracking when bono selection changes to something else
  useEffect(() => {
    if (watchBonoId !== newlyCreatedBonoId) {
      setNewlyCreatedBonoId(null);
      setNewlyCreatedBonoPrice(null);
    }
  }, [watchBonoId, newlyCreatedBonoId]);

  useEffect(() => {
    if (initialDate) {
      form.setValue('session_date', initialDate);
    }
    if (initialTime) {
      form.setValue('start_time', initialTime);
      form.setValue('end_time', calculateEndTime(initialTime));
    }
  }, [initialDate, initialTime, form]);

  // Auto-enable WhatsApp notification when center has automatic delivery
  useEffect(() => {
    if (open && isAutomatic) {
      form.setValue('notify_whatsapp', true);
    }
  }, [open, isAutomatic, form]);

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
        send_reminder_email: values.send_reminder_email,
        send_reminder_sms: values.send_reminder_sms,
        send_reminder_whatsapp: values.send_reminder_whatsapp,
      };

      const newSession = await createSession.mutateAsync(sessionData);
      const patient = patients?.find(p => p.id === values.patient_id);
      const professional = professionals?.find(p => p.id === values.professional_id);

      // If bono was used, deduct a session
      if (values.bono_id && values.bono_id !== 'none' && newSession?.id) {
        await deductBonoSession.mutateAsync({
          bonoId: values.bono_id,
          sessionId: newSession.id,
        });
      }

      // Reminders are handled automatically by the cron-based send-session-reminders edge function

      // Send immediate notifications if any are enabled
      const hasNotifications = values.notify_whatsapp || values.notify_email || values.notify_sms;
      let notificationResult;
      if (hasNotifications && newSession?.id && patient) {
        notificationResult = await sendSessionNotificationDirect({
          patientId: values.patient_id,
          patientName: `${patient.first_name} ${patient.last_name}`,
          patientPhone: patient.phone,
          patientEmail: patient.email,
          sessionId: newSession.id,
          sessionDate: format(values.session_date, 'dd/MM/yyyy'),
          sessionTime: values.start_time,
          professionalName: professional ? `${professional.first_name} ${professional.last_name}` : undefined,
          sessionType: values.session_type,
          type: 'notification',
          channels: {
            whatsapp: values.notify_whatsapp,
            email: values.notify_email,
            sms: values.notify_sms,
          },
        }, profile!.center_id, center);
        
        // Invalidate notification queries manually
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
        
        // Show toast for auto-sent notifications
        if (notificationResult.whatsappAutoSent) {
          toast({ title: 'WhatsApp enviado automáticamente', description: 'El mensaje se envió correctamente.' });
        }
      }

      toast({
        title: 'Sesión creada',
        description: notificationResult?.whatsappAutoSent
          ? 'Sesión programada y WhatsApp enviado automáticamente.'
          : values.bono_id && values.bono_id !== 'none' 
            ? 'Sesión programada y descontada del bono.'
            : 'La sesión se ha programado correctamente.',
      });

      form.reset();
      onOpenChange(false);

      // Show WhatsApp dialog after closing the main dialog ONLY if not auto-sent
      if (notificationResult?.whatsappData && !notificationResult?.whatsappAutoSent) {
        setWhatsappDialogData(notificationResult.whatsappData);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear la sesión. Por favor, inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto w-[95vw] max-w-[500px] p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Nueva Sesión</DialogTitle>
          <DialogDescription className="hidden sm:block">
            Programa una nueva sesión con un contacto.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar contacto" />
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

            {/* Bono selection - show when patient is selected */}
            {watchPatientId && (
              <FormField
                control={form.control}
                name="bono_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Usar bono
                    </FormLabel>
                    <div className="flex gap-2">
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Seleccionar bono (opcional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No usar bono</SelectItem>
                          {patientBonos?.map((bono) => (
                            <SelectItem key={bono.id} value={bono.id}>
                              <span className="flex items-center gap-2">
                                {bono.name}
                                <Badge variant="secondary" className="ml-2">
                                  {(bono.total_sessions || 0) - (bono.used_sessions || 0)} restantes
                                </Badge>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setShowCreateBonoDialog(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {field.value && field.value !== 'none' && (
                      <p className="text-xs text-muted-foreground">
                        Esta sesión se descontará del bono (ya pagado previamente)
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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

            {/* Payment Mode */}
            <FormField
              control={form.control}
              name="payment_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Modo de pago
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PAYMENT_MODE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <opt.icon className="h-4 w-4" />
                            {opt.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value === '__default__' && center?.default_payment_mode && (
                    <p className="text-xs text-muted-foreground">
                      Predeterminado: {PAYMENT_MODE_OPTIONS.find(o => o.value === center.default_payment_mode)?.label || center.default_payment_mode}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notification Settings */}
            <SessionNotificationSettings
              compact
              notifyWhatsapp={form.watch('notify_whatsapp')}
              notifyEmail={form.watch('notify_email')}
              notifySms={form.watch('notify_sms')}
              onNotifyWhatsappChange={(checked) => form.setValue('notify_whatsapp', checked)}
              onNotifyEmailChange={(checked) => form.setValue('notify_email', checked)}
              onNotifySmsChange={(checked) => form.setValue('notify_sms', checked)}
              reminderWhatsapp={form.watch('send_reminder_whatsapp')}
              reminderEmail={form.watch('send_reminder_email')}
              reminderSms={form.watch('send_reminder_sms')}
              onReminderWhatsappChange={(checked) => form.setValue('send_reminder_whatsapp', checked)}
              onReminderEmailChange={(checked) => form.setValue('send_reminder_email', checked)}
              onReminderSmsChange={(checked) => form.setValue('send_reminder_sms', checked)}
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

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button type="submit" disabled={createSession.isPending} className="w-full sm:w-auto">
                {createSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Sesión
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <CreateBonoDialog
      open={showCreateBonoDialog}
      onOpenChange={(open) => {
        setShowCreateBonoDialog(open);
        if (!open) {
          refetchBonos();
        }
      }}
      preselectedPatientId={watchPatientId}
      onSuccess={(bonoId, totalPrice) => {
        // Track this as a newly created bono
        setNewlyCreatedBonoId(bonoId);
        setNewlyCreatedBonoPrice(totalPrice);
        form.setValue('bono_id', bonoId);
        // Bono has its own billing - session price stays at default
      }}
    />

    {whatsappDialogData && (
      <WhatsAppLinkDialog
        open={!!whatsappDialogData}
        onOpenChange={(open) => !open && setWhatsappDialogData(null)}
        phone={whatsappDialogData.phone}
        message={whatsappDialogData.message}
        patientName={whatsappDialogData.patientName}
      />
    )}
    </>
  );
}
