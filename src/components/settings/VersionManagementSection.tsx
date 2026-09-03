import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppVersions, type AppVersion, type AppChangeLog } from '@/hooks/useAppVersions';
import { useCenter } from '@/hooks/useCenter';
import { CreateChangeDialog } from './versions/CreateChangeDialog';
import { type ChangeFormValues } from './versions/CreateChangeDialog';
import { CreateVersionDialog } from './versions/CreateVersionDialog';
import { type VersionFormValues } from './versions/CreateVersionDialog';
import { VersionDetailSheet } from './versions/VersionDetailSheet';
import { VerifactuSyncDialog } from './versions/VerifactuSyncDialog';
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

const statusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Borrador', variant: 'secondary' },
  published: { label: 'Publicada', variant: 'default' },
  archived: { label: 'Archivada', variant: 'outline' },
};

export function VersionManagementSection() {
  const {
    versions, pendingChanges, currentVersion, isLoading,
    createChange, updateChange, archiveChange, createVersion,
    publishVersion, setAsCurrent, syncWithVerifactu, archiveVersion,
    getVersionChanges,
  } = useAppVersions();
  const { center } = useCenter();

  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [editingChange, setEditingChange] = useState<AppChangeLog | null>(null);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [detailVersion, setDetailVersion] = useState<AppVersion | null>(null);
  const [syncVersion, setSyncVersion] = useState<AppVersion | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const toggleChange = (id: string) => {
    setSelectedChangeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedChangeIds.length === pendingChanges.length) {
      setSelectedChangeIds([]);
    } else {
      setSelectedChangeIds(pendingChanges.map((c) => c.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Block A - Current Version */}
      <Card>
        <CardHeader className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Icon name="package_2" className="h-5 w-5 text-primary shrink-0" />
            <CardTitle className="text-base sm:text-lg">Versión Actual</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {currentVersion ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xl sm:text-2xl font-bold">{currentVersion.version_code}</span>
                  {currentVersion.version_name && (
                    <span className="text-muted-foreground text-sm sm:text-base">— {currentVersion.version_name}</span>
                  )}
                  <Badge className="bg-green-600">Actual</Badge>
                </div>
                {currentVersion.description && (
                  <p className="text-sm text-muted-foreground break-words">{currentVersion.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {currentVersion.published_at && (
                    <span>Publicada: {format(new Date(currentVersion.published_at), 'dd MMM yyyy', { locale: es })}</span>
                  )}
                  {currentVersion.applies_to_verifactu && (
                    <span className="flex items-center gap-1">
                      <Icon name="shield" className="h-3 w-3" />
                      VeriFactu:
                      {currentVersion.verifactu_synced_at ? (
                        <span className="text-green-600 font-medium">Sincronizada</span>
                      ) : (
                        <span className="text-orange-500 font-medium">Pendiente</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetailVersion(currentVersion)}>
                <Icon name="visibility" className="mr-2 h-4 w-4" />
                Ver detalle
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="package_2" className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No hay versión activa. Crea y publica una versión para comenzar.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block B - Pending Changes */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Icon name="account_tree" className="h-5 w-5 text-primary shrink-0" />
                <CardTitle className="text-base sm:text-lg">Cambios Pendientes</CardTitle>
              </div>
              <CardDescription className="mt-1">Cambios registrados que aún no se han incluido en una versión</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedChangeIds.length === 0}
                onClick={() => setVersionDialogOpen(true)}
              >
                <Icon name="package_2" className="mr-2 h-4 w-4" />
                Crear versión ({selectedChangeIds.length})
              </Button>
              <Button size="sm" onClick={() => { setEditingChange(null); setChangeDialogOpen(true); }}>
                <Icon name="add" className="mr-2 h-4 w-4" />
                Añadir cambio
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pendingChanges.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No hay cambios pendientes
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {pendingChanges.map((change) => {
                  const typeBadge = changeTypeBadge[change.change_type] || changeTypeBadge.technical;
                  return (
                    <div key={change.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={selectedChangeIds.includes(change.id)}
                            onCheckedChange={() => toggleChange(change.id)}
                          />
                          <span className="font-medium text-sm truncate">{change.title}</span>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                              <Icon name="more_horiz" className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditingChange(change); setChangeDialogOpen(true); }}>
                              <Icon name="edit" className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => archiveChange.mutate(change.id)}>
                              <Icon name="archive" className="mr-2 h-4 w-4" /> Archivar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(change.created_at), 'dd/MM/yy')}
                        </span>
                        <span className="text-xs capitalize text-muted-foreground">{change.module}</span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.className}`}>
                          {typeBadge.label}
                        </span>
                        {change.affects_verifactu && <Icon name="shield" className="h-3.5 w-3.5 text-orange-500" />}
                      </div>
                      {change.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{change.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedChangeIds.length === pendingChanges.length && pendingChanges.length > 0}
                          onCheckedChange={toggleAll}
                        />
                      </TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Módulo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead className="hidden md:table-cell">Descripción</TableHead>
                      <TableHead className="w-10">VF</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingChanges.map((change) => {
                      const typeBadge = changeTypeBadge[change.change_type] || changeTypeBadge.technical;
                      return (
                        <TableRow key={change.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedChangeIds.includes(change.id)}
                              onCheckedChange={() => toggleChange(change.id)}
                            />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(change.created_at), 'dd/MM/yy')}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{change.module}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.className}`}>
                              {typeBadge.label}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium text-sm max-w-[200px] truncate">{change.title}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                            {change.description || '—'}
                          </TableCell>
                          <TableCell>
                            {change.affects_verifactu && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <Icon name="shield" className="h-4 w-4 text-orange-500" />
                                  </TooltipTrigger>
                                  <TooltipContent>Afecta VeriFactu</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Icon name="more_horiz" className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditingChange(change); setChangeDialogOpen(true); }}>
                                  <Icon name="edit" className="mr-2 h-4 w-4" /> Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => archiveChange.mutate(change.id)}>
                                  <Icon name="archive" className="mr-2 h-4 w-4" /> Archivar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Block C - Version History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Icon name="account_tree" className="h-5 w-5 text-primary" />
            <CardTitle>Historial de Versiones</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              No hay versiones registradas
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {versions.map((v) => {
                  const sBadge = statusBadge[v.status] || statusBadge.draft;
                  return (
                    <div
                      key={v.id}
                      className="border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setDetailVersion(v)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-medium">{v.version_code}</span>
                          <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                          {v.is_current && <Badge className="bg-green-600 text-xs">Actual</Badge>}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Icon name="more_horiz" className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailVersion(v)}>
                              <Icon name="visibility" className="mr-2 h-4 w-4" /> Ver detalle
                            </DropdownMenuItem>
                            {v.status === 'draft' && (
                              <DropdownMenuItem onClick={() => publishVersion.mutate(v.id)}>
                                <Icon name="check_circle" className="mr-2 h-4 w-4" /> Publicar
                              </DropdownMenuItem>
                            )}
                            {v.status === 'published' && !v.is_current && (
                              <DropdownMenuItem onClick={() => setAsCurrent.mutate(v.id)}>
                                <Icon name="package_2" className="mr-2 h-4 w-4" /> Marcar como actual
                              </DropdownMenuItem>
                            )}
                            {v.status !== 'archived' && !v.is_current && (
                              <DropdownMenuItem onClick={() => archiveVersion.mutate(v.id)}>
                                <Icon name="archive" className="mr-2 h-4 w-4" /> Archivar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {v.version_name && <span>{v.version_name}</span>}
                        <span>{format(new Date(v.created_at), 'dd/MM/yy')}</span>
                        {v.applies_to_verifactu && (
                          v.verifactu_synced_at
                            ? <Icon name="check_circle" className="h-3.5 w-3.5 text-green-600" />
                            : <Icon name="warning" className="h-3.5 w-3.5 text-orange-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Versión</TableHead>
                      <TableHead className="hidden md:table-cell">Nombre</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden md:table-cell">Cambios</TableHead>
                      <TableHead className="w-10">VF</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {versions.map((v) => {
                      const sBadge = statusBadge[v.status] || statusBadge.draft;
                      return (
                        <TableRow key={v.id}>
                          <TableCell className="font-mono font-medium">
                            {v.version_code}
                            {v.is_current && (
                              <Badge className="ml-2 bg-green-600 text-xs">Actual</Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {v.version_name || '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(v.created_at), 'dd/MM/yy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">
                            {v.change_count}
                          </TableCell>
                          <TableCell>
                            {v.applies_to_verifactu && (
                              v.verifactu_synced_at ? (
                                <Icon name="check_circle" className="h-4 w-4 text-green-600" />
                              ) : (
                                <Icon name="warning" className="h-4 w-4 text-orange-500" />
                              )
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Icon name="more_horiz" className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailVersion(v)}>
                                  <Icon name="visibility" className="mr-2 h-4 w-4" /> Ver detalle
                                </DropdownMenuItem>
                                {v.status === 'draft' && (
                                  <DropdownMenuItem onClick={() => publishVersion.mutate(v.id)}>
                                    <Icon name="check_circle" className="mr-2 h-4 w-4" /> Publicar
                                  </DropdownMenuItem>
                                )}
                                {v.status === 'published' && !v.is_current && (
                                  <DropdownMenuItem onClick={() => setAsCurrent.mutate(v.id)}>
                                    <Icon name="package_2" className="mr-2 h-4 w-4" /> Marcar como actual
                                  </DropdownMenuItem>
                                )}
                                {(v.status === 'published' || v.is_current) && v.applies_to_verifactu && !v.verifactu_synced_at && center?.is_software_provider && (
                                  <DropdownMenuItem onClick={() => setSyncVersion(v)}>
                                    <Icon name="shield" className="mr-2 h-4 w-4" /> Sincronizar con VeriFactu
                                  </DropdownMenuItem>
                                )}
                                {v.status !== 'archived' && !v.is_current && (
                                  <DropdownMenuItem onClick={() => archiveVersion.mutate(v.id)}>
                                    <Icon name="archive" className="mr-2 h-4 w-4" /> Archivar
                                  </DropdownMenuItem>
                                )}
                                {v.is_current && v.status !== 'archived' && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DropdownMenuItem disabled>
                                          <Icon name="archive" className="mr-2 h-4 w-4" /> Archivar
                                        </DropdownMenuItem>
                                      </TooltipTrigger>
                                      <TooltipContent>No puedes archivar la versión activa</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateChangeDialog
        open={changeDialogOpen}
        onOpenChange={setChangeDialogOpen}
        editingChange={editingChange}
        onSave={(data: ChangeFormValues) => {
          if (editingChange) {
            updateChange.mutate({ id: editingChange.id, ...data });
          } else {
            createChange.mutate(data);
          }
          setChangeDialogOpen(false);
          setEditingChange(null);
        }}
      />

      <CreateVersionDialog
        open={versionDialogOpen}
        onOpenChange={setVersionDialogOpen}
        selectedChanges={pendingChanges.filter((c) => selectedChangeIds.includes(c.id))}
        onSave={(data: VersionFormValues) => {
          createVersion.mutate({ ...data, changeIds: selectedChangeIds });
          setVersionDialogOpen(false);
          setSelectedChangeIds([]);
        }}
      />

      {detailVersion && (
        <VersionDetailSheet
          version={detailVersion}
          open={!!detailVersion}
          onOpenChange={(open) => { if (!open) setDetailVersion(null); }}
          getVersionChanges={getVersionChanges}
          onPublish={(id) => publishVersion.mutate(id)}
          onSetCurrent={(id) => setAsCurrent.mutate(id)}
          onSyncVerifactu={(v) => setSyncVersion(v)}
          onArchive={(id) => archiveVersion.mutate(id)}
        />
      )}

      {syncVersion && (
        <VerifactuSyncDialog
          open={!!syncVersion}
          onOpenChange={(open) => { if (!open) setSyncVersion(null); }}
          versionCode={syncVersion.version_code}
          onConfirm={() => {
            syncWithVerifactu.mutate({ id: syncVersion.id, versionCode: syncVersion.version_code });
            setSyncVersion(null);
          }}
        />
      )}
    </div>
  );
}
