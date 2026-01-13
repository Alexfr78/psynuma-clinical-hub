import { cn } from '@/lib/utils';

interface LikertScaleProps {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  disabled?: boolean;
  step?: number;
  showPercentage?: boolean;
}

export function LikertScale({
  value,
  onChange,
  min = 1,
  max = 7,
  minLabel = 'Nada de acuerdo',
  maxLabel = 'Totalmente de acuerdo',
  disabled = false,
  step = 1,
  showPercentage = false,
}: LikertScaleProps) {
  const options = Array.from(
    { length: Math.floor((max - min) / step) + 1 },
    (_, i) => min + i * step
  );

  // For percentage scales with many options (like DES 0-100 with step 10), use a different layout
  const isWideScale = options.length > 7;

  return (
    <div className="space-y-3">
      <div className={cn(
        "flex items-center gap-1",
        isWideScale ? "flex-wrap justify-center" : "justify-between gap-1.5 sm:gap-2"
      )}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg border-2 font-medium transition-all touch-manipulation',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              'active:scale-95',
              value === option
                ? 'bg-primary text-primary-foreground border-primary shadow-md'
                : 'bg-background border-border hover:border-primary/50 hover:bg-accent',
              disabled && 'opacity-50 cursor-not-allowed',
              isWideScale
                ? 'min-h-[44px] min-w-[52px] px-2 text-sm'
                : 'flex-1 min-h-[48px] sm:min-h-[52px] min-w-[40px] text-sm sm:text-base'
            )}
          >
            {showPercentage ? `${option}%` : option}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] sm:text-xs text-muted-foreground px-0.5">
        <span className="max-w-[45%] text-left">{minLabel}</span>
        <span className="max-w-[45%] text-right">{maxLabel}</span>
      </div>
    </div>
  );
}
