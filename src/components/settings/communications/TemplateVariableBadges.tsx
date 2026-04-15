import { Badge } from '@/components/ui/badge';
import { TEMPLATE_VARIABLES } from '@/hooks/useCommunicationTemplates';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface VariableDef {
  key: string;
  label: string;
  example: string;
}

interface TemplateVariableBadgesProps {
  onVariableClick?: (variable: string) => void;
  showAll?: boolean;
  variables?: VariableDef[];
}

export function TemplateVariableBadges({ onVariableClick, showAll = false, variables }: TemplateVariableBadgesProps) {
  const source = variables ?? TEMPLATE_VARIABLES;
  const displayVariables = showAll || variables ? source : source.slice(0, 8);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Variables disponibles (haz clic para insertar):
      </p>
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {displayVariables.map((variable) => (
            <Tooltip key={variable.key}>
              <TooltipTrigger asChild>
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => onVariableClick?.(variable.key)}
                >
                  {variable.key}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{variable.label}</p>
                <p className="text-xs text-muted-foreground">Ej: {variable.example}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
