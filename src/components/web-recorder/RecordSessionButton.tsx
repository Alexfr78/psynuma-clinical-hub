import { useState, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useWebRecorder } from '@/hooks/useWebRecorder';
import { cn } from '@/lib/utils';

interface RecordSessionButtonProps {
  patientId: string;
  sessionId: string;
  patientName: string;
  /** `full`: botón ancho con texto (detalle de sesión). `compact`: icono con texto corto (listas). */
  variant?: 'full' | 'compact';
  className?: string;
  /** Se llama cuando la grabación ya ha arrancado (p. ej. para cerrar el panel que la contiene). */
  onStarted?: () => void;
}

/**
 * Punto único para iniciar la grabadora web desde cualquier sitio que muestre una
 * sesión con paciente. La comprobación de consentimiento la hace el controlador
 * (en cliente) y `create-audio-ingestion` (en servidor); aquí solo se muestra el motivo.
 */
export function RecordSessionButton({
  patientId,
  sessionId,
  patientName,
  variant = 'full',
  className,
  onStarted,
}: RecordSessionButtonProps) {
  const recorder = useWebRecorder();
  const [starting, setStarting] = useState(false);
  const busy = !['idle', 'completed'].includes(recorder.state.phase);
  const isThisSession = busy && recorder.state.sessionId === sessionId;

  const handleClick = async (event: MouseEvent) => {
    event.stopPropagation();
    setStarting(true);
    try {
      await recorder.start({ patientId, sessionId, patientName });
      onStarted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo iniciar la grabación.');
    } finally {
      setStarting(false);
    }
  };

  const label = starting
    ? 'Preparando...'
    : isThisSession
      ? 'Grabando'
      : variant === 'compact'
        ? 'Grabar'
        : 'Grabar sesión';

  return (
    <Button
      type="button"
      variant={variant === 'compact' ? 'outline' : 'default'}
      size={variant === 'compact' ? 'sm' : 'default'}
      disabled={starting || busy}
      title={busy && !isThisSession ? 'Ya hay una grabación en curso o pendiente' : 'Grabar y transcribir al terminar'}
      aria-label={`Grabar sesión de ${patientName}`}
      className={cn(
        variant === 'full' && 'w-full',
        variant === 'compact' && 'shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive',
        className,
      )}
      onClick={handleClick}
    >
      <Icon
        name={starting ? 'progress_activity' : isThisSession ? 'radio_button_checked' : 'mic'}
        className={cn('mr-1.5 h-4 w-4', starting && 'animate-spin')}
      />
      {label}
    </Button>
  );
}
