import { useMemo, useState, useCallback, useEffect } from 'react';
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
  onSessionMove?: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  hours?: number[];
  startHour?: number;
}

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);
const QUARTER_HOURS = [0, 15, 30, 45];

interface SlotPosition {
  day: Date;
  hour: number;
  minute: number;
}

function slotToMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function WeekView({ currentDate, sessions, onSessionClick, onSlotClick, onSessionMove, hours, startHour }: WeekViewProps) {
  const displayHours = hours || DEFAULT_HOURS;
  const gridStartHour = startHour ?? 8;
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<SlotPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<SlotPosition | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

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

  const getSessionsForDay = (day: Date) => {
    const dateKey = format(day, 'yyyy-MM-dd');
    return sessionsByDay.get(dateKey) || [];
  };

  const getSessionStyle = (session: SessionWithRelations) => {
    const [startH, startM] = (session.start_time || '08:00').split(':').map(Number);
    const [endH, endM] = (session.end_time || '09:00').split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes - startMinutes;
    
    const gridStartMinutes = gridStartHour * 60;
    const topOffset = ((startMinutes - gridStartMinutes) / 60) * 64;
    const height = (durationMinutes / 60) * 64;
    
    return {
      top: `${topOffset}px`,
      height: `${Math.max(height, 16)}px`,
    };
  };

  const handleSlotMouseDown = useCallback((day: Date, hour: number, minute: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ day, hour, minute });
    setDragEnd({ day, hour, minute });
  }, []);

  const handleSlotMouseEnter = useCallback((day: Date, hour: number, minute: number) => {
    if (isDragging && dragStart) {
      if (format(day, 'yyyy-MM-dd') === format(dragStart.day, 'yyyy-MM-dd')) {
        setDragEnd({ day, hour, minute });
      }
    }
  }, [isDragging, dragStart]);

  const completeDrag = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      const startMinutes = slotToMinutes(dragStart.hour, dragStart.minute);
      const endMinutes = slotToMinutes(dragEnd.hour, dragEnd.minute) + 15;

      const [minMinutes, maxMinutes] = startMinutes <= endMinutes 
        ? [startMinutes, endMinutes]
        : [endMinutes - 15, startMinutes + 15];

      const startTime = minutesToTime(minMinutes);
      const endTime = minutesToTime(maxMinutes);

      onSlotClick(dragStart.day, startTime, endTime);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, onSlotClick]);

  const cancelDrag = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      completeDrag();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, completeDrag]);

  const isSlotInDragRange = useCallback((day: Date, hour: number, minute: number): boolean => {
    if (!isDragging || !dragStart || !dragEnd) return false;
    
    const dayKey = format(day, 'yyyy-MM-dd');
    const startDayKey = format(dragStart.day, 'yyyy-MM-dd');
    
    if (dayKey !== startDayKey) return false;

    const slotMinutes = slotToMinutes(hour, minute);
    const startMinutes = slotToMinutes(dragStart.hour, dragStart.minute);
    const endMinutes = slotToMinutes(dragEnd.hour, dragEnd.minute);

    const [min, max] = startMinutes <= endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];
    return slotMinutes >= min && slotMinutes <= max;
  }, [isDragging, dragStart, dragEnd]);

  const handleDragOver = useCallback((e: React.DragEvent, day: Date, hour: number, minute: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(`${format(day, 'yyyy-MM-dd')}-${hour}:${minute}`);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, day: Date, hour: number, minute: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sessionId && onSessionMove) {
        const newDate = format(day, 'yyyy-MM-dd');
        const newStartTime = minutesToTime(slotToMinutes(hour, minute));
        const [origStartH, origStartM] = (data.originalStartTime || '09:00').split(':').map(Number);
        const [origEndH, origEndM] = (data.originalEndTime || '10:00').split(':').map(Number);
        const durationMinutes = slotToMinutes(origEndH, origEndM) - slotToMinutes(origStartH, origStartM);
        const newEndMinutes = slotToMinutes(hour, minute) + durationMinutes;
        const newEndTime = minutesToTime(newEndMinutes);
        
        onSessionMove(data.sessionId, newDate, newStartTime, newEndTime);
      }
    } catch {
      // Invalid drag data
    }
  }, [onSessionMove]);

  // Track when a session starts/ends being dragged (for visual feedback)
  const handleSessionDragStart = useCallback(() => {
    // Could add visual feedback here if needed
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  return (
    <div 
      className="flex flex-col overflow-hidden rounded-lg border"
      onMouseLeave={cancelDrag}
    >
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
        <div className="min-h-[600px] relative">
          <div className="grid grid-cols-8">
            {/* Hour labels column */}
            <div className="border-r">
              {displayHours.map((hour) => (
                <div key={hour} className="flex h-16 items-start justify-center p-1 text-xs text-muted-foreground border-b">
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
            
            {/* Day columns */}
            {weekDays.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const daySessions = getSessionsForDay(day);
              
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'border-r relative',
                    isToday(day) && 'bg-primary/5'
                  )}
                >
                  {/* Hour rows with 15-min slots */}
                  {displayHours.map((hour) => (
                    <div key={hour} className="h-16 relative border-b">
                      <div className="absolute inset-0 grid grid-rows-4">
                        {QUARTER_HOURS.map((minute) => {
                          const isInDragRange = isSlotInDragRange(day, hour, minute);
                          const slotId = `${dayKey}-${hour}:${minute}`;
                          const isDropTarget = dragOverSlot === slotId;
                          
                          return (
                            <div
                              key={minute}
                              className={cn(
                                'border-b border-dashed border-muted/50 last:border-b-0 cursor-pointer transition-colors',
                                minute === 0 && 'border-t-0',
                                isInDragRange 
                                  ? 'bg-primary/30' 
                                  : isDropTarget
                                  ? 'bg-primary/40 ring-2 ring-primary ring-inset'
                                  : 'hover:bg-muted/50'
                              )}
                              onMouseDown={(e) => handleSlotMouseDown(day, hour, minute, e)}
                              onMouseEnter={() => handleSlotMouseEnter(day, hour, minute)}
                              onDragOver={(e) => handleDragOver(e, day, hour, minute)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, day, hour, minute)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {/* Sessions overlay */}
                  <div className="absolute inset-0 pointer-events-none">
                    {daySessions.map((session) => {
                      const style = getSessionStyle(session);
                      return (
                        <SessionCard
                          key={session.id}
                          session={session}
                          compact
                          onClick={() => onSessionClick(session)}
                          draggable={!!onSessionMove}
                          onDragStart={handleSessionDragStart}
                          onDragEnd={handleSessionDragEnd}
                          className="absolute left-0.5 right-0.5 pointer-events-auto"
                          style={style}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
