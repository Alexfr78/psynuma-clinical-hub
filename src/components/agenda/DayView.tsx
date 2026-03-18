import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { format, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScheduleException, getExceptionsForDate, getReasonLabel } from '@/lib/schedule-exceptions';
import { SessionWithRelations } from '@/hooks/useSessions';
import { SessionCard } from './SessionCard';
import { calculateSessionPositions } from '@/lib/calculateSessionPositions';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

interface DayViewProps {
  currentDate: Date;
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onSlotClick: (date: Date, startTime: string, endTime: string) => void;
  onSessionMove?: (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => void;
  onMoveRequest?: (session: SessionWithRelations) => void;
  hours?: number[];
  startHour?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 8);
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

export function DayView({ currentDate, sessions, onSessionClick, onSlotClick, onSessionMove, onMoveRequest, hours, startHour, onSwipeLeft, onSwipeRight }: DayViewProps) {
  const displayHours = hours || DEFAULT_HOURS;
  const gridStartHour = startHour ?? 8;
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const gridRef = useRef<HTMLDivElement>(null);

  const { handleTouchStart, handleTouchEnd } = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<SlotPosition | null>(null);
  const [dragEnd, setDragEnd] = useState<SlotPosition | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  
  // Removed touch drag state - now using dialog-based move on mobile

  const daySessions = useMemo(() => {
    return sessions.filter((s) => s.session_date === dateKey);
  }, [sessions, dateKey]);

  // Use rem-based calculation so it scales with mobile font size
  const getSessionStyle = (session: SessionWithRelations) => {
    const [startH, startM] = (session.start_time || '08:00').split(':').map(Number);
    const [endH, endM] = (session.end_time || '09:00').split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes - startMinutes;
    
    const gridStartMinutes = gridStartHour * 60;
    // h-20 = 5rem, use rem units so it scales with the base font size
    const topOffsetRem = ((startMinutes - gridStartMinutes) / 60) * 5;
    const heightRem = (durationMinutes / 60) * 5;
    
    return {
      top: `${topOffsetRem}rem`,
      height: `${Math.max(heightRem, 1.25)}rem`,
    };
  };

  // Get slot position from screen coordinates
  const getSlotFromCoordinates = useCallback((clientX: number, clientY: number): SlotPosition | null => {
    if (!gridRef.current) return null;
    
    const gridRect = gridRef.current.getBoundingClientRect();
    const relativeY = clientY - gridRect.top + gridRef.current.scrollTop;
    
    // Get computed font size to calculate actual row height
    const computedFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const hourRowHeight = 5 * computedFontSize; // h-20 = 5rem
    
    const totalMinutes = (relativeY / hourRowHeight) * 60;
    const hour = gridStartHour + Math.floor(totalMinutes / 60);
    const minute = Math.floor((totalMinutes % 60) / 15) * 15;
    
    // Validate hour is within display range
    if (hour < displayHours[0] || hour > displayHours[displayHours.length - 1]) {
      return null;
    }
    
    return { hour, minute: Math.max(0, Math.min(45, minute)) };
  }, [gridStartHour, displayHours]);

  const handleSlotMouseDown = useCallback((hour: number, minute: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({ hour, minute });
    setDragEnd({ hour, minute });
  }, []);

  const handleSlotMouseEnter = useCallback((hour: number, minute: number) => {
    if (isDragging) {
      setDragEnd({ hour, minute });
    }
  }, [isDragging]);

  const completeDrag = useCallback(() => {
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
    
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.sessionId && onSessionMove) {
        const newStartTime = minutesToTime(slotToMinutes(hour, minute));
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

  // Desktop drag handlers
  const handleSessionDragStart = useCallback(() => {
    // Could add visual feedback here if needed
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  // Removed complex touch drag - now using dialog-based move on mobile

  return (
    <div 
      className="flex flex-col overflow-hidden rounded-lg border"
      onMouseLeave={cancelDrag}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
      <div className="flex-1 overflow-auto" ref={gridRef}>
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
                              ? 'bg-primary/30' 
                              : isDropTarget
                              ? 'bg-primary/40 ring-2 ring-primary ring-inset'
                              : 'hover:bg-muted/50'
                          )}
                          onMouseDown={(e) => handleSlotMouseDown(hour, minute, e)}
                          onMouseEnter={() => handleSlotMouseEnter(hour, minute)}
                          onDragOver={(e) => handleDragOver(e, hour, minute)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, hour, minute)}
                        >
                          {minute > 0 && (
                            <span className="absolute left-1 top-0 text-[10px] text-muted-foreground/50 pointer-events-none">
                              :{minute.toString().padStart(2, '0')}
                            </span>
                          )}
                        </div>
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
                        onClick={() => onSessionClick(session)}
                        draggable={!!onSessionMove}
                        onDragStart={handleSessionDragStart}
                        onDragEnd={handleSessionDragEnd}
                        onMoveRequest={onMoveRequest}
                        className="absolute pointer-events-auto"
                        style={{
                          ...style,
                          left: `calc(${leftPercent}% + 4px)`,
                          width: `calc(${widthPercent}% - 8px)`,
                        }}
                      />
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
