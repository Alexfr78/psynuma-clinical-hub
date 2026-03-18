import { useMemo, useState, useCallback, useEffect } from 'react';
import { format, startOfWeek, addDays, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScheduleException, getExceptionsForDate, getReasonLabel } from '@/lib/schedule-exceptions';
import { SessionWithRelations } from '@/hooks/useSessions';
import { SessionCard } from './SessionCard';
import { calculateSessionPositions } from '@/lib/calculateSessionPositions';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import { useIsMobile } from '@/hooks/use-mobile';

interface WeekViewProps {
  currentDate: Date;
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onSlotClick: (date: Date, startTime: string, endTime: string) => void;
  onSessionMove?: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  hours?: number[];
  startHour?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  showWeekends?: boolean;
  scheduleExceptions?: ScheduleException[];
  selectedProfessional?: string;
}

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);
const QUARTER_HOURS = [0, 15, 30, 45];
// Fixed pixel height for hour rows - must match the CSS height used in the grid
const HOUR_ROW_HEIGHT = 64;

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

export function WeekView({ currentDate, sessions, onSessionClick, onSlotClick, onSessionMove, hours, startHour, onSwipeLeft, onSwipeRight, showWeekends = true, scheduleExceptions, selectedProfessional }: WeekViewProps) {
  const isMobile = useIsMobile();
  const displayHours = hours || DEFAULT_HOURS;
  const gridStartHour = startHour ?? 8;
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  // If showWeekends is false, only show Monday-Friday (5 days)
  const weekDays = showWeekends 
    ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    : Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const { handleTouchStart, handleTouchEnd } = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
  });

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

  // Use rem-based calculation so it scales with mobile font size
  const getSessionStyle = (session: SessionWithRelations) => {
    const [startH, startM] = (session.start_time || '08:00').split(':').map(Number);
    const [endH, endM] = (session.end_time || '09:00').split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes - startMinutes;
    
    const gridStartMinutes = gridStartHour * 60;
    // h-16 = 4rem, use rem units so it scales with the base font size
    const topOffsetRem = ((startMinutes - gridStartMinutes) / 60) * 4;
    const heightRem = (durationMinutes / 60) * 4;
    
    return {
      top: `${topOffsetRem}rem`,
      height: `${Math.max(heightRem, 1)}rem`,
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

  // Number of columns for CSS grid (hour column + day columns)
  const numDays = weekDays.length;

  // Calculate column template based on device
  // On mobile: smaller hour column, equal day columns that fit the screen
  const hourColumnWidth = isMobile ? '28px' : '40px';

  return (
    <div 
      className="flex flex-col overflow-hidden rounded-lg border"
      onMouseLeave={cancelDrag}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div 
        className="grid border-b bg-muted/50 sticky top-0 z-10"
        style={{ gridTemplateColumns: `${hourColumnWidth} repeat(${numDays}, 1fr)` }}
      >
        <div className="p-0.5 sm:p-2 text-center text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center justify-center">
          {isMobile ? '' : 'Hora'}
        </div>
        {weekDays.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              'p-0.5 sm:p-2 text-center min-w-0',
              isToday(day) && 'bg-primary/10'
            )}
          >
            <div className="text-[10px] sm:text-xs font-medium text-muted-foreground truncate">
              {format(day, isMobile ? 'EEEEE' : 'EEE', { locale: es })}
            </div>
            <div
              className={cn(
                'mt-0.5 inline-flex h-5 w-5 sm:h-7 sm:w-7 items-center justify-center rounded-full text-[10px] sm:text-sm font-semibold',
                isToday(day) && 'bg-primary text-primary-foreground'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="min-h-[600px] relative">
          <div 
            className="grid"
            style={{ gridTemplateColumns: `${hourColumnWidth} repeat(${numDays}, 1fr)` }}
          >
            {/* Hour labels column */}
            <div className="border-r bg-background">
              {displayHours.map((hour) => (
                <div key={hour} className="flex h-16 items-start justify-center p-0.5 sm:p-1 text-[10px] sm:text-xs text-muted-foreground border-b">
                  {hour.toString().padStart(2, '0')}
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
                    'border-r relative min-w-0',
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
                    {(() => {
                      const positions = calculateSessionPositions(daySessions);
                      return daySessions.map((session) => {
                        const style = getSessionStyle(session);
                        const position = positions.get(session.id);
                        const leftPercent = position?.left ?? 0;
                        const widthPercent = position?.width ?? 100;
                        
                        return (
                          <SessionCard
                            key={session.id}
                            session={session}
                            compact
                            onClick={() => onSessionClick(session)}
                            draggable={!!onSessionMove && !isMobile}
                            onDragStart={handleSessionDragStart}
                            onDragEnd={handleSessionDragEnd}
                            className="absolute pointer-events-auto"
                            style={{
                              ...style,
                              left: `calc(${leftPercent}% + 1px)`,
                              width: `calc(${widthPercent}% - 2px)`,
                            }}
                          />
                        );
                      });
                    })()}
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
