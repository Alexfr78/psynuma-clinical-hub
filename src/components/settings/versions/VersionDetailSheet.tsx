import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { AppVersion, AppChangeLog } from '@/hooks/useAppVersions';
import { Icon } from '@/components/ui/icon';

const changeTypeBadge: Record<string, { label: string; className: string }> = {
  feature: { label: 'Feature', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  improvement: { label: 'Mejora', className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
  fix: { label: 'Fix', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  technical: { label: 'Técnico', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  legal: { label: 'Legal', className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  security: { label: 'Seguridad', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  ui: { label: 'UI', className: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
};

interface Props {
  version: AppVersion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getVersionChanges: (id: string) => Promise<AppChangeLog[]>;
  onPublish: (id: string) => void;
  onSetCurrent: (id: string) => void;
  onSyncVerifactu: (v: AppVersion) => void;
  onArchive: (id: string) => void;
}

export function VersionDetailSheet({
  version, open, onOpenChange, getVersionChanges,
  onPublish, onSetCurrent, onSyncVerifactu, onArchive,
}: Props) {
  const [changes, setChanges] = useState<AppChangeLog[]>([]);

  useEffect(() => {
    if (open && version.id) {
      getVersionChanges(version.id).then(setChanges);
    }
  }, [open, version.id, getVersionChanges]);

  // Group changes by type
  const grouped = changes.reduce((acc, c) => {
    if (!acc[c.change_type]) acc[c.change_type] = [];
    acc[c.change_type].push(c);
    return acc;
  }, {} as Record<string, AppChangeLog[]>);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="font-mono">{version.version_code}</span>
            {version.version_name && <span className="text-muted-foreground font-normal">— {version.version_name}</span>}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={version.status === 'published' ? 'default' : version.status === 'draft' ? 'secondary' : 'outline'}>
                {version.status === 'draft' ? 'Borrador' : version.status === 'published' ? 'Publicada' : 'Archivada'}
              </Badge>
              {version.is_current && <Badge className="bg-green-600">Actual</Badge>}
            </div>

            {version.description && (
              <p className="text-sm text-muted-foreground">{version.description}</p>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">Creada:</span>{' '}
                {format(new Date(version.created_at), 'dd MMM yyyy', { locale: es })}
              </div>
              {version.published_at && (
                <div>
                  <span className="text-muted-foreground">Publicada:</span>{' '}
                  {format(new Date(version.published_at), 'dd MMM yyyy', { locale: es })}
                </div>
              )}
            </div>

            {version.applies_to_verifactu && (
              <div className="flex items-center gap-2 text-sm">
                <Icon name="shield" className="h-4 w-4" />
                <span>VeriFactu:</span>
                {version.verifactu_synced_at ? (
                  <span className="text-green-600 font-medium">
                    Sincronizada {format(new Date(version.verifactu_synced_at), 'dd MMM yyyy HH:mm', { locale: es })}
                  </span>
                ) : (
                  <span className="text-orange-500 font-medium">Pendiente de sincronización</span>
                )}
              </div>
            )}

            {/* Hash chain info */}
            <div className="text-xs text-muted-foreground">
              ID: <span className="font-mono">{version.id}</span>
            </div>
          </div>

          <Separator />

          {/* Changes */}
          <div className="space-y-4">
            <h4 className="font-medium">Cambios incluidos ({changes.length})</h4>
            {Object.entries(grouped).map(([type, items]) => {
              const badge = changeTypeBadge[type] || changeTypeBadge.technical;
              return (
                <div key={type} className="space-y-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label} ({items.length})
                  </span>
                  <ul className="ml-4 space-y-1">
                    {items.map((c) => (
                      <li key={c.id} className="text-sm flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                        <div>
                          <span className="font-medium">{c.title}</span>
                          {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {changes.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay cambios incluidos en esta versión</p>
            )}
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Acciones</h4>
            <div className="flex flex-wrap gap-2">
              {version.status === 'draft' && (
                <Button size="sm" onClick={() => { onPublish(version.id); onOpenChange(false); }}>
                  <Icon name="check_circle" className="mr-2 h-4 w-4" />
                  Publicar versión
                </Button>
              )}
              {version.status === 'published' && !version.is_current && (
                <Button size="sm" onClick={() => { onSetCurrent(version.id); onOpenChange(false); }}>
                  <Icon name="package_2" className="mr-2 h-4 w-4" />
                  Marcar como actual
                </Button>
              )}
              {(version.status === 'published' || version.is_current) && version.applies_to_verifactu && !version.verifactu_synced_at && (
                <Button size="sm" variant="outline" onClick={() => { onSyncVerifactu(version); onOpenChange(false); }}>
                  <Icon name="shield" className="mr-2 h-4 w-4" />
                  Sincronizar con VeriFactu
                </Button>
              )}
              {version.status !== 'archived' && !version.is_current && (
                <Button size="sm" variant="outline" onClick={() => { onArchive(version.id); onOpenChange(false); }}>
                  <Icon name="archive" className="mr-2 h-4 w-4" />
                  Archivar
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
