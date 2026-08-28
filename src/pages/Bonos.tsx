import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useBonos, useBonoTemplates, BonoWithPatient } from '@/hooks/useBonos';
import { usePatients } from '@/hooks/usePatients';
import { BonoCard } from '@/components/bonos/BonoCard';
import { CreateBonoDialog } from '@/components/bonos/CreateBonoDialog';
import { BonoTemplatesDialog } from '@/components/bonos/BonoTemplatesDialog';
import { BonoDetailDialog } from '@/components/bonos/BonoDetailDialog';
import { Icon } from '@/components/ui/icon';

export default function Bonos() {
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [selectedBono, setSelectedBono] = useState<BonoWithPatient | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | undefined>();
  const [selectedPatientName, setSelectedPatientName] = useState<string>('');
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchValue, setPatientSearchValue] = useState('');
  const [applyTemplateId, setApplyTemplateId] = useState<string | undefined>();

  const { data: searchPatients, isLoading: patientsLoading } = usePatients({ search: patientSearchValue });
  const { data: templates } = useBonoTemplates();

  const { data: bonos, isLoading } = useBonos({
    status: selectedPatientId ? (statusFilter === 'all' ? undefined : statusFilter) : (statusFilter === 'all' ? undefined : statusFilter),
    patientId: selectedPatientId,
  });

  const handleSelectPatient = (patientId: string, name: string) => {
    setSelectedPatientId(patientId);
    setSelectedPatientName(name);
    setStatusFilter('all');
    setPatientSearchOpen(false);
    setPatientSearchValue('');
  };

  const handleClearPatient = () => {
    setSelectedPatientId(undefined);
    setSelectedPatientName('');
    setStatusFilter('active');
  };

  const activeBonos = bonos?.filter(b => b.status === 'active') || [];
  const now = new Date();
  const stats = {
    active: activeBonos.length,
    exhausted: bonos?.filter(b => b.status === 'exhausted').length || 0,
    expired: bonos?.filter(b => b.status === 'expired').length || 0,
    cancelled: bonos?.filter(b => b.status === 'cancelled').length || 0,
    pendingSessions: activeBonos.reduce((sum, b) => sum + (b.total_sessions - b.used_sessions), 0),
    monthlyRevenue: (bonos || [])
      .filter(b => {
        const created = new Date(b.created_at);
        return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
      })
      .reduce((sum, b) => sum + Number(b.total_price), 0),
  };

  const handleBonoClick = (bono: BonoWithPatient) => {
    setSelectedBono(bono);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold">Bonos</h1>
          <p className="text-muted-foreground">Gestiona los paquetes de sesiones</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setTemplatesOpen(true)}
          >
            <Icon name="settings" className="h-4 w-4 mr-2" />
            Plantillas
          </Button>
          <Button size="sm" className="w-full sm:w-auto" onClick={() => setCreateOpen(true)}>
            <Icon name="add" className="h-4 w-4 mr-2" />
            Nuevo bono
          </Button>
        </div>
      </div>

      {/* Patient filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={patientSearchOpen}
              className="w-full sm:w-[300px] justify-between"
            >
              {selectedPatientId ? (
                <div className="flex items-center gap-2">
                  <Icon name="person" className="h-4 w-4 text-primary" />
                  <span className="truncate">{selectedPatientName}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon name="person" className="h-4 w-4" />
                  <span>Filtrar por contacto...</span>
                </div>
              )}
              <Icon name="unfold_more" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0 z-[9999]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Buscar por nombre..."
                value={patientSearchValue}
                onValueChange={setPatientSearchValue}
              />
              <CommandList>
                <CommandEmpty>
                  {patientsLoading ? 'Buscando...' : 'No se encontraron contactos.'}
                </CommandEmpty>
                <CommandGroup>
                  {searchPatients?.map((patient) => (
                    <CommandItem
                      key={patient.id}
                      value={patient.id}
                      onSelect={() => handleSelectPatient(patient.id, `${patient.first_name} ${patient.last_name}`)}
                      className="flex items-center gap-2 py-2"
                    >
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon name="person" className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <span className="truncate">{patient.first_name} {patient.last_name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedPatientId && (
          <Button variant="ghost" size="sm" onClick={handleClearPatient} className="gap-1">
            <Icon name="close" className="h-4 w-4" />
            Limpiar
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Bonos Activos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon name="confirmation_number" className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold sm:text-3xl">{stats.active}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Sesiones Pendientes</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning">
              <Icon name="pending_actions" className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold sm:text-3xl">{stats.pendingSessions}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Ingresos (Mes)</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
              <Icon name="euro" className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold sm:text-3xl">{stats.monthlyRevenue.toFixed(2)}€</p>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Activos</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold text-primary">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Agotados</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{stats.exhausted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Expirados</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{stats.expired}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Cancelados</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <p className="text-lg sm:text-2xl font-bold">{stats.cancelled}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <div className="absolute right-0 top-0 bottom-0 w-3 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 sm:hidden" />
          <TabsList className="w-full sm:w-auto justify-start overflow-x-auto flex-nowrap gap-1">
            <TabsTrigger value="active" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Activos</TabsTrigger>
            <TabsTrigger value="exhausted" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Agotados</TabsTrigger>
            <TabsTrigger value="expired" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Expirados</TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Cancelados</TabsTrigger>
            <TabsTrigger value="all" className="text-xs sm:text-sm px-3 py-2 min-h-[40px]">Todos</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value={statusFilter} className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : !bonos || bonos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
              <Icon name="package_2" className="h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold">Sin bonos</h3>
              <p className="text-sm text-muted-foreground">No hay bonos en esta categoría</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {bonos.map(bono => (
                <BonoCard 
                  key={bono.id} 
                  bono={bono} 
                  onClick={() => handleBonoClick(bono)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Plantillas de Bonos */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        <div className="flex items-center justify-between border-b bg-muted/30 p-4 sm:p-6">
          <div>
            <h3 className="text-lg font-semibold">Plantillas de Bonos</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Crea nuevos bonos rápidamente usando estas configuraciones.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
            Gestionar plantillas
          </Button>
        </div>
        {!templates || templates.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Sin plantillas todavía
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Nombre</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Sesiones</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Validez</th>
                  <th className="px-4 py-3 text-sm font-medium text-muted-foreground">Importe</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map((template) => (
                  <tr key={template.id} className="group h-14 transition-colors hover:bg-muted/50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2 font-medium">
                        <Icon name="auto_awesome" className="h-4 w-4 text-primary" />
                        {template.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{template.total_sessions}</td>
                    <td className="px-4 py-2">
                      {template.validity_days ? `${Math.round(template.validity_days / 30)} meses` : 'Sin caducidad'}
                    </td>
                    <td className="px-4 py-2 tabular-nums">{Number(template.total_price).toFixed(2)}€</td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          setApplyTemplateId(template.id);
                          setCreateOpen(true);
                        }}
                      >
                        Aplicar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateBonoDialog
        open={createOpen}
        onOpenChange={(v) => {
          setCreateOpen(v);
          if (!v) setApplyTemplateId(undefined);
        }}
        preselectedTemplateId={applyTemplateId}
      />
      <BonoTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      <BonoDetailDialog
        bono={selectedBono}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
