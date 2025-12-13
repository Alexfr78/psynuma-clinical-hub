import { User, Clock, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionWithRelations } from '@/hooks/useSessions';
import { useCallback, useRef, useState, useEffect } from 'react';

interface SessionCardProps {
  session: SessionWithRelations;
  compact?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onTouchDrag?: (sessionId: string, clientX: number, clientY: number) => void;
  onTouchDragEnd?: (sessionId: string, clientX: number, clientY: number) => void;
  className?: string;
  style?: React.CSSProperties;
}

const statusColors = {
  draft: 'bg-slate-500/20 border-slate-500 text-slate-700 dark:text-slate-300',
  scheduled: 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300',
  confirmed: 'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300',
  completed: 'bg-gray-500/20 border-gray-500 text-gray-700 dark:text-gray-300',
  cancelled: 'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300',
  no_show: 'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300',
};

export function SessionCard({ 
  session, 
  compact = false, 
  onClick, 
  draggable = false, 
  onDragStart, 
  onDragEnd, 
  onTouchDrag,
  onTouchDragEnd,
  className, 
  style 
}: SessionCardProps) {
  const statusColor = statusColors[session.status as keyof typeof statusColors] || statusColors.scheduled;
  const patientName = session.patient 
    ? `${session.patient.first_name} ${session.patient.last_name}` 
    : 'Sin paciente';
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!draggable) {
      e.preventDefault();
      return;
    }
    
    e.stopPropagation();
    setIsDragging(true);
    
    // Set drag data
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', session.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      sessionId: session.id,
      originalDate: session.session_date,
      originalStartTime: session.start_time,
      originalEndTime: session.end_time,
    }));

    // Create a custom drag image
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(cardRef.current, rect.width / 2, 10);
    }
    
    // Notify parent after a microtask to ensure drag has started
    setTimeout(() => onDragStart?.(), 0);
  }, [draggable, session, onDragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTouchDragging) {
      onClick?.();
    }
  }, [onClick, isTouchDragging]);

  // Prevent slot drag from starting when clicking on session
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Touch event handlers for mobile drag & drop
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!draggable) return;
    
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    
    // Start long press timer (400ms to initiate drag - slightly longer to avoid accidental drags)
    longPressTimer.current = setTimeout(() => {
      setIsTouchDragging(true);
      onDragStart?.();
      // Provide haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 400);
  }, [draggable, onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggable) return;
    
    const touch = e.touches[0];
    
    // If we haven't started dragging yet, check if we should cancel long press
    if (!isTouchDragging && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      
      // If moved more than 5px before long press, cancel it (reduced threshold)
      if (dx > 5 || dy > 5) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
      }
    }
    
    // If we're touch dragging, notify parent of position and prevent scroll
    if (isTouchDragging) {
      e.preventDefault();
      e.stopPropagation();
      onTouchDrag?.(session.id, touch.clientX, touch.clientY);
    }
  }, [draggable, isTouchDragging, session.id, onTouchDrag]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (isTouchDragging) {
      e.preventDefault();
      e.stopPropagation();
      
      const touch = e.changedTouches[0];
      onTouchDragEnd?.(session.id, touch.clientX, touch.clientY);
      
      // Small delay before resetting to prevent click firing
      setTimeout(() => {
        setIsTouchDragging(false);
      }, 100);
    }
    
    touchStartPos.current = null;
  }, [isTouchDragging, session.id, onTouchDragEnd]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, []);

  if (compact) {
    return (
      <div
        ref={cardRef}
        className={cn(
          'cursor-pointer rounded-md border-l-2 px-2 py-1 text-xs transition-all hover:opacity-80 h-full select-none',
          draggable && 'cursor-grab active:cursor-grabbing touch-none',
          (isDragging || isTouchDragging) && 'opacity-50 scale-105 z-50',
          statusColor,
          className
        )}
        style={style}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center gap-1">
          {draggable && <GripVertical className="h-3 w-3 opacity-50 flex-shrink-0" />}
          <div className="font-medium truncate flex-1">{patientName}</div>
        </div>
        <div className="text-[10px] opacity-75">
          {session.start_time?.slice(0, 5)} - {session.end_time?.slice(0, 5)}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={cn(
        'cursor-pointer rounded-lg border-l-4 bg-card p-3 shadow-sm transition-all hover:shadow-md h-full select-none',
        draggable && 'cursor-grab active:cursor-grabbing touch-none',
        (isDragging || isTouchDragging) && 'opacity-50 scale-105 z-50',
        statusColor,
        className
      )}
      style={style}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex items-start justify-between gap-2">
        {draggable && <GripVertical className="h-4 w-4 opacity-50 flex-shrink-0 mt-0.5" />}
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
