import { useMemo, useState, useCallback } from 'react';
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
  onSessionMove?: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  hours?: number[];
  startHour?: number;
}

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 - 20:00
const QUARTER_HOURS = [0, 15, 30, 45];

interface SlotPosition {
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

export function DayView({ currentDate, sessions, onSessionClick, onSlotClick, onSessionMove, hours, startHour }: DayViewProps) {
  const displayHours = hours || DEFAULT_HOURS;
  const gridStartHour = startHour ?? 8;
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<SlotPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<SlotPosition | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [isDraggingSession, setIsDraggingSession] = useState(false);

  const daySessions = useMemo(() => {
    return sessions.filter((s) => s.session_date === dateKey);
  }, [sessions, dateKey]);

  // Calculate session position and height based on start/end time
  const getSessionStyle = (session: SessionWithRelations) => {
    const [startH, startM] = (session.start_time || '08:00').split(':').map(Number);
    const [endH, endM] = (session.end_time || '09:00').split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes - startMinutes;
    
    // Grid starts at dynamic hour, each hour row is 80px (min-h-[80px])
    const gridStartMinutes = gridStartHour * 60;
    const topOffset = ((startMinutes - gridStartMinutes) / 60) * 80;
    const height = (durationMinutes / 60) * 80;
    
    return {
      top: `${topOffset}px`,
      height: `${Math.max(height, 20)}px`,
    };
  };

  const handleMouseDown = useCallback((hour: number, minute: number, e: React.MouseEvent) => {
    if (isDraggingSession) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ hour, minute });
    setDragEnd({ hour, minute });
  }, [isDraggingSession]);

  const handleMouseEnter = useCallback((hour: number, minute: number) => {
    if (isDragging) {
      setDragEnd({ hour, minute });
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      const startMinutes = slotToMinutes(dragStart.hour, dragStart.minute);
      const endMinutes = slotToMinutes(dragEnd.hour, dragEnd.minute) + 15;

      const [minMinutes, maxMinutes] = startMinutes <= endMinutes 
        ? [startMinutes, endMinutes]
        : [endMinutes - 15, startMinutes + 15];

      const startTime = minutesToTime(minMinutes);
      const endTime = minutesToTime(maxMinutes);

      onSlotClick(currentDate, startTime, endTime);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, currentDate, onSlotClick]);

  const isSlotInDragRange = useCallback((hour: number, minute: number): boolean => {
    if (!isDragging || !dragStart || !dragEnd) return false;

    const slotMinutes = slotToMinutes(hour, minute);
    const startMinutes = slotToMinutes(dragStart.hour, dragStart.minute);
    const endMinutes = slotToMinutes(dragEnd.hour, dragEnd.minute);

    const [min, max] = startMinutes <= endMinutes ? [startMinutes, endMinutes] : [endMinutes, startMinutes];
    return slotMinutes >= min && slotMinutes <= max;
  }, [isDragging, dragStart, dragEnd]);

  const handleDragOver = useCallback((e: React.DragEvent, hour: number, minute: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(`${hour}:${minute}`);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, hour: number, minute: number) => {
    e.preventDefault();
    setDragOverSlot(null);
    setIsDraggingSession(false);
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sessionId && onSessionMove) {
        const newStartTime = minutesToTime(slotToMinutes(hour, minute));
        // Calculate duration from original times
        const [origStartH, origStartM] = (data.originalStartTime || '09:00').split(':').map(Number);
        const [origEndH, origEndM] = (data.originalEndTime || '10:00').split(':').map(Number);
        const durationMinutes = slotToMinutes(origEndH, origEndM) - slotToMinutes(origStartH, origStartM);
        const newEndMinutes = slotToMinutes(hour, minute) + durationMinutes;
        const newEndTime = minutesToTime(newEndMinutes);
        
        onSessionMove(data.sessionId, dateKey, newStartTime, newEndTime);
      }
    } catch {
      // Invalid drag data
    }
  }, [onSessionMove, dateKey]);

  const handleSessionDragStart = useCallback(() => {
    setIsDraggingSession(true);
  }, []);

  return (
    <div 
      className="flex flex-col overflow-hidden rounded-lg border select-none"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
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
        <div className="min-h-[600px] relative">
          <div className="flex">
            {/* Hour labels column */}
            <div className="w-20 shrink-0 border-r">
              {displayHours.map((hour) => (
                <div key={hour} className="flex h-20 items-start justify-center p-2 text-sm text-muted-foreground border-b">
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
            
            {/* Main content area */}
            <div className="flex-1 relative">
              {/* Hour rows with 15-min slots */}
              {displayHours.map((hour) => (
                <div key={hour} className="h-20 relative border-b">
                  <div className="absolute inset-0 grid grid-rows-4">
                    {QUARTER_HOURS.map((minute) => {
                      const slotKey = `${hour}:${minute}`;
                      const isInDragRange = isSlotInDragRange(hour, minute);
                      const isDropTarget = dragOverSlot === slotKey;
                      
                      return (
                        <div
                          key={minute}
                          className={cn(
                            'border-b border-dashed border-muted/50 last:border-b-0 cursor-pointer transition-colors relative',
                            minute === 0 && 'border-t-0',
                            isInDragRange 
                              ? 'bg-primary/20' 
                              : isDropTarget
                              ? 'bg-primary/30 ring-2 ring-primary ring-inset'
                              : 'hover:bg-muted/50'
                          )}
                          onMouseDown={(e) => handleMouseDown(hour, minute, e)}
                          onMouseEnter={() => handleMouseEnter(hour, minute)}
                          onDragOver={(e) => handleDragOver(e, hour, minute)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, hour, minute)}
                        >
                          {/* Time indicator for non-hour slots */}
                          {minute > 0 && (
                            <span className="absolute left-1 top-0 text-[10px] text-muted-foreground/50">
                              :{minute.toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {/* Sessions overlay - positioned absolutely based on time */}
              {daySessions.map((session) => {
                const style = getSessionStyle(session);
                return (
                  <div
                    key={session.id}
                    className="absolute left-1 right-1 z-10 pointer-events-auto"
                    style={style}
                  >
                    <SessionCard
                      session={session}
                      onClick={() => onSessionClick(session)}
                      draggable={!!onSessionMove}
                      onDragStart={handleSessionDragStart}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
