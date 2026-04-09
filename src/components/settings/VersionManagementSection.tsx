import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  GitBranch, Plus, Package, CheckCircle2, AlertTriangle,
  Archive, Eye, MoreHorizontal, Shield, Pencil, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAppVersions, type AppVersion, type AppChangeLog } from '@/hooks/useAppVersions';
import { CreateChangeDialog } from './versions/CreateChangeDialog';
import { type ChangeFormValues } from './versions/CreateChangeDialog';
import { CreateVersionDialog } from './versions/CreateVersionDialog';
import { type VersionFormValues } from './versions/CreateVersionDialog';
import { VersionDetailSheet } from './versions/VersionDetailSheet';
import { VerifactuSyncDialog } from './versions/VerifactuSyncDialog';

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

  const [selectedChangeIds, setSelectedChangeIds] = useState<string[]>([]);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [editingChange, setEditingChange] = useState<AppChangeLog | null>(null);
  const [versionDialogOpen, setVersionDialogOpen] = useState(false);
  const [detailVersion, setDetailVersion] = useState<AppVersion | null>(null);
  const [syncVersion, setSyncVersion] = useState<AppVersion | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle>Versión Actual</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {currentVersion ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{currentVersion.version_code}</span>
                  {currentVersion.version_name && (
                    <span className="text-muted-foreground">— {currentVersion.version_name}</span>
                  )}
                  <Badge className="bg-green-600">Actual</Badge>
                </div>
                {currentVersion.description && (
                  <p className="text-sm text-muted-foreground">{currentVersion.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {currentVersion.published_at && (
                    <span>Publicada: {format(new Date(currentVersion.published_at), 'dd MMM yyyy', { locale: es })}</span>
                  )}
                  {currentVersion.applies_to_verifactu && (
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
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
                <Eye className="mr-2 h-4 w-4" />
                Ver detalle
              </Button>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No hay versión activa. Crea y publica una versión para comenzar.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block B - Pending Changes */}
      <Card>
        <CardHeader>
          <div className="space-y-4 sm:space-y-0">
            <div>
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-primary" />
                <CardTitle>Cambios Pendientes</CardTitle>
              </div>
              <CardDescription>Cambios registrados que aún no se han incluido en una versión</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={selectedChangeIds.length === 0}
                onClick={() => setVersionDialogOpen(true)}
                className="w-full sm:w-auto"
              >
                <Package className="mr-2 h-4 w-4" />
                Crear versión ({selectedChangeIds.length})
              </Button>
              <Button size="sm" onClick={() => { setEditingChange(null); setChangeDialogOpen(true); }} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
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
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
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
                                    <Shield className="h-4 w-4 text-orange-500" />
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
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditingChange(change); setChangeDialogOpen(true); }}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => archiveChange.mutate(change.id)}>
                                  <Archive className="mr-2 h-4 w-4" />
                                  Archivar
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

              {/* Mobile Cards */}
              <div className="sm:hidden space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b">
                  <Checkbox
                    checked={selectedChangeIds.length === pendingChanges.length && pendingChanges.length > 0}
                    onCheckedChange={toggleAll}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    {selectedChangeIds.length === 0 ? 'Seleccionar todos' : `${selectedChangeIds.length} seleccionados`}
                  </span>
                </div>
                {pendingChanges.map((change) => {
                  const typeBadge = changeTypeBadge[change.change_type] || changeTypeBadge.technical;
                  return (
                    <div key={change.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedChangeIds.includes(change.id)}
                          onCheckedChange={() => toggleChange(change.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{change.title}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {format(new Date(change.created_at), 'dd/MM/yy')}
                              </p>
                            </div>
                            {change.affects_verifactu && (
                              <Shield className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadge.className}`}>
                              {typeBadge.label}
                            </span>
                            <span className="text-xs text-muted-foreground capitalize bg-muted px-2 py-0.5 rounded">
                              {change.module}
                            </span>
                          </div>
                          {change.description && (
                            <p className="text-xs text-muted-foreground">{change.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-xs"
                          onClick={() => { setEditingChange(change); setChangeDialogOpen(true); }}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => archiveChange.mutate(change.id)}
                        >
                          <Archive className="h-3 w-3 mr-1" />
                          Archivar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Block C - Version History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
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
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
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
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                              )
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailVersion(v)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Ver detalle
                                </DropdownMenuItem>
                                {v.status === 'draft' && (
                                  <DropdownMenuItem onClick={() => publishVersion.mutate(v.id)}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Publicar
                                  </DropdownMenuItem>
                                )}
                                {v.status === 'published' && !v.is_current && (
                                  <DropdownMenuItem onClick={() => setAsCurrent.mutate(v.id)}>
                                    <Package className="mr-2 h-4 w-4" />
                                    Marcar como actual
                                  </DropdownMenuItem>
                                )}
                                {(v.status === 'published' || v.is_current) && v.applies_to_verifactu && !v.verifactu_synced_at && (
                                  <DropdownMenuItem onClick={() => setSyncVersion(v)}>
                                    <Shield className="mr-2 h-4 w-4" />
                                    Sincronizar con VeriFactu
                                  </DropdownMenuItem>
                                )}
                                {v.status !== 'archived' && !v.is_current && (
                                  <DropdownMenuItem onClick={() => archiveVersion.mutate(v.id)}>
                                    <Archive className="mr-2 h-4 w-4" />
                                    Archivar
                                  </DropdownMenuItem>
                                )}
                                {v.is_current && v.status !== 'archived' && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <DropdownMenuItem disabled>
                                          <Archive className="mr-2 h-4 w-4" />
                                          Archivar
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

              {/* Mobile Cards */}
              <div className="sm:hidden space-y-3">
                {versions.map((v) => {
                  const sBadge = statusBadge[v.status] || statusBadge.draft;
                  return (
                    <div key={v.id} className="border rounded-lg p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-lg">{v.version_code}</span>
                            {v.is_current && (
                              <Badge className="bg-green-600 text-xs">Actual</Badge>
                            )}
                          </div>
                          {v.version_name && (
                            <p className="text-xs text-muted-foreground mt-1">{v.version_name}</p>
                          )}
                        </div>
                        {v.applies_to_verifactu && (
                          v.verifactu_synced_at ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
                          )
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-2">
                          <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {v.change_count} cambios
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(v.created_at), 'dd/MM/yy')}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="flex-1 text-xs"
                          onClick={() => setDetailVersion(v)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Detalle
                        </Button>
                        {v.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 text-xs"
                            onClick={() => publishVersion.mutate(v.id)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Publicar
                          </Button>
                        )}
                        {v.status === 'published' && !v.is_current && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 text-xs"
                            onClick={() => setAsCurrent.mutate(v.id)}
                          >
                            <Package className="h-3 w-3 mr-1" />
                            Actual
                          </Button>
                        )}
                        {(v.status === 'published' || v.is_current) && v.applies_to_verifactu && !v.verifactu_synced_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 text-xs"
                            onClick={() => setSyncVersion(v)}
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            Sync
                          </Button>
                        )}
                        {v.status !== 'archived' && !v.is_current && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="flex-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => archiveVersion.mutate(v.id)}
                          >
                            <Archive className="h-3 w-3 mr-1" />
                            Archivar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
          createVersion.mutate({ ...data, changeIds: selectedChangeIds } as any);
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
