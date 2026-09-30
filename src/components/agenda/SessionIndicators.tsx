import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/components/ui/icon';
import { SessionWithRelations } from '@/hooks/useSessions';
import { useVisibleIndicators } from '@/hooks/useAgendaPreferences';
import { getSessionFlags, MODALITY_LABELS } from '@/lib/agenda-indicators';
import { PaymentStatusIndicator } from './PaymentStatusIndicator';
import { CancellationPolicyIndicator } from './CancellationPolicyIndicator';

interface FlagIconProps {
  icon: string;
  label: string;
  compact?: boolean;
}

function FlagIcon({ icon, label, compact }: FlagIconProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0 items-center opacity-70" aria-label={label}>
          <Icon name={icon} className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Icono de cita recurrente; va delante del nombre. */
export function RecurringIndicator({ session, compact }: { session: SessionWithRelations; compact?: boolean }) {
  const visible = useVisibleIndicators();
  if (!visible.recurring || !getSessionFlags(session).recurring) return null;
  return (
    <TooltipProvider>
      <FlagIcon icon="refresh" label="Cita recurrente" compact={compact} />
    </TooltipProvider>
  );
}

interface SessionIndicatorsProps {
  session: SessionWithRelations;
  compact?: boolean;
  className?: string;
}

/**
 * Iconos de estado de una cita (detrás del nombre), filtrados según la
 * selección del usuario en la barra inferior de la agenda.
 */
export function SessionIndicators({ session, compact = false, className }: SessionIndicatorsProps) {
  const visible = useVisibleIndicators();
  const flags = getSessionFlags(session);
  const modalityLabel = MODALITY_LABELS[session.session_modality ?? ''] ?? 'Online';

  return (
    <TooltipProvider>
      <div className={cn('flex shrink-0 items-center gap-1', className)}>
        {visible.modality && flags.online && <FlagIcon icon="videocam" label={modalityLabel} compact={compact} />}
        {visible.couple && flags.couple && <FlagIcon icon="group" label="Sesión de pareja" compact={compact} />}
        {visible.notes && flags.notes && <FlagIcon icon="sticky_note_2" label="Tiene notas" compact={compact} />}
        {visible.reminder && flags.reminder && (
          <FlagIcon icon="notifications_active" label="Recordatorio enviado" compact={compact} />
        )}
        {visible.google_sync && flags.googleSync && (
          <FlagIcon icon="event_available" label="Sincronizada con Google Calendar" compact={compact} />
        )}
        {visible.cancellation_policy && (
          <CancellationPolicyIndicator status={session.cancellation_policy_status} compact={compact} />
        )}
        {visible.payment && (
          <PaymentStatusIndicator
            paymentStatus={session.payment_status}
            price={session.price}
            bonoId={session.bono_id}
            compact={compact}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
