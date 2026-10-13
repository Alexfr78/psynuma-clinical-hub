import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Icon } from '@/components/ui/icon';
import { currentMonthISO, isCustomExpenseRange, monthRange, resolveExpensePeriod } from '@/lib/expense-period';
import { useAuth } from '@/hooks/useAuth';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useProfessionalsWithRoles } from '@/hooks/useProfessionals';
import type { ExpenseFilters } from '@/hooks/useExpenses';

interface ExpenseFiltersBarProps {
  filters: ExpenseFilters;
  onChange: (filters: ExpenseFilters) => void;
}

const ALL = '__all__';

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  const label = MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatDayLabel(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM yyyy', { locale: es });
}

type PeriodMode = 'month' | 'range';

export function ExpenseFiltersBar({ filters, onChange }: ExpenseFiltersBarProps) {
  const { isAdmin } = useAuth();
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useSuppliers();
  const { data: professionals } = useProfessionalsWithRoles();
  const [rangeOpen, setRangeOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();

  const professionalOptions = (professionals ?? []).filter((p) => p.roles.includes('professional'));
  const currentMonth = filters.month ?? currentMonthISO();
  const mode: PeriodMode = isCustomExpenseRange(filters) ? 'range' : 'month';
  const period = resolveExpensePeriod(filters) ?? monthRange(currentMonth);

  const changeMode = (next: PeriodMode) => {
    if (next === mode) return;
    if (next === 'range') {
      // Arranca con el mes que se estaba viendo, para que el listado no salte.
      const { start, end } = monthRange(currentMonth);
      onChange({ ...filters, startDate: start, endDate: end });
      setDraftRange(undefined);
      setRangeOpen(true);
    } else {
      // Vuelve al mes en el que empezaba el rango.
      onChange({ ...filters, month: period.start.slice(0, 7), startDate: undefined, endDate: undefined });
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    setDraftRange(range);
    if (range?.from && range?.to) {
      onChange({
        ...filters,
        startDate: format(range.from, 'yyyy-MM-dd'),
        endDate: format(range.to, 'yyyy-MM-dd'),
      });
      setRangeOpen(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={mode} onValueChange={(v) => changeMode(v as PeriodMode)}>
        <SelectTrigger className="w-[140px]" aria-label="Tipo de periodo"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="month">Por mes</SelectItem>
          <SelectItem value="range">Rango de fechas</SelectItem>
        </SelectContent>
      </Select>

      {mode === 'range' ? (
        <Popover
          open={rangeOpen}
          onOpenChange={(open) => {
            setRangeOpen(open);
            if (open) setDraftRange(undefined);
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="justify-start text-left font-normal">
              <Icon name="calendar_month" className="mr-2 h-4 w-4" />
              {formatDayLabel(period.start)} – {formatDayLabel(period.end)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <p className="px-3 pt-3 text-xs text-muted-foreground">
              {draftRange?.from ? 'Elige la fecha final' : 'Elige la fecha inicial'}
            </p>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={handleRangeSelect}
              defaultMonth={parseISO(period.start)}
              numberOfMonths={2}
              locale={es}
              weekStartsOn={1}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      ) : (
      <div className="flex items-center gap-1 rounded-md border">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange({ ...filters, month: shiftMonth(currentMonth, -1) })}
          title="Mes anterior"
        >
          <Icon name="chevron_left" className="h-4 w-4" />
        </Button>
        <span className="min-w-[120px] text-center text-sm font-medium capitalize">
          {formatMonthLabel(currentMonth)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => onChange({ ...filters, month: shiftMonth(currentMonth, 1) })}
          title="Mes siguiente"
        >
          <Icon name="chevron_right" className="h-4 w-4" />
        </Button>
      </div>
      )}

      <Select
        value={filters.categoryId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, categoryId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[170px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas las categorías</SelectItem>
          {categories?.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.supplierId ?? ALL}
        onValueChange={(v) => onChange({ ...filters, supplierId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="w-[160px]"><SelectValue placeholder="Proveedor" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los proveedores</SelectItem>
          {suppliers?.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isAdmin && (
        <Select
          value={filters.professionalId ?? ALL}
          onValueChange={(v) => onChange({ ...filters, professionalId: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Profesional" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los profesionales</SelectItem>
            {professionalOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{[p.first_name, p.last_name].filter(Boolean).join(' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.status ?? ALL}
        onValueChange={(v) => onChange({ ...filters, status: v === ALL ? undefined : (v as ExpenseFilters['status']) })}
      >
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Estado" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          <SelectItem value="pending">Pendiente</SelectItem>
          <SelectItem value="paid">Pagado</SelectItem>
          <SelectItem value="cancelled">Cancelado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
