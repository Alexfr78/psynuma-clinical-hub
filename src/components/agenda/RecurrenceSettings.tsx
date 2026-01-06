import { useState, useEffect } from 'react';
import { format, addDays, addMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { RefreshCw, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  RecurrenceConfig,
  RecurrenceFrequency,
  RecurrenceEndType,
  WEEKDAYS,
  getWeekdayLabel,
  generateRecurrenceOccurrences,
  calculateOccurrenceCount,
  hasMonthlyDateWarning,
  getMonthlyWarning,
} from '@/lib/recurrence-utils';

interface RecurrenceSettingsProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  config: RecurrenceConfig;
  onConfigChange: (config: RecurrenceConfig) => void;
  startDate: Date;
  startTime: string;
}

export function RecurrenceSettings({
  enabled,
  onEnabledChange,
  config,
  onConfigChange,
  startDate,
  startTime,
}: RecurrenceSettingsProps) {
  const [previewExpanded, setPreviewExpanded] = useState(false);

  // Calculate preview data
  const fullStartDate = new Date(startDate);
  const [hours, minutes] = startTime.split(':').map(Number);
  fullStartDate.setHours(hours || 9, minutes || 0, 0, 0);

  const preview = calculateOccurrenceCount(config, fullStartDate, 50, 365);
  const previewOccurrences = generateRecurrenceOccurrences(config, fullStartDate, 5, 365);
  const monthlyWarning = config.freq === 'MONTHLY' ? getMonthlyWarning(fullStartDate) : null;

  const handleFrequencyChange = (freq: RecurrenceFrequency) => {
    const newConfig = { ...config, freq };
    
    // Set default weekday based on start date if switching to weekly
    if (freq === 'WEEKLY' && (!config.byweekday || config.byweekday.length === 0)) {
      const dayIndex = fullStartDate.getDay();
      const dayCode = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][dayIndex];
      newConfig.byweekday = [dayCode];
    }
    
    onConfigChange(newConfig);
  };

  const handleIntervalChange = (value: string) => {
    const interval = parseInt(value, 10);
    if (interval >= 1 && interval <= 99) {
      onConfigChange({ ...config, interval });
    }
  };

  const handleWeekdayToggle = (days: string[]) => {
    if (days.length > 0) {
      onConfigChange({ ...config, byweekday: days });
    }
  };

  const handleEndTypeChange = (endType: RecurrenceEndType) => {
    const newConfig = { ...config, end_type: endType };
    if (endType === 'count' && !config.count) {
      newConfig.count = 10;
    }
    if (endType === 'until_date' && !config.until_date) {
      const defaultEnd = addMonths(fullStartDate, 3);
      newConfig.until_date = format(defaultEnd, 'yyyy-MM-dd');
    }
    onConfigChange(newConfig);
  };

  const handleCountChange = (value: string) => {
    const count = parseInt(value, 10);
    if (count >= 1 && count <= 50) {
      onConfigChange({ ...config, count });
    }
  };

  const handleUntilDateChange = (date: Date | undefined) => {
    if (date) {
      onConfigChange({ ...config, until_date: format(date, 'yyyy-MM-dd') });
    }
  };

  return (
    <div className="space-y-4">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="recurrence-toggle" className="font-medium">
            Repetir
          </Label>
        </div>
        <Switch
          id="recurrence-toggle"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>

      {enabled && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <Select
              value={config.freq}
              onValueChange={(v) => handleFrequencyChange(v as RecurrenceFrequency)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY">Diaria</SelectItem>
                <SelectItem value="WEEKLY">Semanal</SelectItem>
                <SelectItem value="MONTHLY">Mensual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Interval */}
          <div className="space-y-2">
            <Label>Cada</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={99}
                value={config.interval}
                onChange={(e) => handleIntervalChange(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">
                {config.freq === 'DAILY' && (config.interval === 1 ? 'día' : 'días')}
                {config.freq === 'WEEKLY' && (config.interval === 1 ? 'semana' : 'semanas')}
                {config.freq === 'MONTHLY' && (config.interval === 1 ? 'mes' : 'meses')}
              </span>
            </div>
          </div>

          {/* Weekdays (for weekly) */}
          {config.freq === 'WEEKLY' && (
            <div className="space-y-2">
              <Label>Días de la semana</Label>
              <ToggleGroup
                type="multiple"
                value={config.byweekday || []}
                onValueChange={handleWeekdayToggle}
                className="justify-start"
              >
                {WEEKDAYS.map((day) => (
                  <ToggleGroupItem
                    key={day}
                    value={day}
                    aria-label={day}
                    className="w-9 h-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {getWeekdayLabel(day)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {/* Monthly Warning */}
          {monthlyWarning && (
            <Alert variant="default" className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                {monthlyWarning}
              </AlertDescription>
            </Alert>
          )}

          {/* End Type */}
          <div className="space-y-3">
            <Label>Termina</Label>
            <RadioGroup
              value={config.end_type}
              onValueChange={(v) => handleEndTypeChange(v as RecurrenceEndType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="count" id="end-count" />
                <Label htmlFor="end-count" className="font-normal flex items-center gap-2">
                  Después de
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={config.count || 10}
                    onChange={(e) => handleCountChange(e.target.value)}
                    className="w-16 h-8"
                    disabled={config.end_type !== 'count'}
                  />
                  ocurrencias
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <RadioGroupItem value="until_date" id="end-date" />
                <Label htmlFor="end-date" className="font-normal flex items-center gap-2">
                  Hasta el
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={config.end_type !== 'until_date'}
                        className={cn(
                          'w-[140px] justify-start text-left font-normal',
                          !config.until_date && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {config.until_date
                          ? format(new Date(config.until_date), 'dd/MM/yyyy')
                          : 'Seleccionar'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={config.until_date ? new Date(config.until_date) : undefined}
                        onSelect={handleUntilDateChange}
                        disabled={(date) => date < fullStartDate}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Preview */}
          {preview.count > 0 && (
            <div className="rounded-md bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-medium text-primary">
                Se crearán {preview.count} citas
                {preview.endDate && (
                  <>
                    {' '}desde el {format(fullStartDate, "d 'de' MMMM", { locale: es })} hasta el{' '}
                    {format(preview.endDate, "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </>
                )}
              </p>
              
              {previewOccurrences.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded(!previewExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {previewExpanded ? 'Ocultar fechas' : 'Ver primeras fechas'}
                  </button>
                  
                  {previewExpanded && (
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {previewOccurrences.map((date, idx) => (
                        <li key={idx}>
                          {format(date, "EEEE d 'de' MMMM, HH:mm", { locale: es })}
                        </li>
                      ))}
                      {preview.count > 5 && (
                        <li className="italic">... y {preview.count - 5} más</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const defaultRecurrenceConfig: RecurrenceConfig = {
  freq: 'WEEKLY',
  interval: 1,
  byweekday: [],
  end_type: 'count',
  count: 10,
};
