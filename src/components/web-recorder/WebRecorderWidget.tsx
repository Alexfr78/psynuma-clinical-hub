import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/hooks/useAuth';
import { useWebRecorder } from '@/hooks/useWebRecorder';

const phaseLabels = {
  idle: '',
  starting: 'Preparando grabación',
  recording: 'Grabando sesión',
  paused: 'Grabación en pausa',
  recoverable: 'Grabación pendiente',
  uploading: 'Guardando audio',
  transcribing: 'Transcribiendo',
  completed: 'Transcripción completada',
  error: 'Revisa la grabación',
};

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
}

export function WebRecorderWidget() {
  const { user, isAdmin, isProfessional, needsMfaVerification } = useAuth();
  const { state, pause, resume, finish, recover, discard, dismiss } = useWebRecorder();
  const [minimized, setMinimized] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!user || (!isAdmin && !isProfessional) || needsMfaVerification || state.phase === 'idle') return null;

  const active = state.phase === 'recording' || state.phase === 'paused';
  const processing = ['starting', 'uploading', 'transcribing'].includes(state.phase);
  const recoverable = state.phase === 'recoverable' || state.phase === 'error';
  const showDiscardConfirmation = confirmDiscard && state.canDiscard;
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setConfirmDiscard(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo completar la acción. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Grabadora de sesión"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40 w-[calc(100%-1.5rem)] max-w-sm overflow-hidden rounded-xl border bg-background text-foreground shadow-xl sm:bottom-5 sm:right-5"
    >
      <div className="flex items-center gap-3 bg-primary px-4 py-3 text-primary-foreground">
        <Icon name={processing ? 'progress_activity' : 'mic'} className={`h-5 w-5 shrink-0 ${processing ? 'animate-spin' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" role="status">{phaseLabels[state.phase]}</p>
          {minimized && <p className="text-xs tabular-nums">{formatElapsed(state.elapsedMs)} · {state.pendingParts} pendientes</p>}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
          aria-label={minimized ? 'Expandir grabadora' : 'Minimizar grabadora'}
          aria-expanded={!minimized}
          onClick={() => setMinimized(!minimized)}
        >
          <Icon name={minimized ? 'expand_less' : 'expand_more'} className="h-5 w-5" />
        </Button>
        {state.phase === 'completed' && <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" aria-label="Cerrar grabadora" onClick={dismiss}><Icon name="close" className="h-5 w-5" /></Button>}
      </div>

      {!minimized && (
        <div className="max-h-[65dvh] space-y-4 overflow-y-auto p-4">
          <div>
            <p className="truncate text-sm font-medium" title={state.patientName}>{state.patientName || 'Sesión guardada en este dispositivo'}</p>
            <p className="mt-2 text-xs text-muted-foreground">Tiempo de sesión</p>
            <p className="mt-1 font-mono text-3xl font-semibold tabular-nums" aria-label={`Tiempo de sesión: ${formatElapsed(state.elapsedMs)}`}>{formatElapsed(state.elapsedMs)}</p>
          </div>

          {active && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Nivel del micrófono</span><span>{state.phase === 'paused' ? 'En pausa' : 'Audio activo'}</span></div>
              <div role="meter" aria-label="Nivel del micrófono" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(1, state.level)) * 100)} className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${state.phase === 'paused' ? 0 : Math.max(0, Math.min(1, state.level)) * 100}%` }} />
              </div>
            </div>
          )}

          {state.phase !== 'completed' && <p className="text-xs text-muted-foreground">{state.pendingParts > 0 ? `${state.pendingParts} partes pendientes de subir. Mantén esta pestaña abierta.` : 'No hay partes pendientes de subir.'}</p>}
          {active && <p className="text-xs text-muted-foreground">Máximo 120 minutos, incluidas las pausas. La transcripción comienza al terminar.</p>}
          {state.phase === 'recoverable' && <p className="text-sm text-muted-foreground">La grabación se interrumpió. Puedes procesar el audio guardado; para seguir grabando tendrás que iniciar otra sesión.</p>}
          {state.phase === 'transcribing' && <p className="text-sm text-muted-foreground">Estamos procesando el audio. La transcripción aparecerá en la sesión; los informes se generan después en segundo plano, según los permisos y las plantillas configuradas.</p>}
          {state.phase === 'completed' && <p className="text-sm text-muted-foreground">La transcripción está lista en la sesión. Los informes se generan en segundo plano, según los permisos y las plantillas configuradas. Revisa el borrador cuando esté disponible.</p>}
          {state.warning && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">{state.warning}</p>}
          {(state.error || actionError) && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError || state.error}</p>}

          {active && <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void run(state.phase === 'paused' ? resume : pause)}>
              <Icon name={state.phase === 'paused' ? 'play_arrow' : 'pause'} className="mr-1.5 h-4 w-4" />
              {state.phase === 'paused' ? 'Reanudar' : 'Pausa'}
            </Button>
            <Button disabled={busy} onClick={() => void run(finish)}><Icon name="stop" className="mr-1.5 h-4 w-4" />Terminar</Button>
          </div>}

          {recoverable && !showDiscardConfirmation && <div className="space-y-2">
            <Button className="w-full" disabled={busy} onClick={() => void run(recover)}>{busy ? 'Procesando...' : 'Terminar de subir y transcribir'}</Button>
            {state.canDiscard && <Button variant="outline" className="w-full" disabled={busy} onClick={() => setConfirmDiscard(true)}>Descartar grabación</Button>}
          </div>}
          {recoverable && showDiscardConfirmation && <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm">¿Descartar el audio pendiente? No podrás recuperarlo para transcribirlo.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setConfirmDiscard(false)}>Conservar</Button>
              <Button variant="destructive" disabled={busy} onClick={() => void run(discard)}>Descartar</Button>
            </div>
          </div>}
          {state.phase === 'completed' && <Button className="w-full" variant="outline" onClick={dismiss}>Cerrar grabadora</Button>}
        </div>
      )}
    </aside>
  );
}
