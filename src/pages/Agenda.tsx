import { useState, useMemo, useEffect, useCallback } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';

import { useQueryClient } from '@tanstack/react-query';
import { useSessions, useUpdateSession, SessionWithRelations } from '@/hooks/useSessions';
import { CalendarHeader, CalendarView } from '@/components/agenda/CalendarHeader';
import { WeekView } from '@/components/agenda/WeekView';
import { DayView } from '@/components/agenda/DayView';
import { MonthView } from '@/components/agenda/MonthView';
import { ListView } from '@/components/agenda/ListView';
import { QuickCreateSessionDialog } from '@/components/agenda/QuickCreateSessionDialog';
import { SessionDetailDrawer } from '@/components/agenda/SessionDetailDrawer';
import { TranscriptionAnalysisDialog } from '@/components/agenda/TranscriptionAnalysisDialog';
import { MoveSessionDialog } from '@/components/agenda/MoveSessionDialog';
import { ConflictsDialog } from '@/components/agenda/ConflictsDialog';
import { AgendaFooter } from '@/components/agenda/AgendaFooter';
import { PendingApprovalsPanel } from '@/components/agenda/PendingApprovalsPanel';
import { NetworkStatusIndicator } from '@/components/agenda/NetworkStatusIndicator';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useAgendaHours } from '@/hooks/useAgendaHours';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGoogleCalendarUpdate } from '@/hooks/useGoogleCalendarUpdate';
import { useCalendarEvents, calendarEventToSessionFormat } from '@/hooks/useCalendarEvents';
import { useCenter } from '@/hooks/useCenter';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useOfflineCache } from '@/hooks/useOfflineCache';
import { useGoogleCalendarSync } from '@/hooks/useGoogleCalendarSync';
import { supabase } from '@/integrations/supabase/client';
import { useScheduleExceptions } from '@/hooks/useScheduleExceptions';
import { useSpecialDays } from '@/hooks/useSpecialDays';
import { useProfessionals } from '@/hooks/useProfessionals';
import { checkSessionConflicts, ConflictResult } from '@/lib/conflicts';
import { syncZoomMeetingDateTime } from '@/lib/zoom-sync';
import { Icon } from '@/components/ui/icon';

export default function Agenda() {
  const isMobile = useIsMobile();
  const { center } = useCenter();
  const { profile } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [selectedProfessional, setSelectedProfessional] = useState('all');
  
  // Get showWeekends preference from center settings (default true)
  const showWeekends = center?.agenda_show_weekends !== false;

  // No longer auto-switch to day view on mobile - week view is now responsive
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [transcriptionSessionId, setTranscriptionSessionId] = useState<string | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);
  const [moveSession, setMoveSession] = useState<SessionWithRelations | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();
  const [initialStartTime, setInitialStartTime] = useState<string | undefined>();
  const [initialEndTime, setInitialEndTime] = useState<string | undefined>();
  
  // Drag-and-drop conflict state
  const [dragConflicts, setDragConflicts] = useState<ConflictResult[]>([]);
  const [showDragConflictsDialog, setShowDragConflictsDialog] = useState(false);
  const [pendingDragMove, setPendingDragMove] = useState<{ sessionId: string; newDate: string; newStartTime: string; newEndTime: string; session: SessionWithRelations } | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateSession = useUpdateSession();
  const { syncMoveToGoogle } = useGoogleCalendarUpdate();

  // Network and offline cache hooks
  const networkStatus = useNetworkStatus();
  const { 
    cachedSessions, 
    saveToCache, 
    hasPendingChanges, 
    pendingChanges,
    cacheError,
    isInitialized: isCacheInitialized,
  } = useOfflineCache();
  const { 
    sync: triggerGoogleSync, 
    isSyncing: isGoogleSyncing, 
    isAvailable: isGoogleSyncAvailable,
  } = useGoogleCalendarSync();

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    switch (view) {
      case 'day':
        return {
          start: format(currentDate, 'yyyy-MM-dd'),
          end: format(currentDate, 'yyyy-MM-dd'),
        };
      case 'week': {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        return {
          start: format(weekStart, 'yyyy-MM-dd'),
          end: format(weekEnd, 'yyyy-MM-dd'),
        };
      }
      case 'month': {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        // Extend to cover full calendar weeks
        const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
        const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
        return {
          start: format(calStart, 'yyyy-MM-dd'),
          end: format(calEnd, 'yyyy-MM-dd'),
        };
      }
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

  // Save sessions to cache when they change
  useEffect(() => {
    if (sessions && sessions.length > 0) {
      saveToCache(sessions);
    }
  }, [sessions, saveToCache]);

  // Determine which sessions to show (server or cache fallback)
  const effectiveSessions = useMemo(() => {
    if (sessions && sessions.length > 0) {
      return sessions;
    }
    if (!networkStatus.isOnline || isLoading) {
      return cachedSessions;
    }
    return sessions || [];
  }, [sessions, cachedSessions, networkStatus.isOnline, isLoading]);

  const isUsingCache = !networkStatus.isOnline || (isLoading && cachedSessions.length > 0);
  const canSync = networkStatus.isOnline && isGoogleSyncAvailable && !isGoogleSyncing;

  const handleSync = useCallback(() => {
    if (canSync) {
      triggerGoogleSync();
    }
  }, [canSync, triggerGoogleSync]);

  // Merge sessions with Google Calendar events for display
  const allSessions = useMemo(() => {
    const baseSessions = effectiveSessions || [];
    if (!showGoogleEvents || !googleCalendarEvents?.length) {
      return baseSessions;
    }

    // Convert Google events to session-like format
    const googleAsSessions = googleCalendarEvents.map(calendarEventToSessionFormat);
    
    // Filter out Google events that are already linked to sessions (to avoid duplicates)
    const sessionGoogleIds = new Set(
      baseSessions
        .map((s: { google_calendar_event_id: string | null }) => s.google_calendar_event_id)
        .filter(Boolean)
    );
    
    const uniqueGoogleEvents = googleAsSessions.filter(
      (ge) => !sessionGoogleIds.has(ge.google_calendar_event_id)
    );

    return [...baseSessions, ...uniqueGoogleEvents] as SessionWithRelations[];
  }, [effectiveSessions, googleCalendarEvents, showGoogleEvents]);

  const visibleSessionsForHours = useMemo(() => {
    if (view === 'day') {
      const dayKey = format(currentDate, 'yyyy-MM-dd');
      return allSessions.filter((session) => session.session_date === dayKey);
    }

    if (view === 'week' || view === 'list') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = showWeekends
        ? endOfWeek(currentDate, { weekStartsOn: 1 })
        : addDays(weekStart, 4);

      const startKey = format(weekStart, 'yyyy-MM-dd');
      const endKey = format(weekEnd, 'yyyy-MM-dd');

      return allSessions.filter(
        (session) => session.session_date >= startKey && session.session_date <= endKey
      );
    }

    return allSessions;
  }, [allSessions, currentDate, view, showWeekends]);

  const transcriptionSession = useMemo(() => {
    if (!transcriptionSessionId) return null;
    return allSessions.find((session) => session.id === transcriptionSessionId) ?? null;
  }, [allSessions, transcriptionSessionId]);

  // Dynamic hours based on center/professional configuration and visible sessions only
  const { hours, startHour } = useAgendaHours(selectedProfessional, currentDate, visibleSessionsForHours);

  // Fetch schedule exceptions for the visible date range
  const { data: scheduleExceptions } = useScheduleExceptions(center?.id, dateRange.start, dateRange.end);

  // Fetch special days (not date-scoped; filtered client-side in views)
  const { data: specialDays } = useSpecialDays(center?.id);

  // Map professional id -> short display name (for special-day badges in "all" view)
  const { data: professionals } = useProfessionals();
  const professionalNames = useMemo(() => {
    const map: Record<string, string> = {};
    (professionals || []).forEach((p) => {
      const first = p.first_name || '';
      const last = p.last_name || '';
      const initial = last ? ` ${last.charAt(0)}.` : '';
      map[p.id] = `${first}${initial}`.trim() || 'Profesional';
    });
    return map;
  }, [professionals]);

  // Sync selectedSession with updated data from sessions query
  useEffect(() => {
    if (selectedSession && sessions) {
      const updatedSession = sessions.find(s => s.id === selectedSession.id);
      if (updatedSession && JSON.stringify(updatedSession) !== JSON.stringify(selectedSession)) {
        setSelectedSession(updatedSession);
      }
    }
  }, [sessions, selectedSession]);

  // Handle session selection from history (via custom event)
  useEffect(() => {
    const handleSelectSession = async (event: CustomEvent<{ sessionId: string }>) => {
      const { sessionId } = event.detail;
      
      // First check if session is in current sessions list
      const sessionInList = sessions?.find(s => s.id === sessionId);
      if (sessionInList) {
        setSelectedSession(sessionInList);
        return;
      }
      
      // Otherwise fetch the session directly
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select(`
            *,
            patient:patients!sessions_patient_id_fkey(
              id, first_name, last_name, email, phone
            ),
            professional:profiles!sessions_professional_id_fkey(
              id, first_name, last_name
            )
          `)
          .eq('id', sessionId)
          .single();
        
        if (error) throw error;
        if (data) {
          // Navigate to the session's date if needed
          const sessionDate = new Date(data.session_date + 'T00:00:00');
          setCurrentDate(sessionDate);
          setSelectedSession(data as SessionWithRelations);
        }
      } catch (error) {
        console.error('Error fetching session:', error);
        toast({
          title: 'Error',
          description: 'No se pudo cargar la sesión',
          variant: 'destructive',
        });
      }
    };

    window.addEventListener('select-session', handleSelectSession as EventListener);
    return () => {
      window.removeEventListener('select-session', handleSelectSession as EventListener);
    };
  }, [sessions, toast]);

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
      // First check if this is a Google Calendar event (not a session)
      const sessionOrEvent = allSessions?.find(s => s.id === sessionId);
      
      if ((sessionOrEvent as { isGoogleEvent?: boolean })?.isGoogleEvent) {
        // This is a Google Calendar event - update it directly in Google
        const googleEvent = sessionOrEvent as { professional_id?: string; google_calendar_event_id?: string };
        
        const { data, error } = await supabase.functions.invoke('update-google-calendar-event', {
          body: {
            professional_id: googleEvent.professional_id,
            event_id: googleEvent.google_calendar_event_id,
            session_date: newDate,
            start_time: newStartTime,
            end_time: newEndTime,
          }
        });
        
        if (error || !data?.success) {
          const errorMessage = data?.error === 'needs_reconnect' 
            ? 'Token expirado, reconecta Google Calendar'
            : (data?.message || 'No se pudo mover el evento de Google');
          toast({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive',
          });
          return;
        }
        
        // Update the local calendar_events table.
        // IMPORTANT: build ISO strings from the browser's local time so the
        // timestamptz column stores the correct UTC instant (otherwise a naive
        // "YYYY-MM-DDTHH:MM:00" is interpreted as UTC and the event appears
        // shifted by the Madrid offset on re-render).
        const startIso = new Date(`${newDate}T${newStartTime}:00`).toISOString();
        const endIso = new Date(`${newDate}T${newEndTime}:00`).toISOString();
        await supabase
          .from('calendar_events')
          .update({
            start_at: startIso,
            end_at: endIso,
          })
          .eq('id', sessionId);
        
        // Invalidate queries to refresh
        queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
        
        toast({
          title: 'Evento movido',
          description: `Movido a ${newDate} ${newStartTime}`,
        });
        return;
      }
      
      // This is a regular Psycma session
      const session = sessions?.find(s => s.id === sessionId);
      
      if (!session) {
        toast({
          title: 'Error',
          description: 'No se encontró la sesión',
          variant: 'destructive',
        });
        return;
      }

      // Check for conflicts before moving
      const centerId = profile?.center_id;
      const professionalId = session.professional_id;
      if (centerId && professionalId) {
        try {
          const start = new Date(`${newDate}T${newStartTime}`);
          const end = new Date(`${newDate}T${newEndTime}`);
          const conflictResults = await checkSessionConflicts({
            centerId,
            professionalId,
            sessionsToCheck: [{ start, end }],
            excludeSessionId: sessionId,
          });
          if (conflictResults.length > 0) {
            // Store pending move and show conflicts dialog
            setDragConflicts(conflictResults);
            setPendingDragMove({ sessionId, newDate, newStartTime, newEndTime, session });
            setShowDragConflictsDialog(true);
            return;
          }
        } catch (err) {
          console.error('Error checking drag conflicts:', err);
          // Proceed if conflict check fails
        }
      }
      
      await updateSession.mutateAsync({
        id: sessionId,
        session_date: newDate,
        start_time: newStartTime,
        end_time: newEndTime,
        // Rescheduling voids the patient's confirmation
        ...(session.status === 'confirmed' && { status: 'scheduled' }),
      });

      try {
        await syncZoomMeetingDateTime(session, newDate, newStartTime, newEndTime);
      } catch (zoomError) {
        console.error('Error syncing to Zoom:', zoomError);
        toast({
          title: 'Sesion movida',
          description: 'La cita se actualizo, pero Zoom no pudo sincronizarse.',
        });
      }

      // Sync to Google Calendar immediately with await
      try {
        const result = await syncMoveToGoogle(session, newDate, newStartTime, newEndTime);
        
        if (result.recreated) {
          toast({
            title: 'Sesión movida',
            description: 'Evento de Google Calendar recreado y vinculado.',
          });
        } else if (result.created) {
          toast({
            title: 'Sesión movida',
            description: 'Evento creado en Google Calendar.',
          });
        } else if (!result.success) {
          toast({
            title: 'Sesión movida',
            description: result.error || 'Pero hubo un error al sincronizar con Google Calendar',
          });
        } else {
          toast({
            title: 'Sesión movida',
            description: `Movida a ${newDate} ${newStartTime}`,
          });
        }
      } catch (googleError) {
        console.error('Error syncing to Google:', googleError);
        toast({
          title: 'Sesión movida',
          description: 'Pero hubo un error al sincronizar con Google Calendar',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'No se pudo mover la sesión',
        variant: 'destructive',
      });
    }
  };

  const executeForceDragMove = async () => {
    if (!pendingDragMove) return;
    const { sessionId, newDate, newStartTime, newEndTime, session } = pendingDragMove;
    setPendingDragMove(null);
    try {
      const { error } = await supabase.rpc('update_session_datetime_force', {
        p_session_id: sessionId,
        p_session_date: newDate,
        p_start_time: newStartTime,
        p_end_time: newEndTime,
      });
      if (error) throw error;
      // Rescheduling voids the patient's confirmation
      if (session.status === 'confirmed') {
        await supabase.from('sessions').update({ status: 'scheduled' }).eq('id', sessionId);
      }
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      try {
        await syncZoomMeetingDateTime(session, newDate, newStartTime, newEndTime);
      } catch (zoomError) {
        console.error('Error syncing forced move to Zoom:', zoomError);
      }
      try {
        await syncMoveToGoogle(session, newDate, newStartTime, newEndTime);
      } catch {
        // Sincronización con Google es best-effort; no debe bloquear el movimiento
      }
      toast({ title: 'Sesión movida', description: `Movida a ${newDate} ${newStartTime} (con conflicto)` });
    } catch (err) {
      console.error('executeForceDragMove error:', err);
      toast({ title: 'Error', description: 'No se pudo mover la sesión', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Agenda</h1>
          <p className="text-muted-foreground">
            Gestiona las sesiones y citas de tus contactos
          </p>
        </div>
        
        {/* Network Status Indicator */}
        <NetworkStatusIndicator
          isOnline={networkStatus.isOnline}
          isSlowConnection={networkStatus.isSlowConnection}
          isUsingCache={isUsingCache}
          hasPendingChanges={hasPendingChanges}
          pendingChangesCount={pendingChanges.length}
          isSyncing={isGoogleSyncing}
          canSync={canSync}
          onSync={handleSync}
          cacheError={cacheError}
        />
      </div>

      {/* Pending Approvals Panel */}
      <PendingApprovalsPanel />

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
      {isLoading && cachedSessions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
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
              showWeekends={showWeekends}
              scheduleExceptions={scheduleExceptions}
              specialDays={specialDays}
              selectedProfessional={selectedProfessional}
              professionalNames={professionalNames}
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
              scheduleExceptions={scheduleExceptions}
              specialDays={specialDays}
              selectedProfessional={selectedProfessional}
              professionalNames={professionalNames}
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
              scheduleExceptions={scheduleExceptions}
              specialDays={specialDays}
              selectedProfessional={selectedProfessional}
              professionalNames={professionalNames}
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
        onAnalyzeTranscription={(sessionId) => {
          setTranscriptionSessionId(sessionId);
          setTranscriptionOpen(true);
        }}
      />

      <TranscriptionAnalysisDialog
        open={transcriptionOpen}
        onOpenChange={(open) => {
          setTranscriptionOpen(open);
          if (!open) setTranscriptionSessionId(null);
        }}
      sessionId={transcriptionSessionId ?? undefined}
      patientName={transcriptionSession?.patient ? `${transcriptionSession.patient.first_name} ${transcriptionSession.patient.last_name}` : undefined}
      patientPhone={transcriptionSession?.patient?.phone ?? undefined}
      patientEmail={transcriptionSession?.patient?.email ?? undefined}
      sessionDate={transcriptionSession?.session_date}
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

      {/* Drag-and-drop Conflicts Dialog */}
      <ConflictsDialog
        open={showDragConflictsDialog}
        onOpenChange={setShowDragConflictsDialog}
        conflicts={dragConflicts}
        isRecurring={false}
        totalSessions={1}
        onCancel={() => {
          setShowDragConflictsDialog(false);
          setPendingDragMove(null);
        }}
        onForceCreate={executeForceDragMove}
      />
    </div>
  );
}
