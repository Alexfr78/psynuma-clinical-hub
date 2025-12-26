import { cn } from '@/lib/utils';

interface LikertScaleProps {
  value: number | undefined;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
  disabled?: boolean;
}

export function LikertScale({
  value,
  onChange,
  min = 1,
  max = 7,
  minLabel = 'Nada de acuerdo',
  maxLabel = 'Totalmente de acuerdo',
  disabled = false,
}: LikertScaleProps) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-1 sm:gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option)}
            className={cn(
              'flex-1 h-10 sm:h-12 rounded-lg border-2 font-medium text-sm sm:text-base transition-all',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              value === option
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:border-primary/50 hover:bg-accent',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground px-1">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}
