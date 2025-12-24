import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useSessions, useUpdateSession, SessionWithRelations } from '@/hooks/useSessions';
import { CalendarHeader, CalendarView } from '@/components/agenda/CalendarHeader';
import { WeekView } from '@/components/agenda/WeekView';
import { DayView } from '@/components/agenda/DayView';
import { MonthView } from '@/components/agenda/MonthView';
import { ListView } from '@/components/agenda/ListView';
import { QuickCreateSessionDialog } from '@/components/agenda/QuickCreateSessionDialog';
import { SessionDetailDrawer } from '@/components/agenda/SessionDetailDrawer';
import { MoveSessionDialog } from '@/components/agenda/MoveSessionDialog';
import { AgendaFooter } from '@/components/agenda/AgendaFooter';
import { useToast } from '@/hooks/use-toast';
import { useAgendaHours } from '@/hooks/useAgendaHours';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGoogleCalendarUpdate } from '@/hooks/useGoogleCalendarUpdate';
import { useCalendarEvents, calendarEventToSessionFormat } from '@/hooks/useCalendarEvents';
export default function Agenda() {
  const isMobile = useIsMobile();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [selectedProfessional, setSelectedProfessional] = useState('all');

  // Auto-switch to day view on mobile
  useEffect(() => {
    if (isMobile && view === 'week') {
      setView('day');
    }
  }, [isMobile, view]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [moveSession, setMoveSession] = useState<SessionWithRelations | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();
  const [initialStartTime, setInitialStartTime] = useState<string | undefined>();
  const [initialEndTime, setInitialEndTime] = useState<string | undefined>();

  const { toast } = useToast();
  const updateSession = useUpdateSession();
  const { syncMoveToGoogle } = useGoogleCalendarUpdate();

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    switch (view) {
      case 'day':
        return {
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(currentDate, 'yyyy-MM-dd'),
        };
      case 'week':
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          start: format(weekStart, 'yyyy-MM-dd'),
          end: format(weekEnd, 'yyyy-MM-dd'),
        };
      case 'month':
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        // Extend to cover full calendar weeks
        const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return {
          start: format(calStart, 'yyyy-MM-dd'),
          end: format(calEnd, 'yyyy-MM-dd'),
        };
      case 'list':
        return {
          start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      default:
        return { start: undefined, end: undefined };
    }
  }, [currentDate, view]);

  const { data: sessions, isLoading } = useSessions(
    dateRange.start,
    dateRange.end,
    selectedProfessional
  );

  // Fetch Google Calendar events
  const [showGoogleEvents, setShowGoogleEvents] = useState(true);
  const { data: googleCalendarEvents, isLoading: googleLoading } = useCalendarEvents({
    professionalId: selectedProfessional,
    rangeStart: dateRange.start || format(new Date(), 'yyyy-MM-dd'),
    rangeEnd: dateRange.end || format(new Date(), 'yyyy-MM-dd'),
    enabled: showGoogleEvents,
  });

  // Merge sessions with Google Calendar events for display
  const allSessions = useMemo(() => {
    const baseSessions = sessions || [];
    if (!showGoogleEvents || !googleCalendarEvents?.length) {
      return baseSessions;
    }

    // Convert Google events to session-like format
    const googleAsSessions = googleCalendarEvents.map(calendarEventToSessionFormat);
    
    // Filter out Google events that are already linked to sessions (to avoid duplicates)
    const sessionGoogleIds = new Set(
      baseSessions
        .map((s: any) => s.google_calendar_event_id)
        .filter(Boolean)
    );
    
    const uniqueGoogleEvents = googleAsSessions.filter(
      (ge) => !sessionGoogleIds.has(ge.google_calendar_event_id)
    );

    return [...baseSessions, ...uniqueGoogleEvents] as SessionWithRelations[];
  }, [sessions, googleCalendarEvents, showGoogleEvents]);

  // Dynamic hours based on center/professional configuration and existing sessions
  const { hours, startHour } = useAgendaHours(selectedProfessional, currentDate, allSessions);

  // Sync selectedSession with updated data from sessions query
  useEffect(() => {
    if (selectedSession && sessions) {
      const updatedSession = sessions.find(s => s.id === selectedSession.id);
      if (updatedSession && JSON.stringify(updatedSession) !== JSON.stringify(selectedSession)) {
        setSelectedSession(updatedSession);
      }
    }
  }, [sessions, selectedSession]);

  const handleSlotClick = (date: Date, startTime: string, endTime: string) => {
    setInitialDate(date);
    setInitialStartTime(startTime);
    setInitialEndTime(endTime);
    setCreateDialogOpen(true);
  };

  const handleDayClick = (date: Date) => {
    setCurrentDate(date);
    setView('day');
  };

  const handleSessionClick = (session: SessionWithRelations) => {
    setSelectedSession(session);
  };

  const handleNewSession = () => {
    setInitialDate(currentDate);
    setInitialStartTime('09:00');
    setInitialEndTime('10:00');
    setCreateDialogOpen(true);
  };

  // Swipe navigation functions
  const navigateNext = useCallback(() => {
    switch (view) {
      case 'day':
        setCurrentDate(prev => addDays(prev, 1));
        break;
      case 'week':
        setCurrentDate(prev => addDays(prev, 7));
        break;
      case 'month':
        setCurrentDate(prev => addMonths(prev, 1));
        break;
      case 'list':
        setCurrentDate(prev => addDays(prev, 7));
        break;
    }
  }, [view]);

  const navigatePrev = useCallback(() => {
    switch (view) {
      case 'day':
        setCurrentDate(prev => addDays(prev, -1));
        break;
      case 'week':
        setCurrentDate(prev => addDays(prev, -7));
        break;
      case 'month':
        setCurrentDate(prev => addMonths(prev, -1));
        break;
      case 'list':
        setCurrentDate(prev => addDays(prev, -7));
        break;
    }
  }, [view]);

  const handleSessionMove = async (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => {
    try {
      // Find the session to get Google Calendar event ID
      const session = sessions?.find(s => s.id === sessionId);
      
      await updateSession.mutateAsync({
        id: sessionId,
        session_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
      });
      
      // Sync to Google Calendar immediately with await
      if (session) {
        try {
          await syncMoveToGoogle(session, newDate, newStartTime, newEndTime);
        } catch (googleError) {
          console.error('Error syncing to Google:', googleError);
          toast({
            title: 'Sesión movida',
            description: 'Pero hubo un error al sincronizar con Google Calendar',
          });
          return;
        }
      }
      
      toast({
        title: 'Sesión movida',
        description: `Movida a ${newDate} ${newStartTime}`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo mover la sesión',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
        <p className="text-muted-foreground">
          Gestiona las sesiones y citas de tus pacientes
        </p>
      </div>

      {/* Calendar Header */}
      <CalendarHeader
        currentDate={currentDate}
        view={view}
        selectedProfessional={selectedProfessional}
        onDateChange={setCurrentDate}
        onViewChange={setView}
        onProfessionalChange={setSelectedProfessional}
        onNewSession={handleNewSession}
      />

      {/* Calendar Views */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              sessions={allSessions}
              onSessionClick={handleSessionClick}
              onSlotClick={handleSlotClick}
              onSessionMove={handleSessionMove}
              hours={hours}
              startHour={startHour}
              onSwipeLeft={navigateNext}
              onSwipeRight={navigatePrev}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              sessions={allSessions}
              onSessionClick={handleSessionClick}
              onSlotClick={handleSlotClick}
              onSessionMove={handleSessionMove}
              onMoveRequest={setMoveSession}
              hours={hours}
              startHour={startHour}
              onSwipeLeft={navigateNext}
              onSwipeRight={navigatePrev}
            />
          )}
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              sessions={allSessions}
              onSessionClick={handleSessionClick}
              onDayClick={handleDayClick}
              onSwipeLeft={navigateNext}
              onSwipeRight={navigatePrev}
            />
          )}
          {view === 'list' && (
            <ListView
              sessions={allSessions}
              onSessionClick={handleSessionClick}
              onSwipeLeft={navigateNext}
              onSwipeRight={navigatePrev}
            />
          )}
        </>
      )}

      {/* Quick Create Session Dialog */}
      <QuickCreateSessionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialDate={initialDate}
        initialStartTime={initialStartTime}
        initialEndTime={initialEndTime}
      />

      {/* Session Detail Drawer */}
      <SessionDetailDrawer
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
      />

      {/* Agenda Footer with Legend, Timezone and Google Toggle */}
      <AgendaFooter 
        timezone={timezone} 
        onTimezoneChange={setTimezone}
        showGoogleEvents={showGoogleEvents}
        onShowGoogleEventsChange={setShowGoogleEvents}
      />

      {/* Move Session Dialog (mobile) */}
      <MoveSessionDialog
        session={moveSession}
        open={!!moveSession}
        onOpenChange={(open) => !open && setMoveSession(null)}
        onMove={handleSessionMove}
      />
    </div>
  );
}
