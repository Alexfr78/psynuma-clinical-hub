import { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  MessageSquare,
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
import { usePatientActiveBonos, useDeductBonoSession, useUpdateBono } from '@/hooks/useBonos';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { useSessionPaymentStatus } from '@/hooks/useSessionPayment';
import { useSessionInvoiceStatus } from '@/hooks/useInvoices';
import { CollectSessionPaymentDialog } from './CollectSessionPaymentDialog';
import { CreateSessionInvoiceDialog } from './CreateSessionInvoiceDialog';
import { useSendWhatsAppNow } from '@/hooks/useSendSessionNotification';
import { useCenter } from '@/hooks/useCenter';
import { DEFAULT_TEMPLATES } from '@/hooks/useCommunicationTemplates';
import { useIsMobile } from '@/hooks/use-mobile';
import { createStripeCheckout } from '@/hooks/useSessionIntegrations';
import { useGoogleCalendarUpdate } from '@/hooks/useGoogleCalendarUpdate';
import { PatientSelector } from './PatientSelector';
import { usePatient } from '@/hooks/usePatients';
import { supabase } from '@/integrations/supabase/client';
import { useProfessionalIntegrations } from '@/hooks/useProfessionalIntegrations';

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
  const deductBonoSession = useDeductBonoSession();
  const updateBono = useUpdateBono();
  const { data: locations } = useLocations();
  const { center } = useCenter();
  const sendWhatsAppNow = useSendWhatsAppNow();
  const isMobile = useIsMobile();
  const { syncToGoogle, syncMoveToGoogle } = useGoogleCalendarUpdate();
  const { integrations, isProviderConnected } = useProfessionalIntegrations();
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
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);
  const [paymentLinkUrl, setPaymentLinkUrl] = useState<string | null>(null);
  const [dateTimeValue, setDateTimeValue] = useState({
    date: '',
    startTime: '',
    endTime: '',
  });
  
  // Local state for immediate UI update
  const [localBonoId, setLocalBonoId] = useState<string | null>(null);
  const [localPrice, setLocalPrice] = useState<number>(0);
  const [localPatientId, setLocalPatientId] = useState<string | null>(null);

  const { data: patientBonos, refetch: refetchBonos } = usePatientActiveBonos(session?.patient_id);
  const { data: paymentStatus, refetch: refetchPaymentStatus } = useSessionPaymentStatus(session?.id);
  const { data: invoiceStatus, refetch: refetchInvoiceStatus } = useSessionInvoiceStatus(session?.id);
  
  // For blocked sessions with newly assigned patient
  const { data: newPatientData } = usePatient(localPatientId || undefined);

  // Sync local state with session prop
  useEffect(() => {
    if (session) {
      setLocalBonoId(session.bono_id || null);
      setLocalPrice(Number(session.price) || 0);
      setLocalPatientId(null); // Reset when session changes
      setEditingPatient(false);
    }
  }, [session?.id, session?.bono_id, session?.price]);

  if (!session) return null;

  const sessionData = session as any; // For new fields not yet in types
  const selectedLocation = locations?.find(l => l.id === sessionData.location_id);

  const status = statusConfig[session.status as keyof typeof statusConfig] || statusConfig.scheduled;
  const isBlockedSession = session.status === 'blocked';
  
  // Use newPatientData if we just selected a patient, otherwise use session.patient
  const displayPatient = localPatientId && newPatientData ? newPatientData : session.patient;
  const patientName = displayPatient
    ? `${displayPatient.first_name} ${displayPatient.last_name}`
    : 'Sin paciente';

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
      
      // If there's a Google Calendar event, update it with the patient name
      if ((session as any).google_calendar_event_id) {
        try {
          const patientData = await supabase
            .from('patients')
            .select('first_name, last_name')
            .eq('id', newPatientId)
            .maybeSingle();
          
          if (patientData.data) {
            const name = `${patientData.data.first_name} ${patientData.data.last_name}`;
            await syncToGoogle(session, { title: `Sesión con ${name}` });
          }
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
      
      toast({
        title: 'Estado actualizado',
        description: 'El estado de la sesión se ha actualizado.',
      });
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

  const handleDateTimeSave = async () => {
    try {
      await updateSession.mutateAsync({
        id: session.id,
        session_date: dateTimeValue.date,
        start_time: dateTimeValue.startTime,
        end_time: dateTimeValue.endTime,
      });
      
      // Sync date/time changes to Google Calendar immediately
      try {
        await syncMoveToGoogle(
          session,
          dateTimeValue.date,
          dateTimeValue.startTime,
          dateTimeValue.endTime
        );
      } catch (googleError) {
        console.error('Google sync failed:', googleError);
      }
      
      toast({ title: 'Fecha y hora actualizadas' });
      setEditingDateTime(false);
    } catch {
      toast({ title: 'Error al actualizar', variant: 'destructive' });
    }
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
        : 'Paciente';

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
            duration: durationMinutes,
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

  // Handle bono change for existing bonos (price = 0, already paid)
  const handleBonoChange = async (newBonoId: string, priceOverride?: number) => {
    try {
      const usesBono = newBonoId !== '__none__';
      const newPrice = priceOverride !== undefined ? priceOverride : (usesBono ? 0 : session.price);
      
      // Update local state immediately for responsive UI
      setLocalBonoId(usesBono ? newBonoId : null);
      setLocalPrice(Number(newPrice));
      
      // Update session in database
      await updateSession.mutateAsync({
        id: session.id,
        bono_id: usesBono ? newBonoId : null,
        price: newPrice,
      });

      // If assigning a bono, deduct a session from it (idempotent - won't duplicate)
      if (usesBono) {
        await deductBonoSession.mutateAsync({
          bonoId: newBonoId,
          sessionId: session.id,
        });
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      
      toast({ 
        title: usesBono ? 'Bono asignado' : 'Bono quitado',
        description: usesBono ? 'Se ha descontado una sesión del bono.' : undefined,
      });
      refetchBonos();
    } catch {
      // Revert local state on error
      setLocalBonoId(session.bono_id || null);
      setLocalPrice(Number(session.price) || 0);
      toast({ title: 'Error al cambiar bono', variant: 'destructive' });
    }
  };

  // Handle new bono created - price = totalPrice of bono (needs to be paid)
  const handleNewBonoCreated = async (bonoId: string, totalPrice: number) => {
    await handleBonoChange(bonoId, totalPrice);
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
        : 'Paciente';
      
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
      <span className="text-lg font-semibold flex-1 text-center">Detalle de sesión</span>
      <Badge className={cn(status.className, "shrink-0")} variant={status.variant}>
        {status.label}
      </Badge>
    </div>
  );

  // Common tabs content (everything inside Tabs)
  const tabsContent = (
    <Tabs defaultValue="info" className="w-full">
      <TabsList className="w-full justify-start px-4 sm:px-6 rounded-none border-b bg-transparent h-auto p-0 overflow-x-auto flex-nowrap">
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
                value="historial"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <Clock className="h-4 w-4" /> : 'Historial'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>Historial</TooltipContent>}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <TabsTrigger
                value="sms"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-4 py-3 shrink-0"
              >
                {isMobile ? <MessageSquare className="h-4 w-4" /> : 'SMS enviados'}
              </TabsTrigger>
            </TooltipTrigger>
            {isMobile && <TooltipContent>SMS enviados</TooltipContent>}
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

          <TabsContent value="info" className="mt-0 px-6 py-4 space-y-6">
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
                    <Input
                      type="date"
                      value={dateTimeValue.date}
                      onChange={(e) => setDateTimeValue(prev => ({ ...prev, date: e.target.value }))}
                      className="h-8"
                    />
                    <div className="flex gap-2 items-center">
                      <Input
                        type="time"
                        value={dateTimeValue.startTime}
                        onChange={(e) => setDateTimeValue(prev => ({ ...prev, startTime: e.target.value }))}
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
                        {format(new Date(session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
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
                  >
                    <SelectTrigger className="flex-1 h-8">
                      <SelectValue placeholder="Sin bono" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin bono</SelectItem>
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
                    ) : localPrice === 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Sin cargo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        Pendiente de pago
                      </Badge>
                    )}
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
                
                {!paymentStatus?.isPaid && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    disabled={localBonoId !== null || localPrice === 0}
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
                <Badge variant="outline" className="text-xs">
                  WhatsApp: {center?.whatsapp_send_method === 'api' ? 'Auto' : 'Manual'}
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
                    <MessageSquare className="h-4 w-4 text-green-600" />
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
                    disabled={!session.patient?.phone || sendWhatsAppNow.isPending}
                    onClick={() => {
                      if (!session.patient?.phone) return;
                      const patientName = session.patient?.first_name || '';
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
                        .replace('{nombre_paciente}', patientName)
                        .replace('{profesional_nombre}', professionalName)
                        .replace('{fecha}', sessionDate)
                        .replace('{zona_horaria}', sessionTime)
                        .replace('{sesion_tipo}', session.session_type || 'Individual')
                        .replace('{link_sesion}', appointmentLink)
                        .replace('{link_confirmar}', appointmentLink);

                      sendWhatsAppNow.mutate({
                        phone: session.patient.phone,
                        message,
                        patientId: session.patient.id,
                        sessionId: session.id,
                      });
                    }}
                  >
                    {sendWhatsAppNow.isPending ? (
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
                    disabled={!session.patient?.email}
                  >
                    <Send className="h-4 w-4 mr-1" />
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
                value={session.status || 'scheduled'}
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

            {/* Delete Session */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full mt-4">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar sesión
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar esta sesión?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. La sesión será eliminada permanentemente.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSession}>
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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
            </div>
          </TabsContent>

          <TabsContent value="historial" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay cambios registrados</p>
            </div>
          </TabsContent>

          <TabsContent value="sms" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay SMS enviados</p>
            </div>
          </TabsContent>

          <TabsContent value="otras" className="mt-0 px-6 py-4">
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No hay otras sesiones</p>
            </div>
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
        amount={localPrice}
        onSuccess={() => refetchPaymentStatus()}
      />
    )}

    {session && (
      <CreateSessionInvoiceDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        session={session}
        onSuccess={() => {
          refetchInvoiceStatus();
          setShowInvoiceDialog(false);
        }}
      />
    )}
    </>
  );
}
