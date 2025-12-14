import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Variable } from 'lucide-react';
import { useState } from 'react';

export const TEMPLATE_VARIABLES = [
  { key: '{nombre_paciente}', label: 'Nombre del paciente', category: 'paciente' },
  { key: '{apellidos_paciente}', label: 'Apellidos del paciente', category: 'paciente' },
  { key: '{dni_paciente}', label: 'DNI del paciente', category: 'paciente' },
  { key: '{fecha_nacimiento}', label: 'Fecha de nacimiento', category: 'paciente' },
  { key: '{nombre_tutor}', label: 'Nombre del tutor (menores)', category: 'tutor' },
  { key: '{relacion_tutor}', label: 'Relación con el menor', category: 'tutor' },
  { key: '{nombre_profesional}', label: 'Nombre del profesional', category: 'profesional' },
  { key: '{especialidad}', label: 'Especialidad', category: 'profesional' },
  { key: '{nombre_centro}', label: 'Nombre del centro', category: 'centro' },
  { key: '{direccion_centro}', label: 'Dirección del centro', category: 'centro' },
  { key: '{fecha_actual}', label: 'Fecha de generación', category: 'otros' },
];

interface TemplateVariablesProps {
  onInsert: (variable: string) => void;
}

export function TemplateVariables({ onInsert }: TemplateVariablesProps) {
  const [isOpen, setIsOpen] = useState(false);

  const categories = [
    { id: 'paciente', label: 'Paciente' },
    { id: 'tutor', label: 'Tutor' },
    { id: 'profesional', label: 'Profesional' },
    { id: 'centro', label: 'Centro' },
    { id: 'otros', label: 'Otros' },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variables dinámicas
          </span>
          <ChevronDown
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
