import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { TEMPLATE_VARIABLES } from './template-variables-data';

interface TemplateVariablesProps {
  onInsert: (variable: string) => void;
}

export function TemplateVariables({ onInsert }: TemplateVariablesProps) {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [
    { id: 'paciente', label: 'Contacto' },
    { id: 'tutor', label: 'Tutor' },
    { id: 'profesional', label: 'Profesional' },
    { id: 'centro', label: 'Centro' },
    { id: 'otros', label: 'Otros' },
    { id: 'formulario', label: 'Formulario' },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Icon name="functions" className="h-4 w-4" />
            Variables dinámicas
          </span>
          <Icon name="expand_more"
            className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {categories.map((category) => {
          const variables = TEMPLATE_VARIABLES.filter(
            (v) => v.category === category.id
          );
          if (variables.length === 0) return null;
          
          return (
            <div key={category.id}>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {category.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <Badge
                    key={variable.key}
                    variant="secondary"
                    className="cursor-pointer transition-colors hover:bg-primary hover:text-primary-foreground"
                    onClick={() => onInsert(variable.key)}
                  >
                    {variable.key}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Haz clic en una variable para insertarla en el editor.
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
