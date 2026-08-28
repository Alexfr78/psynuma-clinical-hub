import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAutoregistroTemplates, type AutoregistroTemplate } from '@/hooks/useAutoregistroTemplates';
import { TemplateCard } from '@/components/autoregistros/TemplateCard';
import { CreateTemplateDialog } from '@/components/autoregistros/CreateTemplateDialog';
import { EditTemplateDialog } from '@/components/autoregistros/EditTemplateDialog';
import { Icon } from '@/components/ui/icon';

export function AutoregistroTemplatesSection() {
  const { data: templates, isLoading, deleteTemplate } = useAutoregistroTemplates();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutoregistroTemplate | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Plantillas de autorregistro</CardTitle>
          <CardDescription>
            Crea y edita los formularios de autorregistro emocional del centro
          </CardDescription>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Icon name="add" className="mr-2 h-4 w-4" />
          Nueva plantilla
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : templates && templates.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onDelete={(id) => deleteTemplate.mutate(id)}
                onEdit={(tmpl) => setEditingTemplate(tmpl)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
            <div className="rounded-full bg-muted p-4">
              <Icon name="edit_note" className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 font-semibold">No hay plantillas</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Crea tu primera plantilla de autorregistro
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Icon name="add" className="mr-2 h-4 w-4" />
              Crear plantilla
            </Button>
          </div>
        )}
      </CardContent>

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {editingTemplate && (
        <EditTemplateDialog
          open={true}
          onOpenChange={(v) => !v && setEditingTemplate(null)}
          template={editingTemplate}
        />
      )}
    </Card>
  );
}
