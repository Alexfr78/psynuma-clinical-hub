import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface ExampleInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  itemIndex: number;
}

export function ExampleInput({
  value,
  onChange,
  disabled = false,
  itemIndex,
}: ExampleInputProps) {
  const hasExample = value.trim().length > 0;

  return (
    <div className="mt-4 pt-4 border-t border-dashed animate-in slide-in-from-top-2 duration-200">
      <Label 
        htmlFor={`example-${itemIndex}`}
        className="text-sm text-muted-foreground mb-2 block"
      >
        Por favor, describe un ejemplo concreto de cuándo te ha ocurrido esto:
      </Label>
      <Textarea
        id={`example-${itemIndex}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Describe una situación específica en la que hayas experimentado esto..."
        className={cn(
          "min-h-[80px] resize-none transition-colors",
          hasExample && "border-primary/30 bg-primary/5"
        )}
        rows={3}
      />
      <p className="text-xs text-muted-foreground mt-1">
        {hasExample ? (
          <span className="text-primary">✓ Ejemplo proporcionado</span>
        ) : (
          <span>Opcional pero recomendado para un análisis más profundo</span>
        )}
      </p>
    </div>
  );
}
