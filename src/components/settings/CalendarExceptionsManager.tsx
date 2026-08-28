import { useState, useMemo, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isToday,
  getYear,
} from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ScheduleException, getReasonLabel } from '@/lib/schedule-exceptions';
import { useDeleteScheduleException } from '@/hooks/useScheduleExceptions';
import { BatchExceptionDialog } from './BatchExceptionDialog';
import { CreateScheduleExceptionDialog } from './CreateScheduleExceptionDialog';
import { Icon } from '@/components/ui/icon';

const REASON_COLORS: Record<string, { bg: string; dot: string; label: string }> = {
  holiday:    { bg: 'bg-destructive/10', dot: 'bg-destructive',                        label: 'Festivo' },
  vacation:   { bg: 'bg-[hsl(38,92%,50%)]/10', dot: 'bg-[hsl(38,92%,50%)]',           label: 'Vacaciones' },
  sick_leave: { bg: 'bg-[hsl(24,80%,50%)]/10', dot: 'bg-[hsl(24,80%,50%)]',           label: 'Baja médica' },
  training:   { bg: 'bg-primary/10',            dot: 'bg-primary',                     label: 'Formación' },
  closure:    { bg: 'bg-muted',                 dot: 'bg-muted-foreground',            label: 'Cierre' },
  other:      { bg: 'bg-[hsl(270,60%,60%)]/10', dot: 'bg-[hsl(270,60%,60%)]',         label: 'Otro' },
};

const WEEKDAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

interface Props {
  exceptions: ScheduleException[];
  professionals: Array<{ id: string; first_name: string | null; last_name: string | null }> | undefined;
  centerId: string;
}

export function CalendarExceptionsManager({ exceptions, professionals, centerId }: Props) {
  const [year, setYear] = useState(getYear(new Date()));
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [filterScope, setFilterScope] = useState<'all' | 'center' | string>('all');
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editException, setEditException] = useState<ScheduleException | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const deleteException = useDeleteScheduleException();

  // Build lookup: dateKey → exceptions[]
  const exceptionsByDate = useMemo(() => {
    const map = new Map<string, ScheduleException[]>();
    for (const exc of exceptions) {
      let d = new Date(exc.start_date + 'T00:00:00');
      const end = new Date(exc.end_date + 'T00:00:00');
      while (d <= end) {
        const key = format(d, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(exc);
        d = addDays(d, 1);
      }
    }
    return map;
  }, [exceptions]);

  // Filter exceptions for display
  const filteredExcByDate = useMemo(() => {
    if (filterScope === 'all') return exceptionsByDate;
    const map = new Map<string, ScheduleException[]>();
    for (const [key, excs] of exceptionsByDate) {
      const filtered = excs.filter(e =>
        filterScope === 'center' ? e.scope === 'center' : e.professional_id === filterScope
      );
      if (filtered.length > 0) map.set(key, filtered);
    }
    return map;
  }, [exceptionsByDate, filterScope]);

  const toggleDate = useCallback((dateKey: string) => {
    setSelectedDates(prev => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }, []);

  const handleBatchSave = () => {
    if (selectedDates.size === 0) return;
    setBatchDialogOpen(true);
  };

  const handleBatchComplete = () => {
    setBatchDialogOpen(false);
    setSelectedDates(new Set());
  };

  const handleDayClick = (dateKey: string, dayExcs: ScheduleException[]) => {
    if (dayExcs.length > 0 && !selectedDates.has(dateKey)) {
      // If clicking an existing exception and nothing selected, edit it
      if (selectedDates.size === 0 && dayExcs.length === 1) {
        setEditException(dayExcs[0]);
        setEditDialogOpen(true);
        return;
      }
    }
    toggleDate(dateKey);
  };

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y - 1)}>
            <Icon name="chevron_left" className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[4ch] text-center">{year}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setYear(y => y + 1)}>
            <Icon name="chevron_right" className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los bloqueos</SelectItem>
              <SelectItem value="center">Solo centro</SelectItem>
              {professionals?.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.first_name} {p.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Selection actions bar */}
      {selectedDates.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="text-sm font-medium">
            {selectedDates.size} día{selectedDates.size > 1 ? 's' : ''} seleccionado{selectedDates.size > 1 ? 's' : ''}
          </span>
          <Button size="sm" onClick={handleBatchSave}>
            Crear bloqueo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedDates(new Set())}>
            Limpiar selección
          </Button>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(REASON_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', val.dot)} />
            <span className="text-muted-foreground">{val.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-primary bg-primary/20" />
          <span className="text-muted-foreground">Seleccionado</span>
        </div>
      </div>

      {/* Annual grid: 12 months */}
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }, (_, monthIdx) => (
            <MonthMiniCalendar
              key={monthIdx}
              year={year}
              month={monthIdx}
              exceptionsByDate={filteredExcByDate}
              selectedDates={selectedDates}
              onDayClick={handleDayClick}
              onDeleteException={(exc) => deleteException.mutate(exc.id)}
              onEditException={(exc) => { setEditException(exc); setEditDialogOpen(true); }}
            />
          ))}
        </div>
      </TooltipProvider>

      <BatchExceptionDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        selectedDates={Array.from(selectedDates).sort()}
        centerId={centerId}
        professionals={professionals}
        existingExceptions={exceptions}
        onComplete={handleBatchComplete}
      />

      <CreateScheduleExceptionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editException={editException}
      />
    </div>
  );
}

/* ─── Mini month calendar ─── */

interface MonthMiniCalendarProps {
  year: number;
  month: number;
  exceptionsByDate: Map<string, ScheduleException[]>;
  selectedDates: Set<string>;
  onDayClick: (dateKey: string, excs: ScheduleException[]) => void;
  onDeleteException: (exc: ScheduleException) => void;
  onEditException: (exc: ScheduleException) => void;
}

function MonthMiniCalendar({
  year,
  month,
  exceptionsByDate,
  selectedDates,
  onDayClick,
  onDeleteException,
  onEditException,
}: MonthMiniCalendarProps) {
  const monthDate = new Date(year, month, 1);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  return (
    <div className="rounded-lg border bg-card p-2">
      <h3 className="text-center text-sm font-semibold capitalize mb-1.5">
        {format(monthDate, 'MMMM', { locale: es })}
      </h3>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAY_HEADERS.map(h => (
          <div key={h} className="text-center text-[10px] font-medium text-muted-foreground pb-0.5">
            {h}
          </div>
        ))}
        {days.map((day, idx) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, monthDate);
          const today = isToday(day);
          const dayExcs = exceptionsByDate.get(dateKey) || [];
          const isSelected = selectedDates.has(dateKey);
          const hasException = dayExcs.length > 0;
          const primaryExc = dayExcs[0];
          const reasonColor = primaryExc ? REASON_COLORS[primaryExc.reason_type] : null;

          const cell = (
            <button
              key={idx}
              type="button"
              onClick={() => inMonth && onDayClick(dateKey, dayExcs)}
              disabled={!inMonth}
              className={cn(
                'relative h-7 w-full rounded text-[11px] transition-colors focus:outline-none focus:ring-1 focus:ring-ring',
                !inMonth && 'opacity-0 pointer-events-none',
                inMonth && !hasException && !isSelected && 'hover:bg-muted',
                today && 'font-bold',
                isSelected && 'ring-2 ring-primary bg-primary/15',
                hasException && !isSelected && reasonColor?.bg,
              )}
            >
              <span className={cn(
                'relative z-10',
                today && !isSelected && !hasException && 'text-primary',
              )}>
                {format(day, 'd')}
              </span>
              {hasException && (
                <span className={cn(
                  'absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full',
                  reasonColor?.dot,
                )} />
              )}
            </button>
          );

          if (!inMonth || !hasException) return cell;

          return (
            <Tooltip key={idx}>
              <TooltipTrigger asChild>{cell}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] p-2">
                <div className="space-y-1">
                  {dayExcs.map(exc => (
                    <div key={exc.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', REASON_COLORS[exc.reason_type]?.dot)} />
                        <span className="text-xs truncate">
                          {getReasonLabel(exc.reason_type, exc.reason_label)}
                          {exc.scope === 'professional' && ' (Prof.)'}
                        </span>
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.stopPropagation(); onEditException(exc); }}>
                          <Icon name="edit" className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={(e) => { e.stopPropagation(); onDeleteException(exc); }}>
                          <Icon name="delete" className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
