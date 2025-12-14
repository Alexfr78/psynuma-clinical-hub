import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { TemplateVariables, TEMPLATE_VARIABLES } from './TemplateVariables';
import { Eye, Code } from 'lucide-react';

interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function TemplateEditor({ value, onChange }: TemplateEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const insertVariable = (variable: string) => {
    onChange(value + variable);
  };

  const renderPreview = () => {
    let preview = value;
    // Replace variables with example values
    const exampleValues: Record<string, string> = {
      '{nombre_paciente}': 'María',
      '{apellidos_paciente}': 'García López',
      '{dni_paciente}': '12345678A',
      '{fecha_nacimiento}': '15/03/1990',
      '{nombre_tutor}': 'Juan García',
      '{relacion_tutor}': 'Padre',
      '{nombre_profesional}': 'Dr. López',
      '{especialidad}': 'Psicología Clínica',
      '{nombre_centro}': 'Centro Psycma',
      '{direccion_centro}': 'C/ Gran Vía 123, Madrid',
      '{fecha_actual}': new Date().toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    };

    Object.entries(exampleValues).forEach(([key, val]) => {
      preview = preview.replace(new RegExp(key, 'g'), `<mark class="bg-primary/20 px-1 rounded">${val}</mark>`);
    });

    return preview;
  };

  return (
    <div className="space-y-4">
      <TemplateVariables onInsert={insertVariable} />
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
        <TabsList>
          <TabsTrigger value="edit" className="gap-2">
            <Code className="h-4 w-4" />
            Editor
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-2">
            <Eye className="h-4 w-4" />
            Vista previa
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-4">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-[400px] font-mono text-sm"
            placeholder="Escribe el contenido del consentimiento aquí..."
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Puedes usar HTML básico (h1, h2, p, strong, em, ul, ol, li) y las variables dinámicas.
          </p>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card className="min-h-[400px] overflow-auto p-6">
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: renderPreview() }}
            />
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">
            Los valores resaltados son ejemplos de cómo se verán las variables al generar el documento.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
