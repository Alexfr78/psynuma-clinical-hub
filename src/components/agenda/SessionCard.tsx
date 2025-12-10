import { User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionWithRelations } from '@/hooks/useSessions';

interface SessionCardProps {
  session: SessionWithRelations;
  compact?: boolean;
  onClick?: () => void;
}

const statusColors = {
  scheduled: 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300',
  confirmed: 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300',
  completed: 'bg-gray-500/20 border-gray-500 text-gray-700 dark:text-gray-300',
  cancelled: 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300',
  no_show: 'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300',
};

export function SessionCard({ session, compact = false, onClick }: SessionCardProps) {
  const statusColor = statusColors[session.status as keyof typeof statusColors] || statusColors.scheduled;
  const patientName = session.patient 
    ? `${session.patient.first_name} ${session.patient.last_name}` 
    : 'Sin paciente';

  if (compact) {
    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick?.();
    };

    return (
      <div
        className={cn(
          'cursor-pointer rounded-md border-l-2 px-2 py-1 text-xs transition-all hover:opacity-80',
          statusColor
        )}
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="font-medium truncate">{patientName}</div>
        <div className="text-[10px] opacity-75">
          {session.start_time?.slice(0, 5)}
        </div>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onClick?.();
  };

  return (
    <div
      className={cn(
        'cursor-pointer rounded-lg border-l-4 bg-card p-3 shadow-sm transition-all hover:shadow-md',
        statusColor
      )}
      onClick={handleClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium truncate">{patientName}</h4>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}</span>
            </div>
            {session.professional && (
              <div className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                <span className="truncate">
                  {session.professional.first_name}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold">{Number(session.price).toFixed(0)}€</span>
        </div>
      </div>
    </div>
  );
}
