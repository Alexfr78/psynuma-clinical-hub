import { useState, useMemo } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { useSessions, SessionWithRelations } from '@/hooks/useSessions';
import { CalendarHeader, CalendarView } from '@/components/agenda/CalendarHeader';
import { WeekView } from '@/components/agenda/WeekView';
import { DayView } from '@/components/agenda/DayView';
import { MonthView } from '@/components/agenda/MonthView';
import { ListView } from '@/components/agenda/ListView';
import { CreateSessionDialog } from '@/components/agenda/CreateSessionDialog';
import { SessionDetailDialog } from '@/components/agenda/SessionDetailDialog';

export default function Agenda() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [selectedProfessional, setSelectedProfessional] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [initialDate, setInitialDate] = useState<Date | undefined>();
  const [initialTime, setInitialTime] = useState<string | undefined>();

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

  const handleSlotClick = (date: Date, time: string) => {
    setInitialDate(date);
    setInitialTime(time);
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
    setInitialTime('09:00');
    setCreateDialogOpen(true);
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
              sessions={sessions || []}
              onSessionClick={handleSessionClick}
              onSlotClick={handleSlotClick}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              sessions={sessions || []}
              onSessionClick={handleSessionClick}
              onSlotClick={handleSlotClick}
            />
          )}
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              sessions={sessions || []}
              onSessionClick={handleSessionClick}
              onDayClick={handleDayClick}
            />
          )}
          {view === 'list' && (
            <ListView
              sessions={sessions || []}
              onSessionClick={handleSessionClick}
            />
          )}
        </>
      )}

      {/* Create Session Dialog */}
      <CreateSessionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialDate={initialDate}
        initialTime={initialTime}
      />

      {/* Session Detail Dialog */}
      <SessionDetailDialog
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
      />
    </div>
  );
}
