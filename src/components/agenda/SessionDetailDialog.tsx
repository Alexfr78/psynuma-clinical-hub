import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { SESSION_STATUS_LABELS, getSessionStatusDisplay } from '@/lib/payment-status';
import { X, Check, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveDialog as Dialog,
  ResponsiveDialogContent as DialogContent,
  ResponsiveDialogHeader as DialogHeader,
  ResponsiveDialogTitle as DialogTitle,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SessionWithRelations, useUpdateSession } from '@/hooks/useSessions';
import { useGoogleCalendarUpdate } from '@/hooks/useGoogleCalendarUpdate';
import { Icon } from '@/components/ui/icon';

interface SessionDetailDialogProps {
  session: SessionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalyzeTranscription?: (sessionId: string) => void;
}

const statusConfig = {
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, variant: 'secondary' as const, color: 'bg-blue-500' },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, variant: 'default' as const, color: 'bg-green-500' },
  completed: { label: SESSION_STATUS_LABELS.completed, variant: 'outline' as const, color: 'bg-gray-500' },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, variant: 'destructive' as const, color: 'bg-red-500' },
  no_show: { label: SESSION_STATUS_LABELS.no_show, variant: 'destructive' as const, color: 'bg-orange-500' },
  blocked: { label: SESSION_STATUS_LABELS.blocked, variant: 'outline' as const, color: 'bg-purple-500' },
};

export function SessionDetailDialog({ session, open, onOpenChange, onAnalyzeTranscription }: SessionDetailDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateSession = useUpdateSession();
  const { syncToGoogle } = useGoogleCalendarUpdate(session?.professional_id);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!session) return null;

  const status = statusConfig[session.status as keyof typeof statusConfig] || statusConfig.scheduled;
  const patientName = session.patient 
    ? `${session.patient.first_name} ${session.patient.last_name}` 
    : 'Sin contacto';

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateSession.mutateAsync({
        id: session.id,
        status: newStatus as 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show',
      });
      try {
        await syncToGoogle(session, { status: newStatus });
      } catch (googleError) {
        console.error('Error syncing status change to Google:', googleError);
      }
      toast({
        title: 'Estado actualizado',
        description: 'El estado de la sesión se ha actualizado correctamente.',
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

  const quickActions = [
    { 
      status: 'confirmed', 
      label: 'Confirmar', 
      icon: Check, 
      show: session.status === 'scheduled' 
    },
    { 
      status: 'completed', 
      label: 'Completar', 
      icon: Check, 
      show: ['scheduled', 'confirmed'].includes(session.status || '') 
    },
    { 
      status: 'cancelled', 
      label: 'Cancelar', 
      icon: X, 
      show: ['scheduled', 'confirmed'].includes(session.status || '') 
    },
    { 
      status: 'no_show', 
      label: 'No asistió', 
      icon: XCircle, 
      show: ['scheduled', 'confirmed'].includes(session.status || '') 
    },
  ].filter(a => a.show);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle de Sesión
            <Badge variant="outline" className={getSessionStatusDisplay(session.status).badgeClass}>{status.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Patient Info */}
          <div 
            className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
            onClick={() => {
              if (session.patient) {
                navigate(`/pacientes/${session.patient.id}`);
                onOpenChange(false);
              }
            }}
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="person" className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">{patientName}</h3>
              {session.patient?.email && (
                <p className="text-sm text-muted-foreground">{session.patient.email}</p>
              )}
            </div>
          </div>

          {/* Session Details */}
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Icon name="calendar_month" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium capitalize">
                  {format(new Date(session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Icon name="schedule" className="h-5 w-5 text-muted-foreground" />
              <p>{session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}</p>
            </div>

            {session.professional && (
              <div className="flex items-center gap-3">
                <Icon name="person" className="h-5 w-5 text-muted-foreground" />
                <p>{session.professional.first_name} {session.professional.last_name}</p>
              </div>
            )}

            {session.session_type && (
              <div className="flex items-center gap-3">
                <Icon name="description" className="h-5 w-5 text-muted-foreground" />
                <p className="capitalize">{session.session_type}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Icon name="credit_card" className="h-5 w-5 text-muted-foreground" />
              <p className="font-semibold">{Number(session.price).toFixed(2)}€</p>
            </div>
          </div>

          {/* Notes */}
          {session.notes && (
            <div className="rounded-lg border p-3">
              <p className="text-sm font-medium text-muted-foreground mb-1">Notas</p>
              <p className="text-sm">{session.notes}</p>
            </div>
          )}

          {/* Status Change */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Cambiar estado</p>
            <Select 
              value={session.status || 'scheduled'} 
              onValueChange={handleStatusChange}
              disabled={isUpdating}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Programada</SelectItem>
                <SelectItem value="confirmed">Confirmada</SelectItem>
                <SelectItem value="completed">Completada</SelectItem>
                <SelectItem value="cancelled">Cancelada</SelectItem>
                <SelectItem value="no_show">No asistió</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quick Actions */}
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map(({ status, label, icon: Icon }) => (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  onClick={() => handleStatusChange(status)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <Icon name="progress_activity" className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="mr-1 h-4 w-4" />
                  )}
                  {label}
                </Button>
              ))}
            </div>
          )}

          {/* Analyze Transcription */}
          {onAnalyzeTranscription && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                setTimeout(() => onAnalyzeTranscription(session.id), 300);
              }}
            >
              <Icon name="psychology" className="mr-2 h-4 w-4" />
              {(session as { ai_summary_clinical?: string | null; ai_summary_patient?: string | null }).ai_summary_clinical || (session as { ai_summary_clinical?: string | null; ai_summary_patient?: string | null }).ai_summary_patient
                ? 'Ver / Regenerar informes'
                : 'Analizar transcripción'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
