import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, User, Globe, ChevronDown, Plus, Video, MapPin, Ban, Settings2, Package, CreditCard, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Link } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { RecurrenceSettings, defaultRecurrenceConfig } from './RecurrenceSettings';
import { useCreateRecurringSeries } from '@/hooks/useRecurringSeries';
import { generateRecurrenceOccurrences } from '@/lib/recurrence-utils';
import { RecurrenceConfig } from '@/types/recurring';
import { checkSessionConflicts, ConflictResult, SessionToCheck } from '@/lib/conflicts';
import { ConflictsDialog } from './ConflictsDialog';

const quickSessionSchema = z.object({
  patient_id: z.string().uuid('Selecciona un paciente'),
  professional_id: z.string().uuid('Selecciona un profesional'),
  session_date: z.date({ required_error: 'Selecciona una fecha' }),
  start_time: z.string().min(1, 'Hora de inicio requerida'),
  end_time: z.string().min(1, 'Hora de fin requerida'),
  session_type: z.string().min(1, 'Selecciona un tipo de sesión'),
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

// Generate 15-minute interval time slots (extended to 23:00 for flexibility)
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = 6; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 23 && minute > 0) break;
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
  const createRecurringSeries = useCreateRecurringSeries();
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
  // Recurrence state
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceConfig, setRecurrenceConfig] = useState<RecurrenceConfig>(defaultRecurrenceConfig);
  // Conflict detection state
  const [conflictsDialogOpen, setConflictsDialogOpen] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ConflictResult[]>([]);
  const [pendingFormValues, setPendingFormValues] = useState<{ values: QuickSessionFormValues; asDraft: boolean } | null>(null);
  const [allSessionsToCreate, setAllSessionsToCreate] = useState<SessionToCheck[]>([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

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

  // Helper to calculate duration from start and end time
  const calculateSelectedDuration = (startTime: string, endTime: string): number => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    return (endH * 60 + endM) - (startH * 60 + startM);
  };

  // Update end time when session type or start time changes (only if session type is selected)
  useEffect(() => {
    if (watchSessionType && sessionTypes) {
      const selectedType = sessionTypes.find(t => t.id === watchSessionType);
      if (selectedType) {
        const newEndTime = calculateEndTime(watchStartTime, selectedType.duration_minutes);
        form.setValue('end_time', newEndTime);
      }
    }
  }, [watchSessionType, watchStartTime, sessionTypes, form]);

  // Auto-select "Consulta Eguilaz" location when modality is in_person
  useEffect(() => {
    if (sessionModality === 'in_person' && locations && locations.length > 0) {
      const eguilazLocation = locations.find(loc => 
        loc.name.toLowerCase().includes('eguilaz')
      );
      if (eguilazLocation) {
        form.setValue('location_id', eguilazLocation.id);
      }
    }
  }, [sessionModality, locations, form]);

  useEffect(() => {
    if (open) {
      // Calculate the duration of the selected slot
      const selectedDuration = initialStartTime && initialEndTime 
        ? calculateSelectedDuration(initialStartTime, initialEndTime)
        : 15; // Simple click = 15 min default
      
      let selectedSessionTypeId = '';
      let finalEndTime = initialEndTime || '10:00';
      
      if (selectedDuration <= 15) {
        // Simple click: use first session type
        const firstType = sessionTypes?.[0];
        selectedSessionTypeId = firstType?.id || '';
        if (firstType && initialStartTime) {
          finalEndTime = calculateEndTime(initialStartTime, firstType.duration_minutes);
        }
      } else if (selectedDuration <= 60) {
        // Short drag: find session type matching duration
        const matchingType = sessionTypes?.find(t => t.duration_minutes === selectedDuration);
        if (matchingType) {
          selectedSessionTypeId = matchingType.id;
          if (initialStartTime) {
            finalEndTime = calculateEndTime(initialStartTime, matchingType.duration_minutes);
          }
        } else {
          // No match: leave empty, keep dragged end time
          selectedSessionTypeId = '';
          finalEndTime = initialEndTime || '10:00';
        }
      } else {
        // Long drag (>60 min): leave empty, keep dragged end time
        selectedSessionTypeId = '';
        finalEndTime = initialEndTime || '10:00';
      }
        
      // Get reminder channel defaults from center configuration
      const reminderChannels = center?.session_reminder_channels as { email?: boolean; whatsapp?: boolean; sms?: boolean } | null;
      const reminderEnabled = center?.session_reminder_enabled ?? false;
      
      form.reset({
        patient_id: '',
        professional_id: user?.id || professionals?.[0]?.id || '',
        session_date: initialDate || new Date(),
        start_time: initialStartTime || '09:00',
        end_time: finalEndTime,
        session_type: selectedSessionTypeId,
        cancellation_policy: '24_hours',
        session_modality: 'in_person',
        video_call_link: '',
        location_id: '',
        bono_id: '',
        payment_mode: '__default__',
        notify_whatsapp: false,
        notify_email: false,
        notify_sms: false,
        // Apply reminder defaults from center configuration
        send_reminder_whatsapp: reminderEnabled && (reminderChannels?.whatsapp ?? false),
        send_reminder_email: reminderEnabled && (reminderChannels?.email ?? true),
        send_reminder_sms: reminderEnabled && (reminderChannels?.sms ?? false),
      });
      setPatientSearch('');
      // Reset recurrence state
      setRecurrenceEnabled(false);
      setRecurrenceConfig(defaultRecurrenceConfig);
    }
  }, [open, initialDate, initialStartTime, initialEndTime, user?.id, professionals, sessionTypes, form, center]);

  const filteredPatients = patients?.filter(
    (patient) =>
      `${patient.first_name} ${patient.last_name}`
        .toLowerCase()
        .includes(patientSearch.toLowerCase())
  );

  const selectedPatient = patients?.find((p) => p.id === form.watch('patient_id'));
  const selectedProfessional = professionals?.find((p) => p.id === form.watch('professional_id'));

  // Build sessions to check for conflicts
  const buildSessionsToCheck = (values: QuickSessionFormValues, durationMinutes: number): SessionToCheck[] => {
    const [startH, startM] = values.start_time.split(':').map(Number);
    
    if (recurrenceEnabled) {
      const fullStartDate = new Date(values.session_date);
      fullStartDate.setHours(startH, startM, 0, 0);
      
      const occurrences = generateRecurrenceOccurrences(
        recurrenceConfig,
        fullStartDate,
        50,
        365
      );
      
      return occurrences.map((start, index) => {
        const end = new Date(start.getTime() + durationMinutes * 60000);
        return { start, end, tempId: `occ-${index}` };
      });
    } else {
      // Single session
      const start = new Date(values.session_date);
      start.setHours(startH, startM, 0, 0);
      const end = new Date(start.getTime() + durationMinutes * 60000);
      return [{ start, end, tempId: 'single' }];
    }
  };

  // Execute the actual session creation (after conflict check or force)
  const executeSessionCreation = async (
    values: QuickSessionFormValues,
    asDraft: boolean,
    sessionsToCreate?: SessionToCheck[]
  ) => {
    const usesBono = values.bono_id && values.bono_id !== 'none' && values.bono_id !== '';
    const selectedSessionType = sessionTypes?.find(t => t.id === values.session_type);
    const sessionPrice = selectedSessionType?.default_price ?? 0;
    
    let videoProvider: string | null = null;
    if (values.session_modality === 'zoom') {
      videoProvider = 'zoom';
    } else if (values.session_modality === 'google_meet') {
      videoProvider = 'google_meet';
    }
    
    const effectivePaymentMode = values.payment_mode === '__default__' ? null : values.payment_mode;
    
    const [startH, startM] = values.start_time.split(':').map(Number);
    const [endH, endM] = values.end_time.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    try {
      // Handle recurring series creation
      if (recurrenceEnabled) {
        const fullStartDate = new Date(values.session_date);
        fullStartDate.setHours(startH, startM, 0, 0);

        // If sessionsToCreate is provided (filtered), use those dates
        // Otherwise generate all occurrences
        let occurrences: Date[];
        if (sessionsToCreate && sessionsToCreate.length > 0) {
          occurrences = sessionsToCreate.map(s => s.start);
        } else {
          occurrences = generateRecurrenceOccurrences(
            recurrenceConfig,
            fullStartDate,
            50,
            365
          );
        }

        if (occurrences.length === 0) {
          toast({
            title: 'Error',
            description: 'No se generaron citas con la configuración de recurrencia.',
            variant: 'destructive',
          });
          return;
        }

        const originalTotal = generateRecurrenceOccurrences(
          recurrenceConfig,
          fullStartDate,
          50,
          365
        ).length;
        const omittedCount = originalTotal - occurrences.length;

        await createRecurringSeries.mutateAsync({
          seriesData: {
            patient_id: values.patient_id,
            professional_id: values.professional_id,
            base_start_datetime: fullStartDate.toISOString(),
            duration_minutes: durationMinutes > 0 ? durationMinutes : 60,
            timezone: 'Europe/Madrid',
            session_type: selectedSessionType?.name?.toLowerCase() || 'individual',
            price: sessionPrice,
            session_modality: values.session_modality,
            location_id: values.session_modality === 'in_person' && values.location_id ? values.location_id : null,
            cancellation_policy: values.cancellation_policy,
            notes_default: null,
            bono_id: usesBono ? values.bono_id : null,
            rrule_json: recurrenceConfig,
          },
          occurrences,
        });

        if (omittedCount > 0) {
          toast({
            title: 'Serie creada',
            description: `Creadas ${occurrences.length} citas. Omitidas ${omittedCount} por conflicto.`,
          });
        }

        onOpenChange(false);
        return;
      }

      // Single session creation (existing logic)
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

      // Handle video/calendar integrations for non-draft sessions (non-critical)
      if (!asDraft && newSession?.id && selectedPatient) {
        try {
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
        } catch (integrationError) {
          console.error('Integration error (non-critical):', integrationError);
        }

        // Handle Stripe payment if enabled (non-critical)
        try {
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

            if (stripeResult.payment_status) {
              await updateSession.mutateAsync({
                id: newSession.id,
                stripe_payment_status: stripeResult.payment_status,
                stripe_payment_mode: integrations.stripe_payment_mode,
              });

              if (stripeResult.checkout_url) {
                toast({
                  title: 'Sesión creada',
                  description: 'Redirigiendo al pago...',
                });
                window.open(stripeResult.checkout_url, '_blank');
              }
            }
          }
        } catch (stripeError) {
          console.error('Stripe integration error (non-critical):', stripeError);
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

  const onSubmit = async (values: QuickSessionFormValues, asDraft: boolean) => {
    const selectedSessionType = sessionTypes?.find(t => t.id === values.session_type);
    
    // Validate and fix end_time if it's equal or less than start_time
    if (values.end_time <= values.start_time) {
      const duration = selectedSessionType?.duration_minutes || 60;
      values.end_time = calculateEndTime(values.start_time, duration);
    }
    
    const [startH, startM] = values.start_time.split(':').map(Number);
    const [endH, endM] = values.end_time.split(':').map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    
    // Build sessions to check
    const sessionsToCheck = buildSessionsToCheck(values, durationMinutes > 0 ? durationMinutes : 60);
    
    // Check for conflicts
    setIsCheckingConflicts(true);
    try {
      const conflicts = await checkSessionConflicts({
        centerId: center?.id || '',
        professionalId: values.professional_id,
        sessionsToCheck,
      });
      
      if (conflicts.length > 0) {
        // Store state for conflict resolution
        setDetectedConflicts(conflicts);
        setAllSessionsToCreate(sessionsToCheck);
        setPendingFormValues({ values, asDraft });
        setConflictsDialogOpen(true);
      } else {
        // No conflicts, proceed directly
        await executeSessionCreation(values, asDraft);
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
      // If conflict check fails, proceed anyway
      await executeSessionCreation(values, asDraft);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  // Conflict dialog handlers
  const handleConflictCancel = () => {
    setPendingFormValues(null);
    setDetectedConflicts([]);
    setAllSessionsToCreate([]);
  };

  const handleCreateNonConflicting = async () => {
    if (!pendingFormValues) return;
    
    // Filter out conflicting sessions
    const conflictTempIds = new Set(detectedConflicts.map(c => c.tempId));
    const nonConflicting = allSessionsToCreate.filter(s => !conflictTempIds.has(s.tempId));
    
    if (nonConflicting.length > 0) {
      await executeSessionCreation(pendingFormValues.values, pendingFormValues.asDraft, nonConflicting);
    } else {
      toast({
        title: 'Sin citas para crear',
        description: 'Todas las citas tienen conflictos.',
        variant: 'destructive',
      });
    }
    
    setPendingFormValues(null);
    setDetectedConflicts([]);
    setAllSessionsToCreate([]);
  };

  const handleForceCreate = async () => {
    if (!pendingFormValues) return;
    
    // Create all sessions regardless of conflicts
    await executeSessionCreation(pendingFormValues.values, pendingFormValues.asDraft);
    
    setPendingFormValues(null);
    setDetectedConflicts([]);
    setAllSessionsToCreate([]);
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
                      <Select onValueChange={field.onChange} value={field.value || 'none'}>
                        <SelectTrigger className="h-10 flex-1">
                          <SelectValue placeholder="Sin bono" />
                        </SelectTrigger>
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
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
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
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
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
                  {/* Google Meet warning if not configured */}
                  {field.value === 'google_meet' && (!integrations?.google_meet_enabled || !oauthConnections?.some(c => c.provider === 'google' && c.access_token)) && (
                    <Alert variant="destructive" className="mt-2 py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Google Meet no está conectado. El enlace no se generará automáticamente.{' '}
                        <Link to="/configuracion" className="underline font-medium hover:no-underline">
                          Configúralo aquí
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
                  {/* Zoom warning if not configured */}
                  {field.value === 'zoom' && (!integrations?.zoom_enabled || !oauthConnections?.some(c => c.provider === 'zoom' && c.access_token)) && (
                    <Alert variant="destructive" className="mt-2 py-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Zoom no está conectado. El enlace no se generará automáticamente.{' '}
                        <Link to="/configuracion" className="underline font-medium hover:no-underline">
                          Configúralo aquí
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}
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
                        <SelectTrigger className="h-10 flex-1">
                          <SelectValue placeholder="Sin especificar" />
                        </SelectTrigger>
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
                {/* Date Picker */}
                <FormField
                  control={form.control}
                  name="session_date"
                  render={({ field }) => (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            'flex-1 justify-start text-left font-normal h-10',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          <span className="capitalize">
                            {field.value ? format(field.value, "EEE d 'de' MMM", { locale: es }) : 'Seleccionar fecha'}
                          </span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                
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
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
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

            {/* Recurrence Settings */}
            <RecurrenceSettings
              enabled={recurrenceEnabled}
              onEnabledChange={setRecurrenceEnabled}
              config={recurrenceConfig}
              onConfigChange={setRecurrenceConfig}
              startDate={form.watch('session_date')}
              startTime={form.watch('start_time')}
            />

            {/* Timezone (only show if not recurring) */}
            {!recurrenceEnabled && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Globe className="h-3 w-3" />
                <span>Europe/Madrid</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4">
              {!recurrenceEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => form.handleSubmit((v) => onSubmit(v, true))()}
                  disabled={createSession.isPending || createRecurringSeries.isPending || isCheckingConflicts}
                >
                  Guardar borrador
                </Button>
              )}
              <Button
                type="button"
                onClick={() => form.handleSubmit((v) => onSubmit(v, false))()}
                disabled={createSession.isPending || createRecurringSeries.isPending || isCheckingConflicts}
              >
                {isCheckingConflicts ? 'Verificando...' : createRecurringSeries.isPending ? 'Creando...' : recurrenceEnabled ? 'Crear serie' : 'Crear sesión'}
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

    <ConflictsDialog
      open={conflictsDialogOpen}
      onOpenChange={setConflictsDialogOpen}
      conflicts={detectedConflicts}
      isRecurring={recurrenceEnabled}
      totalSessions={allSessionsToCreate.length}
      onCancel={handleConflictCancel}
      onCreateNonConflicting={handleCreateNonConflicting}
      onForceCreate={handleForceCreate}
    />
  </>
  );
}
