import { useState } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { useAppVersions, useMyChangeRequests, type AppChangeLog } from '@/hooks/useAppVersions';
import { CreateChangeDialog, type ChangeFormValues } from './CreateChangeDialog';

const requestStatus: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  pending: { label: 'Pendiente', variant: 'secondary' },
  included: { label: 'Incluida en una versión', variant: 'default' },
  archived: { label: 'Descartada', variant: 'outline' },
};

/** Lo que ve en Sistema quien no es el dueño de la plataforma: sus propias peticiones de cambio. */
export function ChangeRequestsSection() {
  const { requests, isLoading } = useMyChangeRequests();
  const { createChange, updateChange, archiveChange } = useAppVersions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppChangeLog | null>(null);

  const save = ({ title, description, module, change_type }: ChangeFormValues) => {
    const data = { title, description: description || undefined, module, change_type };
    if (editing) {
      updateChange.mutate({ id: editing.id, ...data });
    } else {
      createChange.mutate({ ...data, affects_verifactu: false });
    }
    setDialogOpen(false);
    setEditing(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Icon name="lightbulb" className="h-5 w-5 text-primary shrink-0" />
              <CardTitle className="text-base sm:text-lg">Peticiones de cambio</CardTitle>
            </div>
            <CardDescription className="mt-1">
              Propón mejoras o avisa de errores. Cuando se incluyan en una versión lo verás en Novedades.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Icon name="add" className="mr-2 h-4 w-4" />
            Nueva petición
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Icon name="progress_activity" className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Aún no has enviado ninguna petición</div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => {
              const st = requestStatus[r.status] || requestStatus.pending;
              const editable = r.status === 'pending' && !r.version_id;
              return (
                <div key={r.id} className="space-y-1.5 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-medium">{r.title}</span>
                    <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
                  </div>
                  {r.description && <p className="whitespace-pre-line text-xs text-muted-foreground">{r.description}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{format(new Date(r.created_at), 'dd/MM/yy')}</span>
                    <span className="capitalize">{r.module}</span>
                    {editable && (
                      <span className="ml-auto flex gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setEditing(r); setDialogOpen(true); }}>
                          <Icon name="edit" className="mr-1 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => archiveChange.mutate(r.id)}>
                          <Icon name="delete" className="mr-1 h-3.5 w-3.5" /> Retirar
                        </Button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CreateChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingChange={editing}
        onSave={save}
        mode="request"
      />
    </Card>
  );
}
