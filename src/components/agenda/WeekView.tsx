import { useMemo } from 'react';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SessionWithRelations } from '@/hooks/useSessions';
import { SessionCard } from './SessionCard';

interface WeekViewProps {
  currentDate: Date;
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onSlotClick: (date: Date, startTime: string, endTime: string) => void;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00
const QUARTER_HOURS = [0, 15, 30, 45];

export function WeekView({ currentDate, sessions, onSessionClick, onSlotClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const sessionsByDay = useMemo(() => {
    const map = new Map<string, SessionWithRelations[]>();
    sessions.forEach((session) => {
      const dateKey = session.session_date;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(session);
    });
    return map;
  }, [sessions]);

  const getSessionsForSlot = (day: Date, hour: number, minute: number) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    const daySessions = sessionsByDay.get(dateKey) || [];
    return daySessions.filter((session) => {
      const [sessionHour, sessionMinute] = (session.start_time || '00:00').split(':').map(Number);
      return sessionHour === hour && sessionMinute === minute;
    });
  };

  const handleSlotClick = (day: Date, hour: number, minute: number) => {
    const startTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    // Default to 1 hour duration
    const endHour = minute === 45 ? hour + 1 : (minute >= 15 ? hour + 1 : hour);
    const endMinute = (minute + 15) % 60;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    onSlotClick(day, startTime, endTime);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="grid grid-cols-8 border-b bg-muted/50">
        <div className="p-2 text-center text-xs font-medium text-muted-foreground">
          Hora
        </div>
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'p-2 text-center',
              isToday(day) && 'bg-primary/10'
            )}
          >
            <div className="text-xs font-medium text-muted-foreground">
              {format(day, 'EEE', { locale: es })}
            </div>
            <div
              className={cn(
                'mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                isToday(day) && 'bg-primary text-primary-foreground'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-h-[600px]">
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b">
              {/* Hour label */}
              <div className="flex h-16 items-start justify-center border-r p-1 text-xs text-muted-foreground">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {/* Day columns */}
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'h-16 border-r relative',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  {/* 15-minute slots within each hour */}
                  <div className="absolute inset-0 grid grid-rows-4">
                    {QUARTER_HOURS.map((minute) => {
                      const slotSessions = getSessionsForSlot(day, hour, minute);
                      return (
                        <div
                          key={minute}
                          className={cn(
                            'border-b border-dashed border-muted/50 last:border-b-0 cursor-pointer transition-colors hover:bg-muted/50 relative',
                            minute === 0 && 'border-t-0'
                          )}
                          onClick={() => handleSlotClick(day, hour, minute)}
                        >
                          {slotSessions.length > 0 && (
                            <div className="absolute inset-0 p-0.5">
                              {slotSessions.map((session) => (
                                <SessionCard
                                  key={session.id}
                                  session={session}
                                  compact
                                  onClick={() => onSessionClick(session)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
