import { useState } from 'react';
import { FileText, Edit2, Trash2, MoreVertical, Copy, Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ConsentTemplate, useConsentTemplates } from '@/hooks/useConsentTemplates';
import { CreateTemplateDialog } from './CreateTemplateDialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ConsentTemplateCardProps {
  template: ConsentTemplate;
}

export function ConsentTemplateCard({ template }: ConsentTemplateCardProps) {
  const { deleteTemplate, createTemplate } = useConsentTemplates();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleDuplicate = () => {
    createTemplate.mutate({
      name: `${template.name} (copia)`,
      content_html: template.content_html,
      requires_guardian_signature: template.requires_guardian_signature,
      is_active: true,
    });
  };

  const handleDelete = () => {
    deleteTemplate.mutate(template.id);
    setDeleteDialogOpen(false);
  };

  return (
    <>
      <Card className="group transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold">{template.name}</h3>
              <p className="text-xs text-muted-foreground">
                {format(new Date(template.created_at), "d MMM yyyy", { locale: es })}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant={template.is_active ? 'default' : 'secondary'}>
              {template.is_active ? 'Activa' : 'Inactiva'}
            </Badge>
            {template.requires_guardian_signature && (
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                Requiere tutor
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <CreateTemplateDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        template={template}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plantilla?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Los consentimientos existentes
              basados en esta plantilla no se verán afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
