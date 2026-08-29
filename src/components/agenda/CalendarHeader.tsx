import { format, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProfessionals } from '@/hooks/usePatients';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGoogleCalendarSync } from '@/hooks/useGoogleCalendarSync';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

export type CalendarView = 'day' | 'week' | 'month' | 'list';

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'list', label: 'Lista' },
];

interface CalendarHeaderProps {
  currentDate: Date;
  view: CalendarView;
  selectedProfessional: string;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onProfessionalChange: (id: string) => void;
  onNewSession: () => void;
}

export function CalendarHeader({
  currentDate,
  view,
  selectedProfessional,
  onDateChange,
  onViewChange,
  onProfessionalChange,
  onNewSession,
}: CalendarHeaderProps) {
  const { data: professionals } = useProfessionals();
  const isMobile = useIsMobile();
  const { sync, isSyncing, isAvailable, lastSyncAt } = useGoogleCalendarSync();

  const navigatePrevious = () => {
    switch (view) {
      case 'day':
        onDateChange(subDays(currentDate, 1));
        break;
      case 'week':
        onDateChange(subWeeks(currentDate, 1));
        break;
      case 'month':
        onDateChange(subMonths(currentDate, 1));
        break;
      case 'list':
        onDateChange(subWeeks(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case 'day':
        onDateChange(addDays(currentDate, 1));
        break;
      case 'week':
        onDateChange(addWeeks(currentDate, 1));
        break;
      case 'month':
        onDateChange(addMonths(currentDate, 1));
        break;
      case 'list':
        onDateChange(addWeeks(currentDate, 1));
        break;
    }
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const getTitle = () => {
    switch (view) {
      case 'day':
        return format(currentDate, "EEEE, d 'de' MMMM yyyy", { locale: es });
      case 'week':
        return format(currentDate, "MMMM yyyy", { locale: es });
      case 'month':
        return format(currentDate, "MMMM yyyy", { locale: es });
      case 'list':
        return format(currentDate, "MMMM yyyy", { locale: es });
    }
  };

  const navPill = (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shadow-none hover:bg-background hover:shadow-sm" onClick={navigatePrevious}>
        <Icon name="chevron_left" className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 shadow-none hover:bg-background hover:shadow-sm" onClick={navigateNext}>
        <Icon name="chevron_right" className="h-4 w-4" />
      </Button>
      <div className="mx-0.5 h-4 w-px bg-border" />
      <Button variant="ghost" size="sm" className="h-7 px-2 sm:h-8 sm:px-3 shadow-none hover:bg-background hover:shadow-sm" onClick={goToToday}>
        {isMobile ? <Icon name="calendar_month" className="h-4 w-4" /> : 'Hoy'}
      </Button>
    </div>
  );

  const title = (
    <h2 className="font-display text-base sm:text-xl font-semibold capitalize whitespace-nowrap shrink-0">
      {getTitle()}
    </h2>
  );

  const professionalSelect = (
    <Select value={selectedProfessional} onValueChange={onProfessionalChange}>
      <SelectTrigger className="w-[120px] sm:w-[180px] h-8 sm:h-9 text-sm shrink-0 rounded-lg">
        <SelectValue placeholder="Profesional" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todos</SelectItem>
        {professionals?.map((prof) => (
          <SelectItem key={prof.id} value={prof.id}>
            {prof.first_name} {prof.last_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const viewSwitcher = (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1 shrink-0">
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onViewChange(option.value)}
          className={cn(
            'rounded-md px-2 py-1 text-xs sm:px-2.5 sm:text-sm font-medium transition-colors whitespace-nowrap',
            view === option.value
              ? 'bg-background text-primary shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const syncButton = isAvailable && (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={sync}
          disabled={isSyncing}
          className="h-8 w-8 sm:h-9 sm:w-9 shrink-0"
        >
          <Icon name="refresh" className={cn("h-4 w-4", isSyncing && "animate-spin")} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {lastSyncAt
          ? `Última sync: ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: es })}`
          : 'Sincronizar con Google Calendar'
        }
      </TooltipContent>
    </Tooltip>
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {navPill}
      {title}
      {professionalSelect}
      {viewSwitcher}
      {syncButton}
      <Button onClick={onNewSession} size={isMobile ? 'icon' : 'default'} className="shrink-0">
        <Icon name="add" className="h-4 w-4" />
        {!isMobile && 'Nueva Sesión'}
      </Button>
    </div>
  );
}
