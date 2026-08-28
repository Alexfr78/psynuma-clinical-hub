import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';


interface TrueFalseButtonsProps {
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
  trueLabel?: string;
  falseLabel?: string;
}

export function TrueFalseButtons({
  value,
  onChange,
  disabled = false,
  trueLabel = 'Verdadero',
  falseLabel = 'Falso',
}: TrueFalseButtonsProps) {
  return (
    <div className="flex gap-3 justify-center">
      <Button
        type="button"
        variant={value === 0 ? 'default' : 'outline'}
        onClick={() => onChange(0)}
        disabled={disabled}
        className={`flex-1 max-w-[150px] gap-2 ${
          value === 0 
            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
            : 'hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-blue-950'
        }`}
      >
        <Icon name="close" className="h-4 w-4" />
        {falseLabel}
      </Button>
      <Button
        type="button"
        variant={value === 1 ? 'default' : 'outline'}
        onClick={() => onChange(1)}
        disabled={disabled}
        className={`flex-1 max-w-[150px] gap-2 ${
          value === 1 
            ? 'bg-green-600 hover:bg-green-700 text-white' 
            : 'hover:bg-green-50 hover:border-green-300 dark:hover:bg-green-950'
        }`}
      >
        <Icon name="check" className="h-4 w-4" />
        {trueLabel}
      </Button>
    </div>
  );
}
