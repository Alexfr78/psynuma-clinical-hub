import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, User, Globe, ChevronDown, Plus, Video, MapPin, Ban, Settings2, Package, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCreateSession, useUpdateSession } from '@/hooks/useSessions';
import { usePatients, useProfessionals } from '@/hooks/usePatients';
import { useAuth } from '@/hooks/useAuth';
import { useLocations } from '@/hooks/useLocations';
import { usePatientActiveBonos, useDeductBonoSession } from '@/hooks/useBonos';
import { useScheduleSessionReminder } from '@/hooks/useNotifications';
import { useSendSessionNotification, WhatsAppDialogData } from '@/hooks/useSendSessionNotification';
import { useSessionTypes } from '@/hooks/useSessionTypes';
import { useCenter } from '@/hooks/useCenter';
import { useProfessionalIntegrations } from '@/hooks/useProfessionalIntegrations';
import { handleSessionIntegrations, handleStripePayment } from '@/hooks/useSessionIntegrations';
import { QuickCreatePatientDialog } from '@/components/patients/QuickCreatePatientDialog';
import { EditLocationsDialog } from '@/components/settings/EditLocationsDialog';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { SessionNotificationSettings } from './SessionNotificationSettings';
import { WhatsAppLinkDialog } from './WhatsAppLinkDialog';

const quickSessionSchema = z.object({
  patient_id: z.string().uuid('Selecciona un paciente'),
  professional_id: z.string().uuid('Selecciona un profesional'),
  session_date: z.date({ required_error: 'Selecciona una fecha' }),
  start_time: z.string().min(1, 'Hora de inicio requerida'),
  end_time: z.string().min(1, 'Hora de fin requerida'),
  session_type: z.string().default('individual'),
  cancellation_policy: z.string().default('24_hours'),
  session_modality: z.string().default('in_person'),
  video_call_link: z.string().optional(),
  location_id: z.string().optional(),
  bono_id: z.string().optional(),
  payment_mode: z.string().optional(),
  // Immediate notifications
  notify_whatsapp: z.boolean().default(false),
  notify_email: z.boolean().default(false),
  notify_sms: z.boolean().default(false),
  // Reminders
  send_reminder_whatsapp: z.boolean().default(false),
  send_reminder_email: z.boolean().default(true),
  send_reminder_sms: z.boolean().default(false),
});

type QuickSessionFormValues = z.infer<typeof quickSessionSchema>;

interface QuickCreateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  initialStartTime?: string;
  initialEndTime?: string;
}

// Generate 15-minute interval time slots
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 8; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 20 && minute > 0) break;
      slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

const CANCELLATION_OPTIONS = [
  { value: 'not_allowed', label: 'No permitir cancelaciones' },
  { value: 'until_start', label: 'Hasta la hora de la sesión' },
  { value: 'until_1_hour', label: 'Hasta 1 hora antes' },
  { value: 'until_2_hours', label: 'Hasta 2 horas antes' },
  { value: '24_hours', label: 'Hasta 24 horas antes' },
  { value: '48_hours', label: 'Hasta 48 horas antes' },
  { value: '72_hours', label: 'Hasta 72 horas antes' },
];

const MODALITY_OPTIONS = [
  { value: 'in_person', label: 'Sesión presencial', icon: MapPin },
  { value: 'google_meet', label: 'Video llamada de GoogleMeet', icon: Video },
  { value: 'zoom', label: 'Zoom', icon: Video },
  { value: 'custom_link', label: 'Añadir link de videollamada', icon: Video },
];

const PAYMENT_MODE_OPTIONS = [
  { value: '__default__', label: 'Usar predeterminado del centro', icon: Settings2 },
  { value: 'required_now', label: 'Pago obligatorio (antes de confirmar)', icon: CreditCard },
  { value: 'in_session', label: 'Pago en sesión', icon: MapPin },
  { value: 'post_session', label: 'Pago post-sesión', icon: CalendarIcon },
  { value: 'scheduled_before', label: 'Programado (X horas antes)', icon: Globe },
];

export function QuickCreateSessionDialog({
  open,
  onOpenChange,
  initialDate,
  initialStartTime,
  initialEndTime,
}: QuickCreateSessionDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const createSession = useCreateSession();
  const updateSession = useUpdateSession();
  const deductBonoSession = useDeductBonoSession();
  const scheduleReminder = useScheduleSessionReminder();
  const sendNotification = useSendSessionNotification();
  const { integrations, oauthConnections } = useProfessionalIntegrations();
  const { center } = useCenter();
  const { data: patients } = usePatients();
  const { data: professionals } = useProfessionals();
  const { data: locations } = useLocations();
  const { data: sessionTypes } = useSessionTypes();
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPopoverOpen, setPatientPopoverOpen] = useState(false);
  const [showQuickPatientDialog, setShowQuickPatientDialog] = useState(false);
  const [showLocationsDialog, setShowLocationsDialog] = useState(false);
  const [showCreateBonoDialog, setShowCreateBonoDialog] = useState(false);
  // Track newly created bono and its price
  const [newlyCreatedBonoId, setNewlyCreatedBonoId] = useState<string | null>(null);
  const [newlyCreatedBonoPrice, setNewlyCreatedBonoPrice] = useState<number | null>(null);
  // WhatsApp dialog state
  const [whatsappDialogData, setWhatsappDialogData] = useState<WhatsAppDialogData | null>(null);

  const form = useForm<QuickSessionFormValues>({
    resolver: zodResolver(quickSessionSchema),
    defaultValues: {
      patient_id: '',
      professional_id: user?.id || '',
      session_date: initialDate || new Date(),
      start_time: initialStartTime || '09:00',
      end_time: initialEndTime || '10:00',
      session_type: 'individual',
      cancellation_policy: '24_hours',
      session_modality: 'in_person',
      video_call_link: '',
      location_id: '',
      bono_id: '',
      payment_mode: '__default__',
      notify_whatsapp: false,
      notify_email: false,
      notify_sms: false,
      send_reminder_whatsapp: false,
      send_reminder_email: true,
      send_reminder_sms: false,
    },
  });

  const sessionModality = form.watch('session_modality');
  const watchPatientId = form.watch('patient_id');
  const watchBonoId = form.watch('bono_id');
  const watchSessionType = form.watch('session_type');
  const watchStartTime = form.watch('start_time');
  const { data: patientBonos, refetch: refetchBonos } = usePatientActiveBonos(watchPatientId || undefined);

  // Helper function to calculate end time based on start time and duration
  const calculateEndTime = (startTime: string, durationMinutes: number): string => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const endHours = Math.floor(totalMinutes / 60);
    const endMinutes = totalMinutes % 60;
    return `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
  };

  // Clear new bono tracking when bono selection changes to something else
  useEffect(() => {
    if (watchBonoId !== newlyCreatedBonoId) {
      setNewlyCreatedBonoId(null);
      setNewlyCreatedBonoPrice(null);
    }
  }, [watchBonoId, newlyCreatedBonoId]);

  // Update end time when session type changes
  useEffect(() => {
    if (watchSessionType && sessionTypes) {
      const selectedType = sessionTypes.find(t => t.id === watchSessionType);
      if (selectedType) {
        const newEndTime = calculateEndTime(watchStartTime, selectedType.duration_minutes);
        form.setValue('end_time', newEndTime);
      }
    }
  }, [watchSessionType, watchStartTime, sessionTypes, form]);

  // Get the default session type (first one or 'individual' fallback)
  const defaultSessionTypeId = sessionTypes?.[0]?.id || '';

  useEffect(() => {
    if (open) {
      const firstSessionType = sessionTypes?.[0];
      const initialEndTimeCalculated = firstSessionType && initialStartTime 
        ? calculateEndTime(initialStartTime, firstSessionType.duration_minutes)
        : initialEndTime || '10:00';
        
      form.reset({
        patient_id: '',
        professional_id: user?.id || professionals?.[0]?.id || '',
        session_date: initialDate || new Date(),
        start_time: initialStartTime || '09:00',
        end_time: initialEndTimeCalculated,
        session_type: firstSessionType?.id || '',
        cancellation_policy: '24_hours',
        session_modality: 'in_person',
        video_call_link: '',
        location_id: '',
        bono_id: '',
        payment_mode: '__default__',
        notify_whatsapp: false,
        notify_email: false,
        notify_sms: false,
        send_reminder_whatsapp: false,
        send_reminder_email: true,
        send_reminder_sms: false,
      });
      setPatientSearch('');
    }
  }, [open, initialDate, initialStartTime, initialEndTime, user?.id, professionals, sessionTypes, form]);

  const filteredPatients = patients?.filter(
    (patient) =>
      `${patient.first_name} ${patient.last_name}`
        .toLowerCase()
        .includes(patientSearch.toLowerCase())
  );

  const selectedPatient = patients?.find((p) => p.id === form.watch('patient_id'));
  const selectedProfessional = professionals?.find((p) => p.id === form.watch('professional_id'));

  const onSubmit = async (values: QuickSessionFormValues, asDraft: boolean) => {
    try {
      const usesBono = values.bono_id && values.bono_id !== 'none' && values.bono_id !== '';
      const selectedSessionType = sessionTypes?.find(t => t.id === values.session_type);
      
      // Determine price: new bono = total price, existing bono = 0, no bono = session type default
      let sessionPrice = selectedSessionType?.default_price || 60;
      if (usesBono) {
        if (values.bono_id === newlyCreatedBonoId && newlyCreatedBonoPrice !== null) {
          // Newly created bono - needs to be paid
          sessionPrice = newlyCreatedBonoPrice;
        } else {
          // Existing bono - already paid
          sessionPrice = 0;
        }
      }
      
      // Determine video provider based on modality
      let videoProvider: string | null = null;
      if (values.session_modality === 'zoom') {
        videoProvider = 'zoom';
      } else if (values.session_modality === 'google_meet') {
        videoProvider = 'google_meet';
      }
      
      const effectivePaymentMode = values.payment_mode === '__default__' ? null : values.payment_mode;
      
      const newSession = await createSession.mutateAsync({
        patient_id: values.patient_id,
        professional_id: values.professional_id,
        session_date: format(values.session_date, 'yyyy-MM-dd'),
        start_time: values.start_time,
        end_time: values.end_time,
        session_type: selectedSessionType?.name?.toLowerCase() || 'individual',
        price: sessionPrice,
        status: asDraft ? 'draft' : 'scheduled',
        cancellation_policy: values.cancellation_policy,
        session_modality: values.session_modality,
        video_call_link: values.session_modality === 'custom_link' ? values.video_call_link : null,
        video_provider: videoProvider,
        location_id: values.session_modality === 'in_person' && values.location_id ? values.location_id : null,
        bono_id: usesBono ? values.bono_id : null,
        payment_mode: effectivePaymentMode,
        send_reminder_whatsapp: values.send_reminder_whatsapp,
        send_reminder_email: values.send_reminder_email,
        send_reminder_sms: values.send_reminder_sms,
      });

      // Handle video/calendar integrations for non-draft sessions
      if (!asDraft && newSession?.id && selectedPatient) {
        const isVideoSession = values.session_modality === 'zoom' || values.session_modality === 'google_meet';
        
        if (isVideoSession || integrations?.google_calendar_enabled) {
          const integrationResult = await handleSessionIntegrations(
            {
              id: newSession.id,
              professional_id: values.professional_id,
              patient_id: values.patient_id,
              session_date: format(values.session_date, 'yyyy-MM-dd'),
              start_time: values.start_time,
              end_time: values.end_time,
              session_modality: values.session_modality,
              video_provider: videoProvider || undefined,
              session_type: selectedSessionType?.name,
            },
            {
              first_name: selectedPatient.first_name,
              last_name: selectedPatient.last_name,
              email: selectedPatient.email,
            },
            integrations,
            oauthConnections || []
          );

          // Update session with integration results
          if (integrationResult.video_call_link || integrationResult.google_calendar_event_id) {
            await updateSession.mutateAsync({
              id: newSession.id,
              video_call_link: integrationResult.video_call_link || newSession.video_call_link,
              video_provider: integrationResult.video_provider || newSession.video_provider,
              google_calendar_event_id: integrationResult.google_calendar_event_id,
            });
          }
        }

        // Handle Stripe payment if enabled
        if (integrations?.stripe_enabled && sessionPrice > 0) {
          const stripeResult = await handleStripePayment(
            {
              id: newSession.id,
              professional_id: values.professional_id,
              patient_id: values.patient_id,
              session_date: format(values.session_date, 'yyyy-MM-dd'),
              start_time: values.start_time,
              end_time: values.end_time,
              session_type: selectedSessionType?.name,
              price: sessionPrice,
              payment_mode: effectivePaymentMode,
            },
            {
              first_name: selectedPatient.first_name,
              last_name: selectedPatient.last_name,
              email: selectedPatient.email,
            },
            integrations,
            oauthConnections || []
          );

          // Update session with Stripe payment info
          if (stripeResult.payment_status) {
            await updateSession.mutateAsync({
              id: newSession.id,
              stripe_payment_status: stripeResult.payment_status,
              stripe_payment_mode: integrations.stripe_payment_mode,
            });

            // If required_now mode, redirect to checkout
            if (stripeResult.checkout_url) {
              toast({
                title: 'Sesión creada',
                description: 'Redirigiendo al pago...',
              });
              window.open(stripeResult.checkout_url, '_blank');
            }
          }
        }
      }

      // If bono was used, deduct a session
      if (usesBono && newSession?.id) {
        await deductBonoSession.mutateAsync({
          bonoId: values.bono_id!,
          sessionId: newSession.id,
        });
      }

      // Schedule reminders if any are enabled
      const hasReminders = values.send_reminder_email || values.send_reminder_sms || values.send_reminder_whatsapp;
      if (hasReminders && newSession?.id && selectedPatient) {
        await scheduleReminder.mutateAsync({
          sessionId: newSession.id,
          patientId: values.patient_id,
          patientName: `${selectedPatient.first_name} ${selectedPatient.last_name}`,
          patientEmail: selectedPatient.email,
          patientPhone: selectedPatient.phone,
          sessionDate: format(values.session_date, 'dd/MM/yyyy'),
          sessionDateISO: format(values.session_date, 'yyyy-MM-dd'),
          sessionTime: values.start_time,
          reminderTypes: {
            email: values.send_reminder_email,
            sms: values.send_reminder_sms,
            whatsapp: values.send_reminder_whatsapp,
          },
        });
      }

      // Send immediate notifications if any are enabled (only for non-drafts)
      const hasNotifications = values.notify_whatsapp || values.notify_email || values.notify_sms;
      let notificationResult;
      if (!asDraft && hasNotifications && newSession?.id && selectedPatient) {
        notificationResult = await sendNotification.mutateAsync({
          patientId: values.patient_id,
          patientName: `${selectedPatient.first_name} ${selectedPatient.last_name}`,
          patientPhone: selectedPatient.phone,
          patientEmail: selectedPatient.email,
          sessionId: newSession.id,
          sessionDate: format(values.session_date, 'dd/MM/yyyy'),
          sessionTime: values.start_time,
          professionalName: selectedProfessional ? `${selectedProfessional.first_name} ${selectedProfessional.last_name}` : undefined,
          sessionType: selectedSessionType?.name || values.session_type,
          type: 'notification',
          channels: {
            whatsapp: values.notify_whatsapp,
            email: values.notify_email,
            sms: values.notify_sms,
          },
        });
      }

      toast({
        title: asDraft ? 'Borrador guardado' : 'Sesión creada',
        description: usesBono 
          ? 'Sesión programada y descontada del bono.'
          : asDraft 
            ? 'La sesión se ha guardado como borrador.'
            : 'La sesión se ha programado correctamente.',
      });

      onOpenChange(false);

      // Show WhatsApp dialog after closing the main dialog
      if (notificationResult?.whatsappData) {
        setWhatsappDialogData(notificationResult.whatsappData);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo crear la sesión.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">Nueva reserva</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4 px-6 pb-6">
            {/* Patient Search */}
            <FormField
              control={form.control}
              name="patient_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-sm font-medium">Paciente</FormLabel>
                  <Popover open={patientPopoverOpen} onOpenChange={setPatientPopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            'w-full justify-between h-10',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {selectedPatient ? (
                            <span className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                <User className="h-3 w-3" />
                              </div>
                              {selectedPatient.first_name} {selectedPatient.last_name}
                            </span>
                          ) : (
                            'Buscar paciente...'
                          )}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[430px] p-0" align="start">
                      <Command>
                        <CommandInput 
                          placeholder="Buscar paciente..." 
                          value={patientSearch}
                          onValueChange={setPatientSearch}
                        />
                        <CommandList>
                          {filteredPatients && filteredPatients.length > 0 ? (
                            <CommandGroup>
                              {filteredPatients.slice(0, 10).map((patient) => (
                                <CommandItem
                                  key={patient.id}
                                  value={`${patient.first_name} ${patient.last_name}`}
                                  onSelect={() => {
                                    field.onChange(patient.id);
                                    setPatientPopoverOpen(false);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                      <User className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className="font-medium">{patient.first_name} {patient.last_name}</p>
                                      {patient.email && (
                                        <p className="text-xs text-muted-foreground">{patient.email}</p>
                                      )}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ) : (
                            <div className="py-6 px-4 text-center">
                              <p className="text-sm text-muted-foreground mb-3">
                                No se encontraron pacientes.
                              </p>
                              <Button 
                                variant="outline" 
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setPatientPopoverOpen(false);
                                  setShowQuickPatientDialog(true);
                                }}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Crear nueva ficha de paciente
                              </Button>
                            </div>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Bono Selection */}
            {watchPatientId && (
              <FormField
                control={form.control}
                name="bono_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Bono
                    </FormLabel>
                    <div className="flex gap-2">
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value || 'none'}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 flex-1">
                            <SelectValue placeholder="Sin bono" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Sin bono</SelectItem>
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
                        className="h-10 w-10"
                        onClick={() => setShowCreateBonoDialog(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
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

            {/* Professional */}
            <FormField
              control={form.control}
              name="professional_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Profesional</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue>
                          {selectedProfessional ? (
                            <span className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-3 w-3 text-primary" />
                              </div>
                              {selectedProfessional.first_name} {selectedProfessional.last_name}
                              <Badge variant="secondary" className="ml-auto text-xs">
                                Profesional principal
                              </Badge>
                            </span>
                          ) : (
                            'Seleccionar profesional'
                          )}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {professionals?.map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          <span className="flex items-center gap-2">
                            {prof.first_name} {prof.last_name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Session Type */}
            <FormField
              control={form.control}
              name="session_type"
              render={({ field }) => {
                const selectedType = sessionTypes?.find(t => t.id === field.value);
                return (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Tipo de sesión</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue>
                            {selectedType ? (
                              <span className="flex items-center gap-2">
                                <div 
                                  className="h-3 w-3 rounded-full" 
                                  style={{ backgroundColor: selectedType.color }}
                                />
                                {selectedType.name}
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({selectedType.duration_minutes} min)
                                </span>
                              </span>
                            ) : (
                              'Seleccionar tipo'
                            )}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sessionTypes?.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            <span className="flex items-center gap-2">
                              <div 
                                className="h-3 w-3 rounded-full" 
                                style={{ backgroundColor: type.color }}
                              />
                              {type.name}
                              <span className="text-muted-foreground text-xs ml-1">
                                ({type.duration_minutes} min)
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Cancellation Policy */}
            <FormField
              control={form.control}
              name="cancellation_policy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium flex items-center gap-2">
                    <Ban className="h-4 w-4" />
                    Cancelación
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CANCELLATION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Session Modality (Video call options) */}
            <FormField
              control={form.control}
              name="session_modality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Videollamada
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MODALITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <span className="flex items-center gap-2">
                            <opt.icon className="h-4 w-4" />
                            {opt.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Custom Video Call Link (conditional) */}
            {sessionModality === 'custom_link' && (
              <FormField
                control={form.control}
                name="video_call_link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Link de videollamada</FormLabel>
                    <FormControl>
                      <Input placeholder="https://..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Location (only for in_person) */}
            {sessionModality === 'in_person' && (
              <FormField
                control={form.control}
                name="location_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Dirección
                    </FormLabel>
                    <div className="flex gap-2">
                      <Select onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)} value={field.value || '__none__'}>
                        <FormControl>
                          <SelectTrigger className="h-10 flex-1">
                            <SelectValue placeholder="Sin especificar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Sin especificar</SelectItem>
                          {locations?.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-10 w-10"
                        onClick={() => setShowLocationsDialog(true)}
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Date & Time Row */}
            <div className="space-y-2">
              <FormLabel className="text-sm font-medium">Fecha y hora</FormLabel>
              <div className="flex items-center gap-2">
                {/* Date Display */}
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/30 flex-1">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm capitalize">
                    {format(form.watch('session_date'), "EEE d 'de' MMM", { locale: es })}
                  </span>
                </div>
                
                {/* Time Selects */}
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-24 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                
                <span className="text-muted-foreground">-</span>
                
                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="w-24 h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Payment Mode */}
            <FormField
              control={form.control}
              name="payment_mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Modo de pago
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10">
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

            {/* Non-repeating & Timezone */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>No se repite</span>
              <div className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                <span>Europe/Madrid</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.handleSubmit((v) => onSubmit(v, true))()}
                disabled={createSession.isPending}
              >
                Guardar borrador
              </Button>
              <Button
                type="button"
                onClick={() => form.handleSubmit((v) => onSubmit(v, false))()}
                disabled={createSession.isPending}
              >
                Crear sesión
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <QuickCreatePatientDialog
      open={showQuickPatientDialog}
      onOpenChange={setShowQuickPatientDialog}
      onPatientCreated={(patientId) => {
        form.setValue('patient_id', patientId);
        setPatientSearch('');
      }}
      initialName={patientSearch}
      defaultProfessionalId={form.watch('professional_id')}
    />

    <EditLocationsDialog
      open={showLocationsDialog}
      onOpenChange={setShowLocationsDialog}
    />

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
        form.setValue('bono_id', bonoId);
        // Track this as a newly created bono
        setNewlyCreatedBonoId(bonoId);
        setNewlyCreatedBonoPrice(totalPrice);
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
