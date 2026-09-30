import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';

/** Botón de la cabecera que oculta/muestra los datos de los pacientes en la agenda. */
export function PrivacyModeButton() {
  const { isPrivate, toggle } = usePrivacyMode();
  const label = isPrivate ? 'Mostrar datos de pacientes' : 'Ocultar datos de pacientes';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isPrivate ? 'default' : 'outline'}
            size="sm"
            className={cn('shrink-0', !isPrivate && 'text-muted-foreground')}
            onClick={toggle}
            aria-pressed={isPrivate}
            aria-label={label}
          >
            <Icon name={isPrivate ? 'visibility_off' : 'visibility'} className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{isPrivate ? 'Modo privado' : 'Ocultar datos'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
