import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar, Clock, Ticket } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BonoSessionsDialogProps {
  bonoId: string | null;
  bonoName?: string;
  totalSessions?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const sessionStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  scheduled: { label: 'Programada', variant: 'default' },
  confirmed: { label: 'Confirmada', variant: 'default' },
  completed: { label: 'Completada', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'destructive' },
  no_show: { label: 'No asistió', variant: 'destructive' },
  rescheduled: { label: 'Reprogramada', variant: 'outline' },
};

export function BonoSessionsDialog({
  bonoId,
  bonoName,
  totalSessions,
  open,
  onOpenChange,
}: BonoSessionsDialogProps) {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['bono-sessions', bonoId],
    queryFn: async () => {
      if (!bonoId) return [];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, status, session_type, price')
        .eq('bono_id', bonoId)
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!bonoId && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5 text-primary" />
            Sesiones del bono
          </DialogTitle>
          <DialogDescription>
            {bonoName}
            {typeof totalSessions === 'number' && (
              <span className="ml-1 text-muted-foreground">
                · {sessions?.length ?? 0} de {totalSessions} sesiones registradas
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !sessions || sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Este bono aún no tiene sesiones asignadas.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => {
                const status = sessionStatusConfig[session.status as string] || {
                  label: session.status || 'Desconocido',
                  variant: 'outline' as const,
                };
                return (
                  <div
                    key={session.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {format(new Date(session.session_date), "EEEE d 'de' MMMM yyyy", { locale: es })}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
                        {session.session_type && (
                          <span className="ml-1">· {session.session_type}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {typeof session.price === 'number' && (
                        <span className="text-sm font-medium">
                          {Number(session.price).toFixed(2)}€
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
