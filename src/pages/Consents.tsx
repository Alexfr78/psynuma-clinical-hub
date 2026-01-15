import { useState } from 'react';
import { Plus, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConsentTemplates } from '@/hooks/useConsentTemplates';
import { ConsentTemplateCard } from '@/components/consents/ConsentTemplateCard';
import { CreateTemplateDialog } from '@/components/consents/CreateTemplateDialog';

export default function Consents() {
  const { templates, isLoading } = useConsentTemplates();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">
            <span className="hidden sm:inline">Plantillas de Consentimiento</span>
            <span className="sm:hidden">Consentimientos</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Gestiona las plantillas de consentimiento informado</span>
            <span className="sm:hidden">Plantillas de consentimiento</span>
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} size="sm" className="w-full sm:w-auto sm:size-default">
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nueva plantilla</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 font-semibold">No hay plantillas</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Crea tu primera plantilla de consentimiento informado
          </p>
          <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
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

      {/* Create Dialog */}
      <CreateTemplateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
}
