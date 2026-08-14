import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, Loader2, CheckCircle2, XCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { SESSION_STATUS_LABELS } from '@/lib/payment-status';

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

const statusConfig: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  completed: { label: SESSION_STATUS_LABELS.completed, icon: CheckCircle2, className: 'text-green-600' },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, icon: CheckCircle2, className: 'text-blue-600' },
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, icon: Clock, className: 'text-muted-foreground' },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, icon: XCircle, className: 'text-red-600' },
  no_show: { label: SESSION_STATUS_LABELS.no_show, icon: AlertCircle, className: 'text-orange-600' },
  draft: { label: SESSION_STATUS_LABELS.draft, icon: Clock, className: 'text-muted-foreground' },
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
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
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
        const StatusIcon = config.icon;
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
                <StatusIcon className={cn("h-5 w-5", config.className)} />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium text-sm">
                  {format(sessionDate, "d 'de' MMMM, yyyy", { locale: es })}
                </span>
                <Badge variant="outline" className={cn("text-xs", config.className)}>
                  {config.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
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

            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </button>
        );
      })}
    </div>
  );
}
