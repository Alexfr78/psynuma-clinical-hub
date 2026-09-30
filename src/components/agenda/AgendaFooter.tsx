import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import {
  AGENDA_INDICATORS,
  AgendaIndicatorKey,
  AgendaIndicatorVisibility,
} from '@/lib/agenda-indicators';

interface AgendaFooterProps {
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  showGoogleEvents?: boolean;
  onShowGoogleEventsChange?: (show: boolean) => void;
  visibleIndicators?: AgendaIndicatorVisibility;
  onIndicatorChange?: (key: AgendaIndicatorKey, visible: boolean) => void;
  onResetIndicators?: () => void;
}

const statusLegend = [
  { label: 'Pendiente', colorClass: 'bg-slate-400' },
  { label: 'Programada', colorClass: 'bg-blue-500' },
  { label: 'Pagada', colorClass: 'bg-green-500' },
  { label: 'Pendiente de pago', colorClass: 'bg-orange-500' },
  { label: 'Cancelada', colorClass: 'bg-red-500' },
  { label: 'Google Calendar', icon: 'calendar_month', iconClass: 'text-purple-600' },
];

// Iconos que se pintan dentro de la tarjeta (no los datos de texto como precio o profesional)
const legendIndicators = AGENDA_INDICATORS.filter((item) => !item.fullCardOnly);

const timezones = [
  { value: 'Europe/Madrid', label: 'Europe/Madrid' },
  { value: 'Atlantic/Canary', label: 'Atlantic/Canary' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City' },
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
];

export function AgendaFooter({ 
  timezone, 
  onTimezoneChange,
  showGoogleEvents = true,
  onShowGoogleEventsChange,
  visibleIndicators,
  onIndicatorChange,
  onResetIndicators,
}: AgendaFooterProps) {
  const activeLegendIndicators = visibleIndicators
    ? legendIndicators.filter((item) => visibleIndicators[item.key])
    : [];

  return (
    <div className="flex flex-wrap items-center justify-end gap-4 rounded-lg border bg-card p-3 text-sm sm:justify-between">
      {/* Color Legend (desktop only) */}
      <div className="hidden flex-wrap items-center gap-x-4 gap-y-2 sm:flex">
        {statusLegend.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            {item.icon ? (
              <Icon name={item.icon} className={cn("h-3.5 w-3.5", item.iconClass)} />
            ) : (
              <span className={cn("h-3 w-3 rounded-full", item.colorClass)} />
            )}
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
        {activeLegendIndicators.map((item) => (
          <div key={item.key} className="flex items-center gap-1.5">
            <Icon name={item.icon} className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4">
        {/* Indicator picker: which icons each user wants on the appointment cards */}
        {visibleIndicators && onIndicatorChange && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground">
                <Icon name="tune" className="h-3.5 w-3.5" />
                Iconos
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-3">
              <div className="mb-2">
                <p className="text-sm font-medium">Iconos en las citas</p>
                <p className="text-xs text-muted-foreground">
                  Elige qué ves en las tarjetas. Se guarda en tu perfil.
                </p>
              </div>
              <div className="space-y-1">
                {AGENDA_INDICATORS.map((item) => {
                  const id = `agenda-indicator-${item.key}`;
                  return (
                    <label
                      key={item.key}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-accent"
                    >
                      <Checkbox
                        id={id}
                        checked={visibleIndicators[item.key]}
                        onCheckedChange={(checked) => onIndicatorChange(item.key, checked === true)}
                      />
                      <Icon name={item.icon} className="h-4 w-4 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight">{item.label}</span>
                        <span className="block text-xs leading-tight text-muted-foreground">
                          {item.description}
                          {item.fullCardOnly && ' · vistas Día y Lista'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {onResetIndicators && (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto px-1.5 text-xs"
                  onClick={onResetIndicators}
                >
                  Restablecer
                </Button>
              )}
            </PopoverContent>
          </Popover>
        )}

        {/* Google Calendar Toggle */}
        {onShowGoogleEventsChange && (
          <div className="flex items-center gap-2">
            <Switch
              id="show-google"
              checked={showGoogleEvents}
              onCheckedChange={onShowGoogleEventsChange}
              className="data-[state=checked]:bg-purple-600"
            />
            <Label htmlFor="show-google" className="text-muted-foreground cursor-pointer">
              Google Calendar
            </Label>
          </div>
        )}

        {/* Timezone Selector */}
        <Select value={timezone} onValueChange={onTimezoneChange}>
          <SelectTrigger className="h-8 w-auto gap-1.5 border-none bg-transparent px-2 shadow-none hover:bg-accent">
            <Icon name="public" className="h-3.5 w-3.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timezones.map((tz) => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
