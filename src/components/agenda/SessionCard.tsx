import { User, Clock, GripVertical, Move, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SessionWithRelations } from '@/hooks/useSessions';
import { useCallback, useRef, useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface SessionCardProps {
  session: SessionWithRelations;
  compact?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onMoveRequest?: (session: SessionWithRelations) => void;
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
  blocked: 'bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300',
  google_event: 'bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300',
};

export function SessionCard({ 
  session, 
  compact = false, 
  onClick, 
  draggable = false, 
  onDragStart, 
  onDragEnd, 
  onMoveRequest,
  className, 
  style 
}: SessionCardProps) {
  const isMobile = useIsMobile();
  
  // Check if this is a Google Calendar event (imported)
  const isGoogleEvent = (session as any).isGoogleEvent === true;
  
  // Use google_event color for imported events
  const effectiveStatus = isGoogleEvent ? 'google_event' : session.status;
  const statusColor = statusColors[effectiveStatus as keyof typeof statusColors] || statusColors.scheduled;
  
  // For blocked sessions from Google Calendar, extract the event title from notes
  const getDisplayName = () => {
    if (isGoogleEvent) {
      // For imported Google events, notes contains the summary
      const title = session.notes?.split('\n')[0] || 'Evento externo';
      return title;
    }
    if (session.status === 'blocked' && session.notes?.startsWith('[Google Calendar]')) {
      const title = session.notes.split('\n')[0].replace('[Google Calendar] ', '');
      return title || 'Bloqueado';
    }
    return session.patient 
      ? `${session.patient.first_name} ${session.patient.last_name}` 
      : 'Sin paciente';
  };
  
  const displayName = getDisplayName();
  
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showMoveHint, setShowMoveHint] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Desktop drag handlers
  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!draggable || isMobile) {
      e.preventDefault();
      return;
    }
    
    e.stopPropagation();
    setIsDragging(true);
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', session.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      sessionId: session.id,
      originalDate: session.session_date,
      originalStartTime: session.start_time,
      originalEndTime: session.end_time,
    }));

    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      e.dataTransfer.setDragImage(cardRef.current, rect.width / 2, 10);
    }
    
    setTimeout(() => onDragStart?.(), 0);
  }, [draggable, isMobile, session, onDragStart]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!showMoveHint) {
      onClick?.();
    }
  }, [onClick, showMoveHint]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Touch event handlers for mobile - long press opens move dialog
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!draggable || !onMoveRequest) return;
    
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    
    // Start long press timer (500ms to show move option)
    longPressTimer.current = setTimeout(() => {
      setShowMoveHint(true);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, 500);
  }, [draggable, onMoveRequest]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    
    // If moved more than 10px, cancel long press
    if (dx > 10 || dy > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // Clear long press timer
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    
    if (showMoveHint) {
      e.preventDefault();
      e.stopPropagation();
      setShowMoveHint(false);
      onMoveRequest?.(session);
    }
    
    touchStartPos.current = null;
  }, [showMoveHint, session, onMoveRequest]);

  // Reset move hint if touch cancelled
  const handleTouchCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setShowMoveHint(false);
    touchStartPos.current = null;
  }, []);

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
          'cursor-pointer rounded-md border-l-2 px-2 py-1 text-xs transition-all hover:opacity-80 h-full select-none relative',
          draggable && !isMobile && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-50 scale-105',
          showMoveHint && 'ring-2 ring-primary ring-offset-2',
          statusColor,
          className
        )}
        style={style}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        draggable={draggable && !isMobile}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {showMoveHint && (
          <div className="absolute inset-0 bg-primary/90 rounded-md flex items-center justify-center text-primary-foreground z-10">
            <Move className="h-4 w-4 mr-1" />
            <span className="text-xs font-medium">Soltar para mover</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {draggable && !isMobile && <GripVertical className="h-3 w-3 opacity-50 flex-shrink-0" />}
          <div className="font-medium truncate flex-1">{displayName}</div>
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
        'cursor-pointer rounded-lg border-l-4 bg-card p-3 shadow-sm transition-all hover:shadow-md h-full select-none relative',
        draggable && !isMobile && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50 scale-105',
        showMoveHint && 'ring-2 ring-primary ring-offset-2',
        statusColor,
        className
      )}
      style={style}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      draggable={draggable && !isMobile}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {showMoveHint && (
        <div className="absolute inset-0 bg-primary/90 rounded-lg flex items-center justify-center text-primary-foreground z-10">
          <Move className="h-5 w-5 mr-2" />
          <span className="font-medium">Soltar para mover</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        {draggable && !isMobile && <GripVertical className="h-4 w-4 opacity-50 flex-shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <h4 className="font-medium truncate">{displayName}</h4>
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
