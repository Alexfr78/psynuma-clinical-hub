import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BDI2Option {
  value: number;
  text: string;
}

interface BDI2ItemRendererProps {
  item: {
    index: number;
    label: string;
    options: BDI2Option[];
  };
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function BDI2ItemRenderer({ item, value, onChange, disabled }: BDI2ItemRendererProps) {
  return (
    <div className="space-y-3">
      <p className="font-medium text-base">
        <span className="text-muted-foreground mr-2">{item.index}.</span>
        {item.label}
      </p>
      <RadioGroup
        value={value?.toString()}
        onValueChange={(v) => onChange(parseInt(v, 10))}
        disabled={disabled}
        className="space-y-2"
      >
        {item.options.map((option) => (
          <div
            key={option.value}
            className={cn(
              'flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer',
              value === option.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => !disabled && onChange(option.value)}
          >
            <RadioGroupItem
              value={option.value.toString()}
              id={`item-${item.index}-${option.value}`}
              className="mt-0.5 shrink-0"
            />
            <Label
              htmlFor={`item-${item.index}-${option.value}`}
              className="text-sm leading-relaxed cursor-pointer font-normal"
            >
              {option.text}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
