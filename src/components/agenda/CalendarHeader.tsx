import { format, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus, RefreshCw } from 'lucide-react';
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

export type CalendarView = 'day' | 'week' | 'month' | 'list';

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

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Navigation and Title */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={navigatePrevious}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={goToToday}>
            {isMobile ? <CalendarIcon className="h-4 w-4" /> : 'Hoy'}
          </Button>
        </div>
        <h2 className="font-display text-base sm:text-xl font-semibold capitalize truncate max-w-[150px] sm:max-w-none">
          {getTitle()}
        </h2>
        <div className="flex items-center gap-2">
          {/* Google Calendar Sync Button */}
          {isAvailable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size={isMobile ? "icon" : "sm"}
                  onClick={sync}
                  disabled={isSyncing}
                  className="h-8 sm:h-9"
                >
                  <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                  {!isMobile && <span className="ml-2">Sincronizar</span>}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {lastSyncAt 
                  ? `Última sync: ${formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: es })}`
                  : 'Sincronizar con Google Calendar'
                }
              </TooltipContent>
            </Tooltip>
          )}
          
          {/* Desktop New Session Button */}
          {!isMobile && (
            <Button onClick={onNewSession}>
              Nueva Sesión
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Select value={selectedProfessional} onValueChange={onProfessionalChange}>
          <SelectTrigger className="w-[140px] sm:w-[180px] h-8 sm:h-9 text-sm shrink-0">
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

        <Select value={view} onValueChange={(v) => onViewChange(v as CalendarView)}>
          <SelectTrigger className="w-[100px] sm:w-[120px] h-8 sm:h-9 text-sm shrink-0">
            <CalendarIcon className="mr-1 sm:mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Día</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mes</SelectItem>
            <SelectItem value="list">Lista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile FAB for New Session */}
      {isMobile && (
        <Button
          onClick={onNewSession}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
          size="icon"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}
