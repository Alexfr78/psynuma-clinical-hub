import { useMemo } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  addDays, 
  isSameMonth, 
  isToday,
  isSameDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ScheduleException, getExceptionsForDate, getReasonLabel } from '@/lib/schedule-exceptions';
import {
  getApplicableSpecialDaysForDisplay,
  getSpecialDayLabel,
} from '@/lib/special-days-helpers';
import type { SpecialDay, SpecialDayType } from '@/lib/special-days';
import { SessionWithRelations } from '@/hooks/useSessions';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';

interface MonthViewProps {
  currentDate: Date;
  sessions: SessionWithRelations[];
  onSessionClick: (session: SessionWithRelations) => void;
  onDayClick: (date: Date) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  scheduleExceptions?: ScheduleException[];
  specialDays?: SpecialDay[];
  selectedProfessional?: string;
  professionalNames?: Record<string, string>;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const SPECIAL_DAY_BG: Record<SpecialDayType, string> = {
  closed: 'bg-destructive/5',
  custom: 'bg-primary/5',
  extended: 'bg-emerald-50 dark:bg-emerald-950/20',
};

const SPECIAL_DAY_BADGE: Record<SpecialDayType, string> = {
  closed: 'bg-destructive/10 text-destructive',
  custom: 'bg-primary/10 text-primary',
  extended: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
};

const SPECIAL_DAY_ICON: Record<SpecialDayType, string> = {
  closed: '🔒',
  custom: '🕒',
  extended: '➕',
};

export function MonthView({ currentDate, sessions, onSessionClick, onDayClick, onSwipeLeft, onSwipeRight, scheduleExceptions, specialDays, selectedProfessional, professionalNames }: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const { handleTouchStart, handleTouchEnd } = useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
  });

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [calendarStart, calendarEnd]);

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

  const statusColors = {
    scheduled: 'bg-blue-500',
    confirmed: 'bg-green-500',
    completed: 'bg-gray-400',
    cancelled: 'bg-red-500',
    no_show: 'bg-orange-500',
    blocked: 'bg-purple-500',
  };

  return (
    <div className="overflow-hidden rounded-lg border" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b bg-muted/50">
        {WEEKDAYS.map((day) => (
          <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((day, index) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const daySessions = sessionsByDay.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const professionalFilter = selectedProfessional === 'all' ? null : selectedProfessional || null;
          const dayExceptions = scheduleExceptions ? getExceptionsForDate(dateKey, professionalFilter, scheduleExceptions) : [];
          const hasException = dayExceptions.length > 0;
          const isCenterBlock = hasException && dayExceptions[0].scope === 'center';
          const applicableSpecialDays = specialDays ? getApplicableSpecialDaysForDisplay(dateKey, professionalFilter, specialDays) : [];
          const primarySpecialDay = applicableSpecialDays[0] || null;

          return (
            <div
              key={index}
              className={cn(
                'min-h-[100px] border-b border-r p-1 transition-colors hover:bg-muted/50 cursor-pointer',
                !isCurrentMonth && 'bg-muted/30 text-muted-foreground',
                hasException && isCenterBlock && 'bg-destructive/5',
                hasException && !isCenterBlock && 'bg-amber-50 dark:bg-amber-950/20',
                !hasException && primarySpecialDay && SPECIAL_DAY_BG[primarySpecialDay.type],
              )}
              onClick={() => onDayClick(day)}
            >
              <div
                className={cn(
                  'mb-1 flex h-7 w-7 items-center justify-center rounded-full text-sm',
                  isToday(day) && 'bg-primary text-primary-foreground font-bold'
                )}
              >
                {format(day, 'd')}
              </div>

              {hasException && (
                <div className={cn(
                  'text-[9px] font-medium px-1 py-0.5 rounded truncate mb-0.5',
                  isCenterBlock ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                )}>
                  {isCenterBlock ? '🔒 Cerrado' : '🚫'} {getReasonLabel(dayExceptions[0].reason_type, dayExceptions[0].reason_label)}
                </div>
              )}

              {applicableSpecialDays.slice(0, 2).map((sd) => {
                const profName = sd.scope === 'professional' && sd.professional_id
                  ? professionalNames?.[sd.professional_id]
                  : null;
                return (
                  <div
                    key={sd.id}
                    className={cn(
                      'text-[9px] font-medium px-1 py-0.5 rounded truncate mb-0.5',
                      SPECIAL_DAY_BADGE[sd.type],
                    )}
                    title={`${getSpecialDayLabel(sd)}${profName ? ` · ${profName}` : ''}`}
                  >
                    {SPECIAL_DAY_ICON[sd.type]} {profName ? `${profName}` : getSpecialDayLabel(sd)}
                  </div>
                );
              })}
              {applicableSpecialDays.length > 2 && (
                <div className="text-[9px] text-muted-foreground px-1 mb-0.5">
                  +{applicableSpecialDays.length - 2} más
                </div>
              )}

              <div className="space-y-0.5">
                {daySessions.slice(0, 3).map((session) => (
                  <div
                    key={session.id}
                    className={cn(
                      'cursor-pointer rounded px-1 py-0.5 text-[10px] text-white truncate',
                      statusColors[session.status as keyof typeof statusColors] || statusColors.scheduled
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSessionClick(session);
                    }}
                  >
                    {session.start_time?.slice(0, 5)} {session.patient?.first_name}
                  </div>
                ))}
                {daySessions.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{daySessions.length - 3} más
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
