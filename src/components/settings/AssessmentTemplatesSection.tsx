import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAssessmentTemplates } from '@/hooks/useAssessmentTemplates';
import { AddTemplateDialog } from '@/components/assessments/AddTemplateDialog';
import { Icon } from '@/components/ui/icon';

export function AssessmentTemplatesSection() {
  const { templates, isLoading } = useAssessmentTemplates();
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Plantillas de evaluación</CardTitle>
          <CardDescription>
            Añade los tipos de evaluación psicológica disponibles para tu centro
          </CardDescription>
        </div>
        <Button onClick={() => setAddTemplateOpen(true)} size="sm">
          <Icon name="add" className="mr-2 h-4 w-4" />
          Añadir plantilla
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <div className="rounded-full bg-muted p-4">
              <Icon name="assignment_turned_in" className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No hay plantillas</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Añade tu primera plantilla de evaluación (BDI-II, PAI, EMO...)
            </p>
            <Button className="mt-4" onClick={() => setAddTemplateOpen(true)}>
              <Icon name="add" className="mr-2 h-4 w-4" />
              Añadir plantilla
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{template.name}</p>
                  {template.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{template.description}</p>
                  )}
                </div>
                <Badge variant="secondary" className="shrink-0">{template.code}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddTemplateDialog open={addTemplateOpen} onOpenChange={setAddTemplateOpen} />
    </Card>
  );
}
