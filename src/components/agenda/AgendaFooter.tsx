import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

interface AgendaFooterProps {
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
  showGoogleEvents?: boolean;
  onShowGoogleEventsChange?: (show: boolean) => void;
}

const statusLegend = [
  { label: 'Pendiente', colorClass: 'bg-slate-400' },
  { label: 'Programada', colorClass: 'bg-blue-500' },
  { label: 'Pagada', colorClass: 'bg-green-500' },
  { label: 'Pendiente de pago', colorClass: 'bg-orange-500' },
  { label: 'Cancelada', colorClass: 'bg-red-500' },
  { label: 'Confirmada', icon: 'check_circle', iconClass: 'text-blue-600' },
  { label: 'Google Calendar', icon: 'calendar_month', iconClass: 'text-purple-600' },
];

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
}: AgendaFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card p-3 text-sm">
      {/* Color Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
      </div>

      <div className="flex items-center gap-4">
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
