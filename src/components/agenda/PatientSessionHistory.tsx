import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SESSION_STATUS_LABELS, getSessionStatusDisplay } from '@/lib/payment-status';
import { Icon } from '@/components/ui/icon';

interface PatientSessionHistoryProps {
  patientId: string;
  currentSessionId?: string;
  onSessionClick?: (sessionId: string) => void;
}

interface SessionHistoryItem {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
  price: number;
  session_type: string | null;
  professional: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
}

const statusConfig: Record<string, { label: string; icon: string; className: string }> = {
  completed: { label: SESSION_STATUS_LABELS.completed, icon: 'check_circle', className: 'text-green-600' },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, icon: 'check_circle', className: 'text-blue-600' },
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, icon: 'schedule', className: 'text-muted-foreground' },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, icon: 'cancel', className: 'text-red-600' },
  no_show: { label: SESSION_STATUS_LABELS.no_show, icon: 'error', className: 'text-orange-600' },
  draft: { label: SESSION_STATUS_LABELS.draft, icon: 'schedule', className: 'text-muted-foreground' },
};

function usePatientSessionHistory(patientId: string, currentSessionId?: string) {
  return useQuery({
    queryKey: ['patient-session-history', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id,
          session_date,
          start_time,
          end_time,
          status,
          notes,
          price,
          session_type,
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          )
        `)
        .eq('patient_id', patientId)
        .neq('status', 'blocked')
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;
      
      // Filter out current session if provided
      const filteredData = currentSessionId
        ? (data as SessionHistoryItem[]).filter(s => s.id !== currentSessionId)
        : (data as SessionHistoryItem[]);
      
      return filteredData;
    },
    enabled: !!patientId,
  });
}

export function PatientSessionHistory({ patientId, currentSessionId, onSessionClick }: PatientSessionHistoryProps) {
  const { data: sessions, isLoading } = usePatientSessionHistory(patientId, currentSessionId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icon name="progress_activity" className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Icon name="calendar_month" className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No hay otras sesiones</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground mb-3">
        {sessions.length} {sessions.length === 1 ? 'sesión' : 'sesiones'} encontradas
      </p>
      {sessions.map((session) => {
        const config = statusConfig[session.status] || statusConfig.scheduled;
        const sessionDate = new Date(session.session_date + 'T00:00:00');
        const isPast = sessionDate < new Date();

        return (
          <button
            key={session.id}
            onClick={() => onSessionClick?.(session.id)}
            className={cn(
              "w-full text-left p-3 rounded-lg border transition-colors",
              "hover:bg-accent hover:border-primary/30",
              "flex items-center gap-3 group",
              isPast ? 'bg-muted/30' : 'bg-background'
            )}
          >
            <div className="flex-shrink-0">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                isPast ? 'bg-muted' : 'bg-primary/10'
              )}>
                <Icon name={config.icon} className={cn("h-5 w-5", getSessionStatusDisplay(session.status).textClass)} />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-sm">
                  {format(sessionDate, "d 'de' MMMM, yyyy", { locale: es })}
                </span>
                <Badge variant="outline" className={cn("text-xs", getSessionStatusDisplay(session.status).textClass)}>
                  {config.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Icon name="schedule" className="h-3 w-3" />
                  {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                </span>
                {session.professional && (
                  <span>
                    {session.professional.first_name} {session.professional.last_name}
                  </span>
                )}
                {session.price > 0 && (
                  <span>{session.price.toFixed(2)}€</span>
                )}
              </div>
            </div>

            <Icon name="chevron_right" className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        );
      })}
    </div>
  );
}
