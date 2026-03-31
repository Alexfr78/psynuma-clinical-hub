import { cn } from '@/lib/utils';
import type { EmotionOption } from '@/hooks/useAutoregistroTemplates';
import { SmilePlus } from 'lucide-react';

interface EmotionCardsFieldProps {
  options: EmotionOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  allowDeselect?: boolean;
}

export function EmotionCardsField({ options, value, onChange, allowDeselect }: EmotionCardsFieldProps) {
  const resolveValue = (opt: EmotionOption) => opt.value?.trim() || opt.label;

  const handleClick = (opt: EmotionOption) => {
    const optValue = resolveValue(opt);
    if (value === optValue && allowDeselect) {
      onChange(undefined);
    } else {
      onChange(optValue);
    }
  };

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {options.map((opt) => {
        const optValue = resolveValue(opt);
        const isSelected = value === optValue;

        return (
          <button
            key={optValue}
            type="button"
            onClick={() => handleClick(opt)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-all cursor-pointer',
              'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20'
                : 'border-border bg-card hover:border-muted-foreground/40'
            )}
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-md overflow-hidden flex items-center justify-center bg-muted/30">
              {opt.imageUrl ? (
                <img
                  src={opt.imageUrl}
                  alt={opt.label}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              <div className={cn('flex items-center justify-center', opt.imageUrl ? 'hidden' : '')}>
                <SmilePlus className="h-8 w-8 text-muted-foreground/50" />
              </div>
            </div>
            <span className={cn(
              'text-xs text-center font-medium leading-tight line-clamp-2',
              isSelected ? 'text-primary' : 'text-foreground'
            )}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
