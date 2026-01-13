import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface PercentageSliderProps {
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
  minLabel?: string;
  maxLabel?: string;
}

const MARKS = [0, 25, 50, 75, 100];

export function PercentageSlider({
  value,
  onChange,
  disabled = false,
  minLabel = 'Nunca (0%)',
  maxLabel = 'Siempre (100%)',
}: PercentageSliderProps) {
  const currentValue = value ?? 0;
  const hasValue = value !== undefined;

  return (
    <div className="space-y-4">
      {/* Main value display */}
      <div className="flex items-center justify-center">
        <div 
          className={cn(
            "text-5xl font-bold transition-colors",
            hasValue ? "text-primary" : "text-muted-foreground/50"
          )}
        >
          {currentValue}%
        </div>
      </div>

      {/* Slider */}
      <div className="px-2">
        <Slider
          value={[currentValue]}
          onValueChange={([val]) => onChange(val)}
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          className="touch-pan-y"
        />
      </div>

      {/* Marks */}
      <div className="flex justify-between px-2 text-xs text-muted-foreground">
        {MARKS.map((mark) => (
          <button
            key={mark}
            type="button"
            onClick={() => !disabled && onChange(mark)}
            className={cn(
              "px-2 py-1 rounded transition-colors hover:bg-muted",
              currentValue === mark && "bg-primary/10 text-primary font-medium",
              disabled && "pointer-events-none"
            )}
          >
            {mark}%
          </button>
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{minLabel}</span>
        <span className="text-muted-foreground">{maxLabel}</span>
      </div>
    </div>
  );
}
