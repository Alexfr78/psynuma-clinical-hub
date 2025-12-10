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
  onSlotClick: (date: Date, startTime: string, endTime: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00
const QUARTER_HOURS = [0, 15, 30, 45];

export function DayView({ currentDate, sessions, onSessionClick, onSlotClick }: DayViewProps) {
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const sessionsBySlot = useMemo(() => {
    const map = new Map<string, SessionWithRelations[]>();
    sessions
      .filter((s) => s.session_date === dateKey)
      .forEach((session) => {
        const [hour, minute] = (session.start_time || '00:00').split(':').map(Number);
        const slotKey = `${hour}:${minute}`;
        if (!map.has(slotKey)) {
          map.set(slotKey, []);
        }
        map.get(slotKey)!.push(session);
      });
    return map;
  }, [sessions, dateKey]);

  const handleSlotClick = (hour: number, minute: number) => {
    const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    // Default to 1 hour duration
    const endHour = minute === 45 ? hour + 1 : (minute >= 15 ? hour + 1 : hour);
    const endMinute = (minute + 15) % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    onSlotClick(currentDate, startTime, endTime);
  };

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
          {HOURS.map((hour) => (
            <div key={hour} className="flex border-b">
              {/* Hour label */}
              <div className="flex w-20 shrink-0 items-start justify-center border-r p-2 text-sm text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {/* 15-minute slots */}
              <div className="flex-1 grid grid-rows-4 min-h-[80px]">
                {QUARTER_HOURS.map((minute) => {
                  const slotKey = `${hour}:${minute}`;
                  const slotSessions = sessionsBySlot.get(slotKey) || [];
                  return (
                    <div
                      key={minute}
                      className={cn(
                        'border-b border-dashed border-muted/50 last:border-b-0 p-1 cursor-pointer transition-colors hover:bg-muted/50 relative',
                        minute === 0 && 'border-t-0'
                      )}
                      onClick={() => handleSlotClick(hour, minute)}
                    >
                      {/* Time indicator for non-hour slots */}
                      {minute > 0 && (
                        <span className="absolute left-1 top-0 text-[10px] text-muted-foreground/50">
                          :{minute.toString().padStart(2, '0')}
                        </span>
                      )}
                      <div className="space-y-1 ml-6">
                        {slotSessions.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            onClick={() => onSessionClick(session)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
