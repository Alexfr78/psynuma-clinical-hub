import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

interface PatientStatusBadgeProps {
  status: 'active' | 'inactive' | 'discharged' | string;
  statusSource?: 'manual' | 'auto' | string | null;
  statusReason?: string | null;
  showReason?: boolean;
  className?: string;
}

const statusConfig = {
  active: {
    label: 'Activo',
    variant: 'default' as const,
    icon: 'check_circle',
    className: 'bg-success/20 text-success border-success/30 hover:bg-success/30'
  },
  inactive: {
    label: 'Inactivo',
    variant: 'secondary' as const,
    icon: 'schedule',
    className: 'bg-muted text-muted-foreground border-muted-foreground/30'
  },
  discharged: {
    label: 'Alta',
    variant: 'outline' as const,
    icon: 'how_to_reg',
    className: 'bg-info/20 text-info border-info/30 hover:bg-info/30'
  },
};

const reasonLabels: Record<string, string> = {
  future_appointment: 'Cita programada',
  last_session_within_30d: 'Sesión reciente',
  inactive_no_activity: 'Sin actividad',
  manual_discharge: 'Alta manual',
};

export function PatientStatusBadge({ 
  status, 
  statusSource, 
  statusReason,
  showReason = false,
  className 
}: PatientStatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive;
  const reasonLabel = statusReason ? reasonLabels[statusReason] || statusReason : null;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Badge
        variant={config.variant}
        className={cn("flex items-center gap-1", config.className)}
      >
        <Icon name={config.icon} className="h-3 w-3" />
        {config.label}
        {statusSource === 'manual' && status === 'discharged' && (
          <span className="text-[10px] opacity-70">(manual)</span>
        )}
      </Badge>
      {showReason && reasonLabel && statusSource === 'auto' && (
        <span className="text-xs text-muted-foreground">
          {reasonLabel}
        </span>
      )}
    </div>
  );
}
