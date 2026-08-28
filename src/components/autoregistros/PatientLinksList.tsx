import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAutoregistroLinks } from '@/hooks/useAutoregistroLinks';
import { SendAutoregistroDialog } from './SendAutoregistroDialog';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import { Icon } from '@/components/ui/icon';

interface PatientLinksListProps {
  patientId: string;
  entries: AutoregistroEntry[];
}

export function PatientLinksList({ patientId, entries }: PatientLinksListProps) {
  const { data: links, deactivateLink, deleteLink } = useAutoregistroLinks({ patientId });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const countByLink = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.link_id, (m.get(e.link_id) ?? 0) + 1);
    return m;
  }, [entries]);

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/registro/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Enlace copiado');
  };

  const isExpired = (expiresAt: string | null) =>
    !!expiresAt && new Date(expiresAt) < new Date();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-muted-foreground">
          {links?.length ?? 0} enlace(s) enviado(s)
        </h4>
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Icon name="send" className="h-4 w-4 mr-2" /> Nuevo envío
        </Button>
      </div>

      {!links || links.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No se ha enviado ningún autorregistro a este contacto.
        </p>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {links.map((link) => {
              const expired = link.status !== 'active' || isExpired(link.expires_at);
              return (
                <div key={link.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{link.template?.name ?? 'Plantilla'}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(link.created_at), "dd MMM yyyy", { locale: es })}
                      </p>
                    </div>
                    <Badge variant={expired ? 'secondary' : 'default'}>
                      {expired ? 'Expirado' : 'Activo'}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Respuestas</span>
                    <span className="font-medium">{countByLink.get(link.id) ?? 0}</span>
                  </div>
                  {link.expires_at && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Expira</span>
                      <span>{format(new Date(link.expires_at), 'dd MMM yyyy', { locale: es })}</span>
                    </div>
                  )}
                  <div className="flex gap-1 pt-2">
                    <Button size="sm" variant="outline" onClick={() => copyLink(link.access_token)}>
                      <Icon name="content_copy" className="h-3.5 w-3.5" />
                    </Button>
                    {!expired && (
                      <Button size="sm" variant="outline" onClick={() => deactivateLink.mutate(link.id)}>
                        <Icon name="link_off" className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteId(link.id)}>
                      <Icon name="delete" className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plantilla</TableHead>
                  <TableHead>Enviado</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Respuestas</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => {
                  const expired = link.status !== 'active' || isExpired(link.expires_at);
                  return (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.template?.name ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(link.created_at), "dd MMM yyyy", { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {link.expires_at ? format(new Date(link.expires_at), 'dd MMM yyyy', { locale: es }) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={expired ? 'secondary' : 'default'}>
                          {expired ? 'Expirado' : 'Activo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {countByLink.get(link.id) ?? 0}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" title="Copiar enlace" onClick={() => copyLink(link.access_token)}>
                            <Icon name="content_copy" className="h-4 w-4" />
                          </Button>
                          {!expired && (
                            <Button size="sm" variant="ghost" title="Desactivar" onClick={() => deactivateLink.mutate(link.id)}>
                              <Icon name="link_off" className="h-4 w-4" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" title="Eliminar" onClick={() => setDeleteId(link.id)}>
                            <Icon name="delete" className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <SendAutoregistroDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        preselectedPatientId={patientId}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar envío?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el enlace. Las respuestas ya recibidas se mantendrán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deleteLink.mutate(deleteId);
                setDeleteId(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
