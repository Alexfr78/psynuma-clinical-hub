import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useConsentTemplates } from '@/hooks/useConsentTemplates';
import { ConsentTemplateCard } from '@/components/consents/ConsentTemplateCard';
import { CreateTemplateDialog } from '@/components/consents/CreateTemplateDialog';
import { Icon } from '@/components/ui/icon';

export function ConsentTemplatesSection() {
  const { templates, isLoading } = useConsentTemplates();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Plantillas de consentimiento</CardTitle>
          <CardDescription>
            Crea y edita las plantillas de consentimiento informado del centro
          </CardDescription>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          <Icon name="add" className="mr-2 h-4 w-4" />
          Nueva plantilla
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
              <Icon name="description" className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No hay plantillas</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Crea tu primera plantilla de consentimiento informado
            </p>
            <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
              <Icon name="add" className="mr-2 h-4 w-4" />
              Crear plantilla
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <ConsentTemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}
      </CardContent>

      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </Card>
  );
}
