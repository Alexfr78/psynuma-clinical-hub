import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, User, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SessionDetailDrawer } from '@/components/agenda/SessionDetailDrawer';
import type { SessionWithRelations } from '@/hooks/useSessions';

interface PatientSessionsProps {
  patientId: string;
}

type StatusFilter = 'active' | 'cancelled' | 'all';

const statusConfig = {
  scheduled: { label: 'Programada', variant: 'secondary' as const },
  confirmed: { label: 'Confirmada', variant: 'default' as const },
  completed: { label: 'Completada', variant: 'outline' as const },
  cancelled: { label: 'Cancelada', variant: 'destructive' as const },
  no_show: { label: 'No asistió', variant: 'destructive' as const },
  blocked: { label: 'Bloqueado', variant: 'outline' as const },
};

export function PatientSessions({ patientId }: PatientSessionsProps) {
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['patient-sessions', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          patient:patients!sessions_patient_id_fkey(
            id, first_name, last_name, email, phone
          ),
          professional:profiles!sessions_professional_id_fkey(
            id, first_name, last_name
          )
        `)
        .eq('patient_id', patientId)
        .order('session_date', { ascending: false });

      if (error) throw error;
      return data as unknown as SessionWithRelations[];
    },
  });

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { sessionId?: string };
      if (!detail?.sessionId) return;
      const found = sessions?.find((s) => s.id === detail.sessionId);
      if (found) {
        setSelectedSession(found);
        return;
      }
      const { data, error } = await supabase
        .from('sessions')
        .select(`*, patient:patients!sessions_patient_id_fkey(id, first_name, last_name, email, phone), professional:profiles!sessions_professional_id_fkey(id, first_name, last_name)`)
        .eq('id', detail.sessionId)
        .maybeSingle();
      if (!error && data) setSelectedSession(data as unknown as SessionWithRelations);
    };
    window.addEventListener('select-session', handler as EventListener);
    return () => window.removeEventListener('select-session', handler as EventListener);
  }, [sessions]);

  const counts = useMemo(() => {
    const all = sessions?.length ?? 0;
    const cancelled = sessions?.filter((s) => s.status === 'cancelled').length ?? 0;
    return { all, cancelled, active: all - cancelled };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (statusFilter === 'active') return sessions.filter((s) => s.status !== 'cancelled');
    if (statusFilter === 'cancelled') return sessions.filter((s) => s.status === 'cancelled');
    return sessions;
  }, [sessions, statusFilter]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const emptyLabel =
    statusFilter === 'active'
      ? 'Este contacto no tiene sesiones activas.'
      : statusFilter === 'cancelled'
        ? 'Este contacto no tiene sesiones canceladas.'
        : 'Este contacto aún no tiene sesiones registradas.';

  return (
    <div className="space-y-4">
      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="active">Activas ({counts.active})</TabsTrigger>
          <TabsTrigger value="cancelled">Canceladas ({counts.cancelled})</TabsTrigger>
          <TabsTrigger value="all">Todas ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 font-display text-lg font-semibold">Sin sesiones</h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-4">
      {filteredSessions.map((session) => {
        const status = statusConfig[session.status as keyof typeof statusConfig] || statusConfig.scheduled;
        
        return (
          <Card
            key={session.id}
            className="transition-colors hover:bg-muted/50 cursor-pointer"
            onClick={() => setSelectedSession(session)}
          >
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="font-medium">
                      {format(new Date(session.session_date), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                    </span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  
                  <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{session.start_time} - {session.end_time}</span>
                    </div>
                    
                    {session.professional && (
                      <div className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        <span>
                          {session.professional.first_name} {session.professional.last_name}
                        </span>
                      </div>
                    )}
                    
                    {session.session_type && (
                      <div className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="capitalize">{session.session_type}</span>
                      </div>
                    )}
                  </div>

                  {session.notes && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {session.notes}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold">{Number(session.price).toFixed(2)}€</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
        </div>
      )}

      <SessionDetailDrawer
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => { if (!open) setSelectedSession(null); }}
      />
    </div>
  );
}
