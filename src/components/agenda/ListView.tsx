import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { SessionWithRelations } from '@/hooks/useSessions';
import { SessionCard } from './SessionCard';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { Icon } from '@/components/ui/icon';

interface ListViewProps {
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function ListView({ sessions, onSessionClick, onSwipeLeft, onSwipeRight }: ListViewProps) {
  const { handleTouchStart, handleTouchEnd } = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
  });

  const groupedSessions = useMemo(() => {
    const groups = new Map<string, SessionWithRelations[]>();
    
    sessions.forEach((session) => {
      const dateKey = session.session_date;
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(session);
    });

    // Sort by date
    const sortedGroups = Array.from(groups.entries()).sort(
      ([a], [b]) => a.localeCompare(b)
    );

    return sortedGroups;
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div 
        className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Icon name="calendar_month" className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-display text-lg font-semibold">Sin sesiones</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          No hay sesiones programadas para este período.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {groupedSessions.map(([dateKey, daySessions]) => (
        <div key={dateKey}>
          <h3 className="mb-3 font-display font-semibold capitalize sticky top-0 bg-background py-2">
            {format(parseISO(dateKey), "EEEE, d 'de' MMMM", { locale: es })}
          </h3>
          <div className="space-y-2">
            {daySessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onClick={() => onSessionClick(session)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
