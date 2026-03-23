import { useState, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  User,
  CreditCard,
  ChevronDown,
  ChevronRight,
  Mail,
  Phone,
  FileText,
  Link as LinkIcon,
  Edit2,
  X,
  Check,
  Loader2,
  Package,
  DoorOpen,
  Plus,
  ExternalLink,
  Video,
  MapPin,
  Ban,
  Trash2,
  CheckCircle2,
  Send,
  RefreshCw,
  FileSignature,
  ClipboardCheck,
  NotebookPen,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { SessionWithRelations, useUpdateSession, useDeleteSession } from '@/hooks/useSessions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useLocations } from '@/hooks/useLocations';
import { usePatientActiveBonos, useBono, useApplyBonoToSession, useRemoveBonoFromSession, useUpdateBono } from '@/hooks/useBonos';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { useSessionPaymentStatus } from '@/hooks/useSessionPayment';
import { useBonoPaymentStatus } from '@/hooks/useBonoPaymentStatus';
import { useSessionInvoiceStatus } from '@/hooks/useInvoices';
import { useCreateSignedInvoice } from '@/hooks/useCreateSignedInvoice';
import { CollectSessionPaymentDialog } from './CollectSessionPaymentDialog';
import { CollectBonoPaymentDialog } from './CollectBonoPaymentDialog';
import { CreateSessionInvoiceDialog } from './CreateSessionInvoiceDialog';
import { SendInvoiceDialog } from '@/components/invoices/SendInvoiceDialog';
import { useSendSessionNotification } from '@/hooks/useSendSessionNotification';
import { useWhatsAppDelivery } from '@/hooks/useWhatsAppDelivery';
import { useCenter } from '@/hooks/useCenter';
import { DEFAULT_TEMPLATES } from '@/hooks/useCommunicationTemplates';
import { useIsMobile } from '@/hooks/use-mobile';
import { openWhatsAppSmart } from '@/lib/whatsapp';
import { createStripeCheckout } from '@/hooks/useSessionIntegrations';
import { useGoogleCalendarUpdate } from '@/hooks/useGoogleCalendarUpdate';
import { PatientSelector } from './PatientSelector';
import { usePatient, Patient } from '@/hooks/usePatients';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionalIntegrations } from '@/hooks/useProfessionalIntegrations';
import { ConvertCalendarEventDialog } from './ConvertCalendarEventDialog';
import { useDeleteCalendarEvent } from '@/hooks/useDeleteCalendarEvent';
import { CalendarEvent } from '@/hooks/useCalendarEvents';
import { EditRecurringScopeDialog } from './EditRecurringScopeDialog';
import { useUpdateRecurringSession, useCancelRecurringSession } from '@/hooks/useRecurringSeries';
import { EditScope } from '@/types/recurring';
import { checkSessionConflicts, ConflictResult } from '@/lib/conflicts';
import { ConflictsDialog } from './ConflictsDialog';
import { useConsents, Consent } from '@/hooks/useConsents';
import { useConsentTemplates } from '@/hooks/useConsentTemplates';
import { CreateConsentDialog } from '@/components/consents/CreateConsentDialog';
import { SendConsentDialog } from '@/components/consents/SendConsentDialog';
import { ConsentCard } from '@/components/consents/ConsentCard';
import { PatientAssessments } from '@/components/patients/tabs/PatientAssessments';
import { PatientSessionHistory } from './PatientSessionHistory';
import { PatientAutoregistros } from '@/components/patients/tabs/PatientAutoregistros';
import { PatientInvoices } from '@/components/patients/tabs/PatientInvoices';
import { InvoiceDetailDialog } from '@/components/invoices/InvoiceDetailDialog';
import { Receipt, Brain } from 'lucide-react';
import { TranscriptionAnalysisDialog } from './TranscriptionAnalysisDialog';

interface SessionDetailDrawerProps {
  session: SessionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { label: 'Borrador', variant: 'outline', className: 'border-dashed' },
  scheduled: { label: 'Programada', variant: 'secondary', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  confirmed: { label: 'Confirmada', variant: 'default', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  completed: { label: 'Completada', variant: 'outline', className: 'bg-muted' },
  cancelled: { label: 'Cancelada', variant: 'destructive', className: '' },
  no_show: { label: 'No asistió', variant: 'destructive', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  blocked: { label: 'Bloqueado', variant: 'outline', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
};

const sessionTypeLabels: Record<string, string> = {
  individual: 'Sesión individual',
  pareja: 'Terapia de pareja',
  familia: 'Terapia familiar',
  grupo: 'Terapia grupal',
};

const modalityLabels: Record<string, string> = {
  in_person: 'Presencial',
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  custom_link: 'Videollamada',
};

const cancellationLabels: Record<string, string> = {
  not_allowed: 'No permitir cancelaciones',
  until_start: 'Hasta la hora de la sesión',
  '1_hour': 'Hasta 1 hora antes',
  '2_hours': 'Hasta 2 horas antes',
  '24_hours': 'Hasta 24 horas antes',
  '48_hours': 'Hasta 48 horas antes',
  '72_hours': 'Hasta 72 horas antes',
};

export function SessionDetailDrawer({ session, open, onOpenChange }: SessionDetailDrawerProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSession = useUpdateSession();
  const deleteSession = useDeleteSession();
  const updateRecurringSession = useUpdateRecurringSession();
  const cancelRecurringSession = useCancelRecurringSession();
  const applyBonoToSession = useApplyBonoToSession();
  const removeBonoFromSession = useRemoveBonoFromSession();
  const updateBono = useUpdateBono();
  const { data: locations } = useLocations();
  const { center } = useCenter();
  const whatsappDelivery = useWhatsAppDelivery();
  const sendEmailNotification = useSendSessionNotification();
  const isMobile = useIsMobile();
  const { syncToGoogle, syncMoveToGoogle } = useGoogleCalendarUpdate(session?.professional_id);
  const deleteCalendarEvent = useDeleteCalendarEvent();
  const { integrations, isProviderConnected } = useProfessionalIntegrations(session?.professional_id);
  const [isSendingWhatsAppNow, setIsSendingWhatsAppNow] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isChangingModality, setIsChangingModality] = useState(false);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingDateTime, setEditingDateTime] = useState(false);
  const [editingPatient, setEditingPatient] = useState(false);
  const [isConvertingSession, setIsConvertingSession] = useState(false);
  const [priceValue, setPriceValue] = useState('');
  const [notesValue, setNotesValue] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const [showCreateBonoDialog, setShowCreateBonoDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showBonoPaymentDialog, setShowBonoPaymentDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showSendInvoiceDialog, setShowSendInvoiceDialog] = useState(false);
  const [createdInvoiceForSend, setCreatedInvoiceForSend] = useState<{
    id: string;
    invoice_number: string;
    total: number;
    patients: {
      id: string;
      first_name: string;
      last_name: string;
      email?: string | null;
      phone?: string | null;
    };
  } | null>(null);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [dateTimeValue, setDateTimeValue] = useState({
    date: '',
    startTime: '',
    endTime: '',
  });
  
  // Recurring session state
  const [showRecurringScopeDialog, setShowRecurringScopeDialog] = useState(false);
  const [recurringScopeAction, setRecurringScopeAction] = useState<'edit' | 'cancel'>('edit');
  const [pendingRecurringUpdate, setPendingRecurringUpdate] = useState<Record<string, unknown> | null>(null);
  
  // Conflict detection state
  const [conflictsDialogOpen, setConflictsDialogOpen] = useState(false);
  const [detectedConflicts, setDetectedConflicts] = useState<ConflictResult[]>([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  
  // Consent dialogs state
  const [showCreateConsentDialog, setShowCreateConsentDialog] = useState(false);
  const [sendConsentDialogData, setSendConsentDialogData] = useState<Consent | null>(null);
  
  // Transcription analysis dialog
  const [showTranscriptionDialog, setShowTranscriptionDialog] = useState(false);
  
  // Local state for immediate UI update
  const [localBonoId, setLocalBonoId] = useState<string | null>(null);
  const [localPrice, setLocalPrice] = useState<number>(0);
  const [localPatientId, setLocalPatientId] = useState<string | null>(null);
  const [localDateTime, setLocalDateTime] = useState<{ date: string; startTime: string; endTime: string } | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: patientBonos, refetch: refetchBonos } = usePatientActiveBonos(session?.patient_id);
  const { data: currentBono } = useBono(session?.bono_id); // Fetch currently assigned bono even if exhausted
  const { data: paymentStatus, refetch: refetchPaymentStatus } = useSessionPaymentStatus(session?.id);
  const { data: invoiceStatus, refetch: refetchInvoiceStatus } = useSessionInvoiceStatus(session?.id);
  const { data: bonoPaymentStatus, refetch: refetchBonoPaymentStatus } = useBonoPaymentStatus(localBonoId);
  const { consents, isLoading: consentsLoading } = useConsents(session?.patient_id);
  const { templates: consentTemplates } = useConsentTemplates();
  
  // For blocked sessions with newly assigned patient
  const { data: newPatientData } = usePatient(localPatientId || undefined);

  const createSignedInvoice = useCreateSignedInvoice();

  // Sync local state with session prop
  useEffect(() => {
    if (session) {
      setLocalBonoId(session.bono_id || null);
      setLocalPrice(Number(session.price) || 0);
      setLocalPatientId(null);
      setLocalDateTime(null);
      setLocalStatus(null);
      setEditingPatient(false);
      setSelectedInvoiceId(null);
    }
  }, [session?.id, session?.bono_id, session?.price, session?.session_date, session?.start_time, session?.end_time, session?.status, open]);

  if (!session) return null;

  const sessionData = session as any; // For new fields not yet in types
  const selectedLocation = locations?.find(l => l.id === sessionData.location_id);
  
  // Check if this is a recurring session
  const isRecurringSession = !!sessionData.recurring_series_id;
  const recurringSeriesId = sessionData.recurring_series_id;
  const occurrenceIndex = sessionData.occurrence_index || 1;

  const effectiveStatus = localStatus || session.status;
  const status = statusConfig[effectiveStatus as keyof typeof statusConfig] || statusConfig.scheduled;
  const isBlockedSession = effectiveStatus === 'blocked';
  
  // Use newPatientData if we just selected a patient, otherwise use session.patient
  const displayPatient = localPatientId && newPatientData ? newPatientData : session.patient;
  const patientName = displayPatient
    ? `${displayPatient.first_name} ${displayPatient.last_name}`
    : 'Sin contacto';

  // Handle recurring scope confirmation
  const handleRecurringScopeConfirm = async (scope: EditScope) => {
    if (!recurringSeriesId) return;

    if (recurringScopeAction === 'edit' && pendingRecurringUpdate) {
      await updateRecurringSession.mutateAsync({
        sessionId: session.id,
        updates: pendingRecurringUpdate,
        scope,
        seriesId: recurringSeriesId,
        occurrenceIndex,
      });
    } else if (recurringScopeAction === 'cancel') {
      await cancelRecurringSession.mutateAsync({
        sessionId: session.id,
        scope,
        seriesId: recurringSeriesId,
        occurrenceIndex,
      });
      if (scope !== 'this') {
        onOpenChange(false);
      }
    }

    setShowRecurringScopeDialog(false);
    setPendingRecurringUpdate(null);
  };

  // Handle patient change (and convert blocked sessions to scheduled)
  const handlePatientChange = async (newPatientId: string) => {
    setIsConvertingSession(true);
    try {
      const updates: any = { patient_id: newPatientId };
      
      // If blocked session, convert to scheduled and update the Google Calendar event
      if (isBlockedSession) {
        updates.status = 'scheduled';
        // Keep notes as reference but mark as converted
        const currentNotes = session.notes || '';
        const originalEvent = currentNotes.replace('[Google Calendar] ', '');
        updates.notes = originalEvent ? `Convertido desde: ${originalEvent}` : '';
      }
      
      await updateSession.mutateAsync({ id: session.id, ...updates });
      
      // If there's a Google Calendar event, update it with the new patient
      // The edge function will apply the configured format template
      if ((session as any).google_calendar_event_id) {
        try {
          // Sync to Google - the edge function will fetch patient data and apply format
          await syncToGoogle(session, {});
        } catch (googleError) {
          console.error('Error updating Google Calendar:', googleError);
        }
      }
      
      toast({ 
        title: isBlockedSession ? 'Cita creada' : 'Paciente actualizado',
        description: isBlockedSession
          ? 'El evento de Google Calendar se ha convertido en una cita.'
          : 'El paciente de la sesión ha sido actualizado.'
      });
      
      setEditingPatient(false);
      setLocalPatientId(null);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (error) {
      console.error('Error changing patient:', error);
      toast({ title: 'Error al cambiar paciente', variant: 'destructive' });
    }
    setIsConvertingSession(false);
  };


  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateSession.mutateAsync({
        id: session.id,
        status: newStatus as any,
      });
      
      // Sync status change to Google Calendar immediately (especially for cancellations)
      if (newStatus === 'cancelled') {
        try {
          await syncToGoogle(session, { status: 'cancelled' });
        } catch (googleError) {
          console.error('Error syncing cancellation to Google:', googleError);
        }
      }
      
      setLocalStatus(newStatus);
      toast({
        title: 'Estado actualizado',
        description: 'El estado de la sesión se ha actualizado.',
      });

      // Auto-invoice on completion if patient has it enabled
      if (newStatus === 'completed' && session.patient?.auto_invoice_on_complete && !session.bono_id) {
        const sessionPrice = Number(localPrice || session.price) || 0;
        if (sessionPrice > 0) {
          const taxRate = center?.default_tax_rate ?? 0;
          const includeTax = center?.include_tax_in_price ?? false;
          const unitPrice = includeTax ? sessionPrice / (1 + taxRate / 100) : sessionPrice;
          const taxAmount = unitPrice * (taxRate / 100);
          const itemTotal = unitPrice + taxAmount;

          try {
            const result = await createSignedInvoice.mutateAsync({
              patientId: session.patient_id,
              invoiceType: 'simplified',
              items: [{
                description: `${session.session_type || 'Sesión'} — ${format(new Date(session.session_date), 'dd/MM/yyyy')}`,
                quantity: 1,
                unit_price: Math.round(unitPrice * 100) / 100,
                tax_rate: taxRate,
                tax_amount: Math.round(taxAmount * 100) / 100,
                total: Math.round(itemTotal * 100) / 100,
                session_id: session.id,
              }],
              sendNotification: true,
              patientEmail: session.patient?.email,
              patientPhone: session.patient?.phone,
            });

            if (result.invoiceId) {
              toast({
                title: 'Factura generada',
                description: result.notificationSent
                  ? 'Se ha generado y enviado la factura automáticamente.'
                  : 'Se ha generado la factura automáticamente.',
              });
            }
          } catch (invoiceError) {
            console.error('Error generating auto-invoice:', invoiceError);
            toast({
              title: 'Error al facturar',
              description: 'La sesión se completó pero no se pudo generar la factura automática.',
              variant: 'destructive',
            });
          }
        }
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado.',
        variant: 'destructive',
      });
    }
    setIsUpdating(false);
  };

  const handlePriceSave = async () => {
    try {
      const newPrice = parseFloat(priceValue);
      await updateSession.mutateAsync({
        id: session.id,
        price: newPrice,
      });
      setLocalPrice(newPrice);
      toast({ title: 'Precio actualizado' });
      setEditingPrice(false);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleNotesSave = async () => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        notes: notesValue,
      });
      toast({ title: 'Notas guardadas' });
      setEditingNotes(false);
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleRoomSave = async (room: string) => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        room,
      });
      toast({ title: 'Despacho actualizado' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  const handleDateTimeEdit = () => {
    setDateTimeValue({
      date: session.session_date,
      startTime: session.start_time?.slice(0, 5) || '',
      endTime: session.end_time?.slice(0, 5) || '',
    });
    setEditingDateTime(true);
  };

  // Execute the actual date/time save
  const executeDateTimeSave = async () => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        session_date: dateTimeValue.date,
        start_time: dateTimeValue.startTime,
        end_time: dateTimeValue.endTime,
      });
      
      // Sync date/time changes to Google Calendar immediately
      try {
        const result = await syncMoveToGoogle(
          session,
          dateTimeValue.date,
          dateTimeValue.startTime,
          dateTimeValue.endTime
        );
        
        if (result.recreated) {
          toast({ title: 'Fecha y hora actualizadas', description: 'Evento de Google Calendar recreado.' });
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
        } else if (result.created) {
          toast({ title: 'Fecha y hora actualizadas', description: 'Evento creado en Google Calendar.' });
          queryClient.invalidateQueries({ queryKey: ['sessions'] });
        } else if (!result.success) {
          toast({ title: 'Fecha actualizada', description: result.error || 'Error sincronizando con Google.' });
        } else {
          toast({ title: 'Fecha y hora actualizadas' });
        }
      } catch (googleError) {
        console.error('Google sync failed:', googleError);
        toast({ title: 'Fecha actualizada', description: 'Error sincronizando con Google.' });
      }
      
      // Update local state immediately so UI reflects changes
      setLocalDateTime({
        date: dateTimeValue.date,
        startTime: dateTimeValue.startTime,
        endTime: dateTimeValue.endTime,
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setEditingDateTime(false);
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' });
    }
  };

  const handleDateTimeSave = async () => {
    if (!center?.id || !session.professional_id) {
      await executeDateTimeSave();
      return;
    }

    // Check if date/time actually changed
    const dateChanged = dateTimeValue.date !== session.session_date;
    const timeChanged = dateTimeValue.startTime !== session.start_time?.slice(0, 5) || 
                        dateTimeValue.endTime !== session.end_time?.slice(0, 5);

    if (!dateChanged && !timeChanged) {
      setEditingDateTime(false);
      return;
    }

    setIsCheckingConflicts(true);
    try {
      // Build the new session time range
      const newStart = new Date(`${dateTimeValue.date}T${dateTimeValue.startTime}`);
      const newEnd = new Date(`${dateTimeValue.date}T${dateTimeValue.endTime}`);

      const conflicts = await checkSessionConflicts({
        centerId: center.id,
        professionalId: session.professional_id,
        sessionsToCheck: [{ start: newStart, end: newEnd }],
        excludeSessionId: session.id,
      });

      if (conflicts.length > 0) {
        setDetectedConflicts(conflicts);
        setConflictsDialogOpen(true);
      } else {
        await executeDateTimeSave();
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
      // If conflict check fails, proceed anyway
      await executeDateTimeSave();
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const handleConflictForceCreate = async () => {
    setConflictsDialogOpen(false);
    setDetectedConflicts([]);
    await executeDateTimeSave();
  };

  const handleConflictCancel = () => {
    setConflictsDialogOpen(false);
    setDetectedConflicts([]);
  };

  const handleFieldSave = async (field: string, value: any) => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        [field]: value,
      });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast({ title: 'Guardado' });
    } catch {
      toast({ title: 'Error', variant: 'destructive' });
    }
  };

  // Smart modality change handler - generates video links when needed
  const handleModalityChange = async (newModality: string) => {
    const oldModality = sessionData.session_modality;
    if (newModality === oldModality) return;
    
    setIsChangingModality(true);
    try {
      const patientDisplayName = displayPatient
        ? `${displayPatient.first_name} ${displayPatient.last_name}`
        : 'Contacto';

      // Calculate duration in minutes
      const [startH, startM] = session.start_time.split(':').map(Number);
      const [endH, endM] = session.end_time.split(':').map(Number);
      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

      if (newModality === 'google_meet') {
        // Check if Google Meet is configured
        if (!integrations?.google_meet_enabled || !isProviderConnected('google')) {
          toast({ 
            title: 'Google Meet no configurado',
            description: 'Configura Google Meet en Ajustes > Integraciones',
            variant: 'destructive'
          });
          setIsChangingModality(false);
          return;
        }

        // Create Google Calendar event with Meet link
        const { data, error } = await supabase.functions.invoke('create-google-calendar-event', {
          body: {
            professional_id: session.professional_id,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
            title: `Sesión con ${patientDisplayName}`,
            description: `Sesión de ${session.session_type || 'terapia'}`,
            include_meet: true,
          },
        });

        if (error) throw error;

        await updateSession.mutateAsync({
          id: session.id,
          session_modality: newModality,
          video_provider: 'google_meet',
          video_call_link: data.meet_link,
          google_calendar_event_id: data.event_id,
        });

        toast({ title: 'Google Meet creado', description: 'Link de videollamada generado' });
      } else if (newModality === 'zoom') {
        // Check if Zoom is configured
        if (!integrations?.zoom_enabled || !isProviderConnected('zoom')) {
          toast({ 
            title: 'Zoom no configurado',
            description: 'Configura Zoom en Ajustes > Integraciones',
            variant: 'destructive'
          });
          setIsChangingModality(false);
          return;
        }

        // Create Zoom meeting
        const { data, error } = await supabase.functions.invoke('create-zoom-meeting', {
          body: {
            professional_id: session.professional_id,
            topic: `Sesión con ${patientDisplayName}`,
            session_date: session.session_date,
            start_time: session.start_time,
            end_time: session.end_time,
            patient_name: patientDisplayName,
          },
        });

        if (error) throw error;

        await updateSession.mutateAsync({
          id: session.id,
          session_modality: newModality,
          video_provider: 'zoom',
          video_call_link: data.join_url,
        });

        toast({ title: 'Reunión Zoom creada', description: 'Link de videollamada generado' });
      } else if (newModality === 'in_person') {
        // Cancel existing video meeting if any
        if (sessionData.video_provider === 'zoom' && sessionData.video_call_link) {
          try {
            const meetingId = sessionData.video_call_link.split('/').pop()?.split('?')[0];
            if (meetingId) {
              await supabase.functions.invoke('delete-zoom-meeting', {
                body: { professional_id: session.professional_id, meeting_id: meetingId },
              });
            }
          } catch (e) {
            console.error('Error deleting Zoom meeting:', e);
          }
        }

        await updateSession.mutateAsync({
          id: session.id,
          session_modality: newModality,
          video_provider: null,
          video_call_link: null,
        });

        toast({ title: 'Modalidad actualizada a presencial' });
      } else if (newModality === 'custom_link') {
        // Cancel existing video meeting if Zoom
        if (sessionData.video_provider === 'zoom' && sessionData.video_call_link) {
          try {
            const meetingId = sessionData.video_call_link.split('/').pop()?.split('?')[0];
            if (meetingId) {
              await supabase.functions.invoke('delete-zoom-meeting', {
                body: { professional_id: session.professional_id, meeting_id: meetingId },
              });
            }
          } catch (e) {
            console.error('Error deleting Zoom meeting:', e);
          }
        }

        await updateSession.mutateAsync({
          id: session.id,
          session_modality: newModality,
          video_provider: null,
        });

        toast({ title: 'Modalidad actualizada', description: 'Puedes añadir un link personalizado' });
      }

      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    } catch (error) {
      console.error('Error changing modality:', error);
      toast({ 
        title: 'Error al cambiar modalidad', 
        description: 'Inténtalo de nuevo',
        variant: 'destructive' 
      });
    }
    setIsChangingModality(false);
  };

  const handleDeleteSession = async () => {
    try {
      // Sync with Google Calendar first (delete the event)
      if ((session as any).google_calendar_event_id) {
        try {
          await syncToGoogle(session, { status: 'cancelled' });
        } catch (googleError) {
          console.error('Error deleting Google Calendar event:', googleError);
          // Continue with deletion even if Google sync fails
        }
      }
      
      await deleteSession.mutateAsync(session.id);
      toast({ title: 'Sesión eliminada' });
      onOpenChange(false);
    } catch {
      toast({ title: 'Error al eliminar', variant: 'destructive' });
    }
  };

  // Handle bono change using transactional RPCs
  const handleBonoChange = async (newBonoId: string) => {
    try {
      const usesBono = newBonoId !== '__none__';
      const currentBonoId = localBonoId;
      
      // Update local state immediately for responsive UI
      setLocalBonoId(usesBono ? newBonoId : null);
      
      if (!usesBono && currentBonoId) {
        // Removing bono - use RPC to return session to pool
        const result = await removeBonoFromSession.mutateAsync(session.id);
        const restoredPrice = (result as any)?.restored_price ?? Number(session.price);
        setLocalPrice(restoredPrice);
        toast({ 
          title: 'Bono quitado',
          description: 'La sesión se ha devuelto al bono y el precio se ha restaurado.',
        });
      } else if (usesBono) {
        // If there was a previous bono, first remove it
        if (currentBonoId && currentBonoId !== newBonoId) {
          await removeBonoFromSession.mutateAsync(session.id);
        }
        // Apply new bono using transactional RPC
        // The RPC now sets price=0 and deletes/updates the session debt
        await applyBonoToSession.mutateAsync({
          bonoId: newBonoId,
          sessionId: session.id,
        });
        
        // Update local price to 0 since session is now covered by bono
        setLocalPrice(0);
        
        toast({ 
          title: 'Bono asignado',
          description: 'Se ha descontado una sesión del bono y el coste de la sesión se ha marcado como cubierto.',
        });
      }
      
      // Refresh bonos list and payment status
      refetchBonos();
      refetchPaymentStatus();
    } catch (error: any) {
      // Revert local state on error
      setLocalBonoId(session.bono_id || null);
      toast({ title: 'Error al cambiar bono', description: error.message, variant: 'destructive' });
    }
  };

  // Handle new bono created - apply it to session
  const handleNewBonoCreated = async (bonoId: string, _totalPrice: number) => {
    // Apply the bono to this session (price is not changed - bono billing is separate)
    await handleBonoChange(bonoId);
  };

  // Handle generate payment link
  const handleGeneratePaymentLink = async () => {
    if (paymentLinkUrl) {
      // If we already have a link, copy it
      await navigator.clipboard.writeText(paymentLinkUrl);
      toast({ title: 'Link copiado al portapapeles' });
      return;
    }

    setIsGeneratingPaymentLink(true);
    try {
      const patientName = session.patient 
        ? `${session.patient.first_name} ${session.patient.last_name}`.trim() 
        : 'Contacto';
      
      const checkoutUrl = await createStripeCheckout(
        session.id,
        session.professional_id,
        session.patient_id,
        session.patient?.email || null,
        patientName,
        localPrice,
        session.session_type || 'individual',
        session.session_date
      );

      if (checkoutUrl) {
        setPaymentLinkUrl(checkoutUrl);
        await navigator.clipboard.writeText(checkoutUrl);
        toast({ title: 'Link de pago generado y copiado al portapapeles' });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'No se pudo generar el link de pago. Verifica que Stripe esté configurado.',
        variant: 'destructive' 
      });
    } finally {
      setIsGeneratingPaymentLink(false);
    }
  };

  // Common header content
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => onOpenChange(false)}
      >
        <X className="h-5 w-5" />
      </Button>
      <div className="flex-1 text-center">
        <span className="text-lg font-semibold">Detalle de sesión</span>
        {isRecurringSession && (
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground mt-0.5">
            <RefreshCw className="h-3 w-3" />
            <span>Cita recurrente</span>
          </div>
        )}
      </div>
      <Badge className={cn(status.className, "shrink-0")} variant={status.variant}>
        {status.label}
      </Badge>
    </div>
  );

  // Common tabs content (everything inside Tabs)
  const tabsContent = (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="w-full justify-start px-3 sm:px-6 rounded-none border-b bg-transparent h-auto p-0 overflow-x-auto flex-nowrap">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="info"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <FileText className="h-4 w-4" /> : 'Info'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Info</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="evaluaciones"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <ClipboardCheck className="h-4 w-4" /> : 'Evaluaciones'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Evaluaciones</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="consentimientos"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <FileSignature className="h-4 w-4" /> : 'Consentimientos'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Consentimientos</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="autoregistros"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <NotebookPen className="h-4 w-4" /> : 'Autorregistros'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Autorregistros</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="facturas"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <Receipt className="h-4 w-4" /> : 'Facturas'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Facturas</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="otras"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <Calendar className="h-4 w-4" /> : 'Otras sesiones'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Otras sesiones</TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </TabsList>

          <TabsContent value="info" className="mt-0 px-4 sm:px-6 py-4 space-y-6">
            {/* Patient Card / Blocked Session Conversion */}
            {isBlockedSession && !session.patient ? (
              // Blocked session without patient - show conversion UI
              <div className="p-4 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <RefreshCw className="h-5 w-5" />
                  <h3 className="font-semibold">Convertir a cita</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Asigna un paciente para convertir este evento de Google Calendar en una cita de Psycma.
                </p>
                <PatientSelector 
                  onSelect={handlePatientChange}
                  disabled={isConvertingSession}
                />
                {isConvertingSession && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Convirtiendo...
                  </div>
                )}
              </div>
            ) : editingPatient ? (
              // Editing patient mode
              <div className="p-4 rounded-lg border bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Cambiar paciente</h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setEditingPatient(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <PatientSelector 
                  onSelect={handlePatientChange}
                  disabled={isConvertingSession}
                />
                {isConvertingSession && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Actualizando...
                  </div>
                )}
              </div>
            ) : (
              // Normal patient card with edit button
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 group">
                <div
                  className="flex items-center gap-4 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => {
                    if (displayPatient) {
                      navigate(`/pacientes/${displayPatient.id}`);
                      onOpenChange(false);
                    }
                  }}
                >
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{patientName}</h3>
                    {displayPatient?.email && (
                      <p className="text-sm text-muted-foreground">{displayPatient.email}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingPatient(true);
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Tags */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Añadir etiqueta
              </Button>
            </div>

            <Separator />

            {/* Session Details */}
            <div className="space-y-4">
              {/* Date & Time */}
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                {editingDateTime ? (
                  <div className="flex-1 space-y-3">
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-8 w-full justify-start text-left font-normal">
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateTimeValue.date
                            ? format(parse(dateTimeValue.date, 'yyyy-MM-dd', new Date()), "dd/MM/yyyy")
                            : 'Seleccionar fecha'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                        <CalendarPicker
                          mode="single"
                          selected={dateTimeValue.date ? parse(dateTimeValue.date, 'yyyy-MM-dd', new Date()) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              setDateTimeValue(prev => ({ ...prev, date: format(date, 'yyyy-MM-dd') }));
                            }
                          }}
                          locale={es}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="time"
                        value={dateTimeValue.startTime}
                        onChange={(e) => {
                          const newStart = e.target.value;
                          setDateTimeValue(prev => {
                            // Calculate duration from original times to preserve it
                            const [oldH, oldM] = prev.startTime.split(':').map(Number);
                            const [endH, endM] = prev.endTime.split(':').map(Number);
                            const durationMin = (endH * 60 + endM) - (oldH * 60 + oldM);
                            const [newH, newM] = newStart.split(':').map(Number);
                            const newEndTotal = newH * 60 + newM + (durationMin > 0 ? durationMin : 60);
                            const newEndH = String(Math.floor(newEndTotal / 60) % 24).padStart(2, '0');
                            const newEndM = String(newEndTotal % 60).padStart(2, '0');
                            return { ...prev, startTime: newStart, endTime: `${newEndH}:${newEndM}` };
                          });
                        }}
                        className="h-8 flex-1"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="time"
                        value={dateTimeValue.endTime}
                        onChange={(e) => setDateTimeValue(prev => ({ ...prev, endTime: e.target.value }))}
                        className="h-8 flex-1"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingDateTime(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleDateTimeSave}
                        disabled={updateSession.isPending}
                      >
                        {updateSession.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <p className="font-medium capitalize">
                        {format(new Date(localDateTime?.date || session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(localDateTime?.startTime || session.start_time)?.slice(0, 5)} - {(localDateTime?.endTime || session.end_time)?.slice(0, 5)}
                      </p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-9 w-9 border-primary text-primary hover:bg-primary/10"
                      onClick={handleDateTimeEdit}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Professional */}
              {session.professional && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <p className="flex-1">
                    {session.professional.first_name} {session.professional.last_name}
                  </p>
                </div>
              )}

              {/* Session Type */}
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1 flex items-center gap-2">
                  <span>{sessionTypeLabels[session.session_type || 'individual'] || session.session_type}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              {/* Bono */}
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-muted-foreground" />
                <div className="flex gap-2 flex-1">
                  <Select
                    value={localBonoId || '__none__'}
                    onValueChange={(value) => handleBonoChange(value)}
                    disabled={applyBonoToSession.isPending || removeBonoFromSession.isPending}
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue placeholder="Sin bono">
                        {localBonoId && currentBono ? (
                          <span className="flex items-center gap-2">
                            {currentBono.name}
                            <Badge variant="secondary" className="ml-1 text-xs">
                              {(currentBono.total_sessions || 0) - (currentBono.used_sessions || 0)} restantes
                            </Badge>
                          </span>
                        ) : (
                          'Sin bono'
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin bono</SelectItem>
                      {/* Show currently assigned bono if not in active list (e.g., exhausted) */}
                      {currentBono && localBonoId && !patientBonos?.some(b => b.id === localBonoId) && (
                        <SelectItem key={currentBono.id} value={currentBono.id}>
                          <span className="flex items-center gap-2">
                            {currentBono.name}
                            <Badge variant="outline" className="ml-2 text-xs">
                              {currentBono.status === 'exhausted' ? 'Agotado' : currentBono.status}
                            </Badge>
                          </span>
                        </SelectItem>
                      )}
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
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowCreateBonoDialog(true)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Room */}
              <div className="flex items-center gap-3">
                <DoorOpen className="h-5 w-5 text-muted-foreground" />
                <Select
                  value={sessionData.room || '__none__'}
                  onValueChange={(value) => handleRoomSave(value === '__none__' ? '' : value)}
                >
                  <SelectTrigger className="flex-1 h-8">
                    <SelectValue placeholder="Sin despacho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin despacho</SelectItem>
                    <SelectItem value="despacho-1">Despacho 1</SelectItem>
                    <SelectItem value="despacho-2">Despacho 2</SelectItem>
                    <SelectItem value="despacho-3">Despacho 3</SelectItem>
                    <SelectItem value="sala-espera">Sala de espera</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Session Modality */}
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-muted-foreground" />
                <Select
                  value={sessionData.session_modality || 'in_person'}
                  onValueChange={handleModalityChange}
                  disabled={isChangingModality}
                >
                  <SelectTrigger className="flex-1 h-8">
                    {isChangingModality ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Cambiando...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Seleccionar modalidad" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">Presencial</SelectItem>
                    <SelectItem value="google_meet">Google Meet</SelectItem>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="custom_link">Link personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show current video link if exists for google_meet or zoom */}
              {(sessionData.session_modality === 'google_meet' || sessionData.session_modality === 'zoom') && sessionData.video_call_link && (
                <div className="flex items-center gap-3 ml-8">
                  <LinkIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground truncate flex-1">{sessionData.video_call_link}</span>
                  <a 
                    href={sessionData.video_call_link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>
              )}

              {/* Custom Video Link - Only show when custom_link is selected */}
              {sessionData.session_modality === 'custom_link' && (
                <div className="flex items-center gap-3 ml-8">
                  <LinkIcon className="h-5 w-5 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://..."
                    className="flex-1 h-8"
                    value={sessionData.video_call_link || ''}
                    onChange={(e) => handleFieldSave('video_call_link', e.target.value)}
                  />
                  {sessionData.video_call_link && (
                    <a 
                      href={sessionData.video_call_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                </div>
              )}

              {/* Location - Only show when in_person */}
              {(sessionData.session_modality === 'in_person' || !sessionData.session_modality) && (
                <div className="flex items-center gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                  <Select
                    value={sessionData.location_id || '__none__'}
                    onValueChange={(value) => handleFieldSave('location_id', value === '__none__' ? null : value)}
                  >
                    <SelectTrigger className="flex-1 h-8">
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
                </div>
              )}

              {/* Cancellation Policy */}
              <div className="flex items-center gap-3">
                <Ban className="h-5 w-5 text-muted-foreground" />
                <Select
                  value={sessionData.cancellation_policy || '24_hours'}
                  onValueChange={(value) => handleFieldSave('cancellation_policy', value)}
                >
                  <SelectTrigger className="flex-1 h-8">
                    <SelectValue placeholder="Política de cancelación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_allowed">No permitir cancelaciones</SelectItem>
                    <SelectItem value="until_start">Hasta la hora de la sesión</SelectItem>
                    <SelectItem value="1_hour">Hasta 1 hora antes</SelectItem>
                    <SelectItem value="2_hours">Hasta 2 horas antes</SelectItem>
                    <SelectItem value="24_hours">Hasta 24 horas antes</SelectItem>
                    <SelectItem value="48_hours">Hasta 48 horas antes</SelectItem>
                    <SelectItem value="72_hours">Hasta 72 horas antes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Payment Section */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Pago</h4>

              {/* Price */}
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground" />
                {editingPrice ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-24 h-8"
                      value={priceValue}
                      onChange={(e) => setPriceValue(e.target.value)}
                      autoFocus
                    />
                    <span className="text-sm">€</span>
                    <Button size="sm" variant="ghost" onClick={handlePriceSave}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPrice(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{localPrice.toFixed(2)}€</span>
                    {/* Payment Status Badge */}
                    {localBonoId ? (
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                        <Package className="h-3 w-3 mr-1" />
                        Cubierto por bono
                      </Badge>
                    ) : paymentStatus?.isPaid ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Pagado
                      </Badge>
                    ) : paymentStatus?.isPartial ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        Pago parcial
                      </Badge>
                    ) : localPrice === 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin cargo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        Pendiente de pago
                      </Badge>
                    )}
                    {/* Only show edit button if not paid and not invoiced */}
                    {!paymentStatus?.isPaid && !invoiceStatus?.hasValidInvoice ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setPriceValue(localPrice.toString());
                          setEditingPrice(true);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="h-6 w-6 flex items-center justify-center text-muted-foreground">
                              <LinkIcon className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>No se puede modificar el precio de una sesión cobrada o facturada</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {/* Invoice Button with status-based logic - now supports multiple invoices */}
                {invoiceStatus?.isInvoiced && invoiceStatus.invoices?.length > 0 ? (
                  <div className="w-full space-y-2">
                    <p className="text-xs text-muted-foreground">Facturas asociadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {invoiceStatus.invoices.map((inv: any) => (
                        <Button 
                          key={inv.id}
                          size="sm" 
                          variant="outline"
                          className={cn(
                            "text-blue-600 border-blue-300",
                            !inv.is_valid && "line-through opacity-60"
                          )}
                          onClick={() => navigate('/facturas')}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          {inv.invoice_number}
                          {!inv.is_valid && <span className="ml-1 text-amber-600">(Anulada)</span>}
                        </Button>
                      ))}
                    </div>
                    {/* Show create invoice button if billable event is still pending */}
                    {invoiceStatus.canCreateInvoice && localPrice > 0 && !localBonoId && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setShowInvoiceDialog(true)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Nueva factura
                      </Button>
                    )}
                  </div>
                ) : localBonoId ? (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="sm" variant="outline" disabled>
                            <Package className="h-4 w-4 mr-1" />
                            Cubierto por bono
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Las sesiones cubiertas por bono no generan factura individual</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {/* Show "Cobrar bono" button if bono has pending payment */}
                    {bonoPaymentStatus?.hasPendingPayment && bonoPaymentStatus.debt && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        onClick={() => setShowBonoPaymentDialog(true)}
                      >
                        <CreditCard className="h-4 w-4 mr-1" />
                        Cobrar bono
                      </Button>
                    )}
                  </>
                ) : localPrice === 0 ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" disabled>
                          <FileText className="h-4 w-4 mr-1" />
                          Sin cargo
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>No se puede facturar una sesión sin cargo</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setShowInvoiceDialog(true)}
                  >
                    <FileText className="h-4 w-4 mr-1" />
                    Crear factura
                  </Button>
                )}
                
                {!paymentStatus?.isPaid && !localBonoId && !session.bono_id && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={localPrice === 0}
                    onClick={() => setShowPaymentDialog(true)}
                  >
                    <CreditCard className="h-4 w-4 mr-1" />
                    Cobrar sesión
                  </Button>
                )}
              </div>
              
              {/* Paid Session Info */}
              {paymentStatus?.isPaid && !localBonoId && (
                <p className="text-xs text-muted-foreground">
                  El pago de esta sesión se puede editar o eliminar desde{' '}
                  <Button
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      navigate('/cobros');
                      onOpenChange(false);
                    }}
                  >
                    Cobros →
                  </Button>
                </p>
              )}

              {/* Payment Link */}
              {!paymentStatus?.isPaid && localPrice > 0 && !localBonoId && (
                <div className="flex items-center gap-2 text-sm">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Link de pago:</span>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-primary"
                    disabled={isGeneratingPaymentLink}
                    onClick={handleGeneratePaymentLink}
                  >
                    {isGeneratingPaymentLink ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Generando...
                      </>
                    ) : paymentLinkUrl ? (
                      'Copiar link'
                    ) : (
                      'Generar link'
                    )}
                  </Button>
                  {paymentLinkUrl && (
                    <a 
                      href={paymentLinkUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Communications Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-muted-foreground">Comunicaciones</h4>
                <Badge variant={whatsappDelivery.statusInfo.variant} className="text-xs">
                  WhatsApp: {whatsappDelivery.statusInfo.label}
                </Badge>
              </div>

              {/* Reminder Preferences */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Recordatorios programados</p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={session.send_reminder_whatsapp || false} 
                      onCheckedChange={(checked) => handleFieldSave('send_reminder_whatsapp', !!checked)}
                    />
                    <Phone className="h-4 w-4 text-green-600" />
                    WhatsApp
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={session.send_reminder_sms || false} 
                      onCheckedChange={(checked) => handleFieldSave('send_reminder_sms', !!checked)}
                      disabled
                    />
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    SMS
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox 
                      checked={session.send_reminder_email || false} 
                      onCheckedChange={(checked) => handleFieldSave('send_reminder_email', !!checked)}
                    />
                    <Mail className="h-4 w-4" />
                    Email
                  </label>
                </div>
              </div>

              {/* Send Now Actions */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Enviar ahora</p>
                <div className="flex flex-wrap gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-green-600 border-green-200 hover:bg-green-50"
                    disabled={!session.patient?.phone || isSendingWhatsAppNow}
                    onClick={async () => {
                      if (!session.patient?.phone || !center?.id) return;

                      const patientFirstName = session.patient?.first_name || '';
                      const patientLastName = session.patient?.last_name || '';
                      const patientFullName = `${patientFirstName} ${patientLastName}`.trim() || patientFirstName;

                      const professionalName = session.professional 
                        ? `${session.professional.first_name} ${session.professional.last_name}` 
                        : '';

                      const sessionDate = format(new Date(session.session_date), "d 'de' MMMM", { locale: es });
                      const sessionTime = session.start_time?.slice(0, 5) || '';

                      // Build appointment link using access_token
                      const appointmentLink = session.access_token 
                        ? `${window.location.origin}/cita/${session.access_token}`
                        : window.location.href;

                      // Build message from template
                      let message = DEFAULT_TEMPLATES.whatsapp.notification.whatsapp_message || '';
                      message = message
                        .replace('{nombre_paciente}', patientFirstName)
                        .replace('{profesional_nombre}', professionalName)
                        .replace('{fecha}', sessionDate)
                        .replace('{zona_horaria}', sessionTime)
                        .replace('{sesion_tipo}', session.session_type || 'Individual')
                        .replace('{link_sesion}', appointmentLink)
                        .replace('{link_confirmar}', appointmentLink);

                      setIsSendingWhatsAppNow(true);
                      try {
                        const { result, manualLink } = await whatsappDelivery.sendWhatsApp({
                          phone: session.patient.phone,
                          message,
                          patientId: session.patient.id,
                          patientName: patientFullName,
                          sessionId: session.id,
                          centerId: center.id,
                          messageType: 'notification',
                        });

                        // Manual fallback: open WhatsApp using configured-friendly behavior
                        if (!result.autoSent && manualLink) {
                          await openWhatsAppSmart(
                            session.patient.phone,
                            message,
                            !isMobile ? 'web' : undefined
                          );
                        }
                      } catch (e) {
                        console.error('Error sending WhatsApp now:', e);
                        toast({
                          title: 'Error',
                          description: 'No se pudo enviar el WhatsApp.',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsSendingWhatsAppNow(false);
                      }
                    }}
                  >
                    {isSendingWhatsAppNow ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    WhatsApp
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled
                  >
                    <Send className="h-4 w-4 mr-1" />
                    SMS
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={!session.patient?.email || sendEmailNotification.isPending}
                    onClick={() => {
                      if (!session.patient?.email) return;
                      
                      const patientFullName = `${session.patient.first_name} ${session.patient.last_name}`;
                      const professionalName = session.professional 
                        ? `${session.professional.first_name || ''} ${session.professional.last_name || ''}`.trim()
                        : '';
                      const sessionDate = format(new Date(session.session_date), "dd/MM/yyyy", { locale: es });
                      const sessionTime = session.start_time?.slice(0, 5) || '';
                      
                      sendEmailNotification.mutate({
                        patientId: session.patient.id,
                        patientName: patientFullName,
                        patientEmail: session.patient.email,
                        sessionId: session.id,
                        sessionDate,
                        sessionTime,
                        professionalName,
                        sessionType: session.session_type || 'Individual',
                        type: 'notification',
                        channels: {
                          whatsapp: false,
                          email: true,
                          sms: false,
                        },
                        sessionAccessToken: session.access_token,
                      });
                    }}
                  >
                    {sendEmailNotification.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Email
                  </Button>
                </div>
                {!session.patient?.phone && (
                  <p className="text-xs text-muted-foreground">
                    El paciente no tiene teléfono registrado
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Private Notes */}
            <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <span className="font-medium text-sm">Apuntes privados de la sesión</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', notesOpen && 'rotate-180')} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      placeholder="Añade notas privadas sobre esta sesión..."
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleNotesSave}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNotes(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-3 rounded-lg border bg-muted/30 min-h-[60px] cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setNotesValue(session.notes || '');
                      setEditingNotes(true);
                    }}
                  >
                    {session.notes ? (
                      <p className="text-sm">{session.notes}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Haz clic para añadir notas...</p>
                    )}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            <Separator />

            {/* Status Change */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Cambiar estado</p>
              <Select
                value={effectiveStatus || 'scheduled'}
                onValueChange={handleStatusChange}
                disabled={isUpdating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="scheduled">Programada</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                  <SelectItem value="no_show">No asistió</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Delete Google Calendar Block (only for Google events) */}
            {(session as any).isGoogleEvent && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full mt-4">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar bloqueo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Eliminar este bloqueo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Este bloqueo de Google Calendar será eliminado de la agenda. Esta acción no se puede deshacer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        deleteCalendarEvent.mutate({
                          calendarEventId: session.id,
                          googleEventId: (session as any).google_calendar_event_id,
                          professionalId: (session as any).professional_id,
                        });
                        onOpenChange(false);
                      }}
                    >
                      Eliminar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Delete/Cancel Session (only for regular sessions) */}
            {!(session as any).isGoogleEvent && (
              isRecurringSession ? (
                // Recurring session - use scope dialog
                <Button 
                  variant="destructive" 
                  className="w-full mt-4"
                  onClick={() => {
                    setRecurringScopeAction('cancel');
                    setShowRecurringScopeDialog(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Cancelar cita recurrente
                </Button>
              ) : (
                // Regular session - use existing delete dialog
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full mt-4">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar sesión
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {(paymentStatus?.isPaid || paymentStatus?.isPartial || (invoiceStatus?.isInvoiced && invoiceStatus?.hasValidInvoice))
                          ? '⚠️ ¿Eliminar sesión con cobros/factura?'
                          : '¿Eliminar esta sesión?'}
                      </AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <span className="block">
                          Esta acción no se puede deshacer. La sesión será eliminada permanentemente.
                        </span>
                        {(paymentStatus?.isPaid || paymentStatus?.isPartial) && (
                          <span className="block text-destructive font-medium">
                            Esta sesión tiene pagos registrados que quedarán huérfanos.
                          </span>
                        )}
                        {invoiceStatus?.isInvoiced && invoiceStatus?.hasValidInvoice && (
                          <span className="block text-destructive font-medium">
                            Esta sesión tiene una factura asociada que no será eliminada.
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={handleDeleteSession}
                        className={cn(
                          (paymentStatus?.isPaid || paymentStatus?.isPartial || (invoiceStatus?.isInvoiced && invoiceStatus?.hasValidInvoice)) &&
                          "bg-destructive hover:bg-destructive/90"
                        )}
                      >
                        {(paymentStatus?.isPaid || paymentStatus?.isPartial || (invoiceStatus?.isInvoiced && invoiceStatus?.hasValidInvoice))
                          ? 'Eliminar de todos modos'
                          : 'Eliminar'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )
            )}

            {/* External Links */}
            <div className="flex gap-4 pt-4">
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  if (session.patient) {
                    navigate(`/pacientes/${session.patient.id}`);
                    onOpenChange(false);
                  }
                }}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Historia clínica
              </Button>
              <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Justificante de asistencia
              </Button>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => setShowTranscriptionDialog(true)}
              >
                <Brain className="h-3 w-3 mr-1" />
                Analizar transcripción
              </Button>
            </div>

          </TabsContent>

          <TabsContent value="evaluaciones" className="mt-0 px-4 sm:px-6 py-4">
            {!session.patient ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Asigna un paciente para ver sus evaluaciones</p>
              </div>
            ) : (
              <PatientAssessments patientId={session.patient.id} />
            )}
          </TabsContent>

          <TabsContent value="consentimientos" className="mt-0 px-4 sm:px-6 py-4">
            {!session.patient ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileSignature className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Asigna un paciente para gestionar consentimientos</p>
              </div>
            ) : consentsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Create consent button */}
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Consentimientos del paciente</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowCreateConsentDialog(true)}
                    disabled={consentTemplates.filter(t => t.is_active).length === 0}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo
                  </Button>
                </div>

                {consentTemplates.filter(t => t.is_active).length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    <p>No hay plantillas de consentimiento configuradas.</p>
                    <p className="text-xs mt-1">Configúralas en Ajustes → Plantillas de consentimiento</p>
                  </div>
                )}

                {/* List of consents */}
                {consents.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <FileSignature className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Sin consentimientos</p>
                    <p className="text-xs mt-1">Crea un consentimiento para enviar al paciente</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {consents.map((consent) => (
                      <ConsentCard key={consent.id} consent={consent} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="autoregistros" className="mt-0 px-4 sm:px-6 py-4">
            {session.patient_id ? (
              <PatientAutoregistros patientId={session.patient_id} />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <NotebookPen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Asigna un paciente para ver sus autorregistros</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="facturas" className="mt-0 px-4 sm:px-6 py-4">
            {session.patient_id ? (
              <PatientInvoices 
                patientId={session.patient_id} 
                onInvoiceClick={(id) => setSelectedInvoiceId(id)} 
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Asigna un paciente para ver sus facturas</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="otras" className="mt-0 px-4 sm:px-6 py-4">
            {session.patient_id ? (
              <PatientSessionHistory
                patientId={session.patient_id}
                currentSessionId={session.id}
                onSessionClick={(sessionId) => {
                  // Close drawer and navigate to the new session
                  onOpenChange(false);
                  // Use a small delay to allow drawer to close, then trigger session selection
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('select-session', { detail: { sessionId } }));
                  }, 100);
                }}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sin paciente asignado</p>
              </div>
            )}
          </TabsContent>
    </Tabs>
  );

  return (
    <>
    {isMobile ? (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[95vh] max-h-[95vh] overflow-hidden">
          <DrawerHeader className="px-4 pt-4 pb-2 border-b">
            {headerContent}
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">
            {tabsContent}
          </div>
        </DrawerContent>
      </Drawer>
    ) : (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[520px] p-0 overflow-y-auto">
          <SheetHeader className="px-6 pt-6 pb-4 sticky top-0 bg-background z-10 border-b">
            {headerContent}
          </SheetHeader>
          {tabsContent}
        </SheetContent>
      </Sheet>
    )}

    <CreateBonoDialog
      open={showCreateBonoDialog}
      onOpenChange={(open) => {
        setShowCreateBonoDialog(open);
        if (!open) {
          refetchBonos();
        }
      }}
      preselectedPatientId={session.patient_id}
      onSuccess={handleNewBonoCreated}
    />

    {session.patient && (
      <CollectSessionPaymentDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        sessionId={session.id}
        patientId={session.patient_id}
        patientName={patientName}
        patientEmail={session.patient?.email}
        patientPhone={session.patient?.phone}
        amount={localPrice}
        sessionDate={session.session_date}
        sessionType={session.session_type}
        onSuccess={(invoiceData) => {
          refetchPaymentStatus();
          if (invoiceData && session.patient) {
            setCreatedInvoiceForSend({
              id: invoiceData.id,
              invoice_number: invoiceData.invoice_number,
              total: invoiceData.total,
              patients: {
                id: session.patient.id,
                first_name: session.patient.first_name,
                last_name: session.patient.last_name,
                email: session.patient.email,
                phone: session.patient.phone,
              },
            });
            setShowSendInvoiceDialog(true);
          }
        }}
      />
    )}

    {session && (
      <CreateSessionInvoiceDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        session={session}
        onSuccess={(invoice) => {
          refetchInvoiceStatus();
          setShowInvoiceDialog(false);
          // Prepare invoice data for send dialog
          if (session.patient) {
            setCreatedInvoiceForSend({
              id: invoice.id,
              invoice_number: invoice.invoice_number,
              total: invoice.total,
              patients: {
                id: session.patient.id,
                first_name: session.patient.first_name,
                last_name: session.patient.last_name,
                email: session.patient.email,
                phone: session.patient.phone,
              },
            });
            setShowSendInvoiceDialog(true);
          }
        }}
      />
    )}

    {/* Send Invoice Dialog - after creating invoice from session */}
    <SendInvoiceDialog
      open={showSendInvoiceDialog}
      onOpenChange={(open) => {
        setShowSendInvoiceDialog(open);
        if (!open) setCreatedInvoiceForSend(null);
      }}
      invoice={createdInvoiceForSend}
    />

    {/* Convert Calendar Event Dialog - for Google Calendar blocks */}
    {(session as any).isGoogleEvent && (
      <ConvertCalendarEventDialog
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        calendarEvent={{
          id: session.id,
          professional_id: session.professional_id,
          provider: 'google',
          calendar_id: '',
          google_event_id: (session as any).google_event_id || '',
          summary: session.notes?.replace('[Google Calendar] ', '') || null,
          description: null,
          location: null,
          start_at: `${session.session_date}T${session.start_time}`,
          end_at: `${session.session_date}T${session.end_time}`,
          all_day: (session as any).all_day || false,
          deleted: false,
          status: 'confirmed',
        } as CalendarEvent}
        onSuccess={() => onOpenChange(false)}
      />
    )}

    {/* Recurring Scope Dialog */}
    {isRecurringSession && (
      <EditRecurringScopeDialog
        open={showRecurringScopeDialog}
        onOpenChange={setShowRecurringScopeDialog}
        onConfirm={handleRecurringScopeConfirm}
        action={recurringScopeAction}
        isLoading={updateRecurringSession.isPending || cancelRecurringSession.isPending}
      />
    )}

    {/* Conflicts Dialog for date/time edits */}
    <ConflictsDialog
      open={conflictsDialogOpen}
      conflicts={detectedConflicts}
      onCancel={handleConflictCancel}
      onForceCreate={handleConflictForceCreate}
      isRecurring={false}
    />

    {/* Collect Bono Payment Dialog */}
    {session && localBonoId && bonoPaymentStatus?.debt && bonoPaymentStatus.bono && (
      <CollectBonoPaymentDialog
        open={showBonoPaymentDialog}
        onOpenChange={setShowBonoPaymentDialog}
        bonoId={localBonoId}
        bonoName={bonoPaymentStatus.bono.name}
        patientId={session.patient_id}
        patientName={patientName}
        debtId={bonoPaymentStatus.debt.id}
        invoiceId={bonoPaymentStatus.debt.invoice_id}
        totalAmount={bonoPaymentStatus.bono.total_price}
        paidAmount={bonoPaymentStatus.debt.paid_amount}
        onSuccess={() => {
          refetchBonoPaymentStatus();
          refetchPaymentStatus();
        }}
      />
    )}

    {/* Create Consent Dialog */}
    {session.patient && (
      <CreateConsentDialog
        open={showCreateConsentDialog}
        onOpenChange={setShowCreateConsentDialog}
        patient={session.patient as Patient}
        onSuccess={async (consentId) => {
          // Fetch the newly created consent to open send dialog
          const { data } = await supabase
            .from('consents')
            .select(`
              *,
              template:consent_templates(name),
              patient:patients(first_name, last_name),
              professional:profiles(first_name, last_name)
            `)
            .eq('id', consentId)
            .single();
          
          if (data) {
            setSendConsentDialogData(data as Consent);
          }
          
          // Invalidate to refresh the list
          queryClient.invalidateQueries({ queryKey: ['consents'] });
        }}
      />
    )}

    {/* Send Consent Dialog */}
    {sendConsentDialogData && (
      <SendConsentDialog
        consent={sendConsentDialogData}
        open={!!sendConsentDialogData}
        onOpenChange={(open) => !open && setSendConsentDialogData(null)}
      />
    )}

    {/* Invoice Detail Dialog */}
    <InvoiceDetailDialog
      open={!!selectedInvoiceId}
      onOpenChange={(open) => { if (!open) setSelectedInvoiceId(null); }}
      invoiceId={selectedInvoiceId}
    />

    {/* Transcription Analysis Dialog - outside Drawer to allow paste */}
    <TranscriptionAnalysisDialog
      open={showTranscriptionDialog}
      onOpenChange={setShowTranscriptionDialog}
      patientName={session?.patient ? `${session.patient.first_name} ${session.patient.last_name}` : undefined}
      sessionDate={session?.session_date}
    />
    </>
  );
}
