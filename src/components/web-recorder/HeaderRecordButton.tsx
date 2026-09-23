import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWebRecorder } from '@/hooks/useWebRecorder';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RecordSessionButton } from './RecordSessionButton';
import { cn } from '@/lib/utils';

interface TodaySession {
  id: string;
  start_time: string;
  end_time: string;
  patient_id: string | null;
  patient: { first_name: string; last_name: string | null } | null;
}

/** Sesiones de hoy del propio profesional con paciente: son las únicas que se pueden grabar. */
function useMyRecordableSessionsToday(enabled: boolean) {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ['sessions', 'today', 'recordable', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, start_time, end_time, patient_id, patient:patients!sessions_patient_id_fkey(first_name, last_name)')
        .eq('session_date', format(new Date(), 'yyyy-MM-dd'))
        .eq('professional_id', user!.id)
        .not('patient_id', 'is', null)
        .not('status', 'in', '(cancelled,no_show,blocked)')
        .order('start_time');
      if (error) throw error;
      return (data ?? []) as unknown as TodaySession[];
    },
    enabled: enabled && !!user?.id && !!profile?.center_id,
  });
}

function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm.slice(-2)}:${ss}` : `${mm}:${ss}`;
}

/**
 * Botón "Grabar" fijo en la cabecera, como el de Eholo: abre la lista de sesiones de hoy
 * y destaca la que está en curso o la siguiente. Mientras graba muestra el cronómetro;
 * el control de la grabación sigue en el widget flotante.
 */
export function HeaderRecordButton() {
  const { isAdmin, isProfessional } = useAuth();
  const { state } = useWebRecorder();
  const [open, setOpen] = useState(false);
  const { data: sessions, isLoading } = useMyRecordableSessionsToday(open);

  if (!isAdmin && !isProfessional) return null;

  const recording = state.phase === 'recording' || state.phase === 'paused';
  // Durante 'transcribing' el botón sigue disponible: la transcripción corre en el
  // servidor y no impide grabar la sesión siguiente.
  if (recording || ['starting', 'uploading', 'recoverable', 'error'].includes(state.phase)) {
    return (
      <div
        role="status"
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive sm:text-sm"
      >
        <span className={cn('h-2 w-2 rounded-full bg-destructive', state.phase === 'recording' && 'animate-pulse')} />
        {recording ? formatElapsed(state.elapsedMs) : state.otherTab ? 'Grabando en otra pestaña' : 'Grabación pendiente'}
      </div>
    );
  }

  const nowTime = format(new Date(), 'HH:mm:ss');
  const currentId = sessions?.find((s) => s.start_time <= nowTime && s.end_time >= nowTime)?.id;
  const suggestedId = currentId ?? sessions?.find((s) => s.start_time >= nowTime)?.id;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Icon name="mic" className="h-4 w-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Grabar sesión</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-3">
        <p className="text-sm font-semibold">¿Qué sesión vas a grabar?</p>
        <p className="mb-3 text-xs text-muted-foreground">Tus sesiones de hoy con paciente. La transcripción empieza al terminar.</p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Icon name="progress_activity" className="h-4 w-4 animate-spin" /> Cargando sesiones...
          </div>
        ) : !sessions?.length ? (
          <p className="py-4 text-sm text-muted-foreground">
            No tienes sesiones con paciente hoy. Para grabar, crea antes la cita en la Agenda.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {sessions.map((s) => {
              const name = `${s.patient?.first_name ?? ''} ${s.patient?.last_name ?? ''}`.trim() || 'Paciente';
              return (
                <li
                  key={s.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border p-2',
                    s.id === suggestedId && 'border-primary bg-primary/5',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                      {s.id === suggestedId && (s.id === currentId ? ' · en curso' : ' · siguiente')}
                    </p>
                  </div>
                  <RecordSessionButton
                    variant="compact"
                    patientId={s.patient_id!}
                    sessionId={s.id}
                    patientName={name}
                    onStarted={() => setOpen(false)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
