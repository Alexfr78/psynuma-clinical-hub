import { format, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProfessionals } from '@/hooks/usePatients';

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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={navigatePrevious}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={navigateNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={goToToday}>
          Hoy
        </Button>
        <h2 className="ml-2 font-display text-xl font-semibold capitalize">
          {getTitle()}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={selectedProfessional} onValueChange={onProfessionalChange}>
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[120px]">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Día</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mes</SelectItem>
            <SelectItem value="list">Lista</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={onNewSession}>
          Nueva Sesión
        </Button>
      </div>
    </div>
  );
}
