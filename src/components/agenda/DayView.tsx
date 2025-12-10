import { useMemo } from 'react';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SessionWithRelations } from '@/hooks/useSessions';
import { SessionCard } from './SessionCard';

interface DayViewProps {
  currentDate: Date;
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onSlotClick: (date: Date, time: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00

export function DayView({ currentDate, sessions, onSessionClick, onSlotClick }: DayViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  
  const sessionsByHour = useMemo(() => {
    const map = new Map<number, SessionWithRelations[]>();
    sessions
      .filter((s) => s.session_date === dateKey)
      .forEach((session) => {
        const hour = parseInt(session.start_time?.split(':')[0] || '0');
        if (!map.has(hour)) {
          map.set(hour, []);
        }
        map.get(hour)!.push(session);
      });
    return map;
  }, [sessions, dateKey]);

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="border-b bg-muted/50 p-4 text-center">
        <div className="text-sm font-medium text-muted-foreground">
          {format(currentDate, 'EEEE', { locale: es })}
        </div>
        <div
          className={cn(
            'mt-1 inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold',
            isToday(currentDate) && 'bg-primary text-primary-foreground'
          )}
        >
          {format(currentDate, 'd')}
        </div>
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-[600px]">
          {HOURS.map((hour) => {
            const hourSessions = sessionsByHour.get(hour) || [];
            return (
              <div key={hour} className="flex border-b">
                <div className="flex w-20 shrink-0 items-start justify-center border-r p-2 text-sm text-muted-foreground">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                <div
                  className="flex-1 min-h-[80px] p-2 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => onSlotClick(currentDate, `${hour.toString().padStart(2, '0')}:00`)}
                >
                  <div className="space-y-2">
                    {hourSessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        onClick={() => onSessionClick(session)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
