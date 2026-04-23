import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Send, Trash2, Search, GitCompare, Download } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoregistroTemplates, type AutoregistroTemplate } from '@/hooks/useAutoregistroTemplates';
import { useAutoregistroLinks } from '@/hooks/useAutoregistroLinks';
import { useAutoregistroEntries, useDeleteAutoregistroEntries } from '@/hooks/useAutoregistroEntries';
import { usePatients } from '@/hooks/usePatients';
import { useAuth } from '@/hooks/useAuth';
import { useAutoregistroColumnConfig } from '@/hooks/useAutoregistroColumnConfig';
import { TemplateCard } from '@/components/autoregistros/TemplateCard';
import { EditTemplateDialog } from '@/components/autoregistros/EditTemplateDialog';
import { CreateTemplateDialog } from '@/components/autoregistros/CreateTemplateDialog';
import { SendAutoregistroDialog } from '@/components/autoregistros/SendAutoregistroDialog';
import { LinkCard } from '@/components/autoregistros/LinkCard';
import { ActivityFeed } from '@/components/autoregistros/ActivityFeed';
import { ClinicalSummaryHeader } from '@/components/autoregistros/registros/ClinicalSummaryHeader';
import { ClinicalTable } from '@/components/autoregistros/registros/ClinicalTable';
import { MobileEntryCards } from '@/components/autoregistros/registros/MobileEntryCards';
import { ColumnSelector } from '@/components/autoregistros/registros/ColumnSelector';
import { EntryDetailDrawer } from '@/components/autoregistros/registros/EntryDetailDrawer';
import { CompareRegistrosDialog } from '@/components/autoregistros/registros/CompareRegistrosDialog';
import { ConfigurableCharts } from '@/components/autoregistros/registros/ConfigurableCharts';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';
import {
  buildFieldDisplayMetas,
  getVisibleFields,
  detectClinicalAlerts,
} from '@/lib/autoregistro-field-display';

const tabOptions = [
  { value: 'templates', label: 'Plantillas' },
  { value: 'links', label: 'Envíos' },
  { value: 'activity', label: 'Actividad' },
  { value: 'entries', label: 'Registros' },
];

export default function Autoregistros() {
  const [tab, setTab] = useState('templates');
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutoregistroTemplate | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AutoregistroEntry | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Registros tab state — unit of work = patient + template
  const [filterPatientId, setFilterPatientId] = useState<string>('');
  const [filterTemplateId, setFilterTemplateId] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { profile } = useAuth();
  const { data: templates, isLoading: loadingTemplates, deleteTemplate } = useAutoregistroTemplates();
  const { data: links, isLoading: loadingLinks, deactivateLink, deleteLink } = useAutoregistroLinks();
  const { data: patients } = usePatients();
  const deleteEntries = useDeleteAutoregistroEntries();
  const { data: entries, isLoading: loadingEntries } = useAutoregistroEntries({
    patientId: filterPatientId || undefined,
    templateId: filterTemplateId || undefined,
  });

  const selectedPatient = patients?.find((p) => p.id === filterPatientId);
  const selectedTemplate = templates?.find((t) => t.id === filterTemplateId);
  const patientTemplateSelected = !!filterPatientId && !!filterTemplateId;

  // Build field display metas from selected template (single source of truth)
  const fieldMetas = useMemo(() => {
    if (!selectedTemplate) return [];
    const fields = normalizeAutoregistroFields(selectedTemplate.fields ?? []);
    return buildFieldDisplayMetas(fields);
  }, [selectedTemplate]);

  // Column visibility config, persisted per therapist + patient + template
  const {
    visibleLabels,
    toggleColumn,
    resetConfig,
    hasCustomConfig,
  } = useAutoregistroColumnConfig(profile?.id, filterPatientId, filterTemplateId);

  const visibleFieldMetas = useMemo(
    () => getVisibleFields(fieldMetas, visibleLabels),
    [fieldMetas, visibleLabels],
  );
  const visibleLabelSet = useMemo(
    () => new Set(visibleFieldMetas.map((m) => m.field.label)),
    [visibleFieldMetas],
  );

  // Filtered entries (date range + free text search)
  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const q = searchText.trim().toLowerCase();

    return entries.filter((e) => {
      const ts = new Date(e.submitted_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (q) {
        const haystack = Object.values(e.values ?? {}).map(String).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [entries, dateFrom, dateTo, searchText]);

  // Clinical alerts derived from entries + field metas
  const clinicalAlerts = useMemo(
    () => (patientTemplateSelected ? detectClinicalAlerts(filteredEntries, fieldMetas) : []),
    [filteredEntries, fieldMetas, patientTemplateSelected],
  );

  const selectedEntries = useMemo(
    () => filteredEntries.filter((e) => selectedIds.has(e.id)),
    [filteredEntries, selectedIds],
  );

  const toggleSelectEntry = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEntries = (selected: boolean) => {
    if (selected) setSelectedIds(new Set(filteredEntries.map((e) => e.id)));
    else setSelectedIds(new Set());
  };

  const exportSelectedAsCsv = () => {
    const rows = selectedEntries.length > 0 ? selectedEntries : filteredEntries;
    if (rows.length === 0) return;
    const header = ['Fecha', ...fieldMetas.map((m) => m.field.label)];
    const csv = [
      header.join(','),
      ...rows.map((e) => {
        const cells = [
          new Date(e.submitted_at).toISOString(),
          ...fieldMetas.map((m) => {
            const v = e.values[m.field.label];
            if (v === undefined || v === null) return '';
            const str = String(v).replace(/"/g, '""');
            return /[",\n]/.test(str) ? `"${str}"` : str;
          }),
        ];
        return cells.join(',');
      }),
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `registros-${selectedPatient?.first_name ?? 'paciente'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold">Autorregistros</h1>
          <p className="text-sm text-muted-foreground">Gestiona plantillas, envíos y registros de pacientes</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Plantilla
          </Button>
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Enviar
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Mobile select */}
        <div className="sm:hidden mb-4">
          <Select value={tab} onValueChange={setTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop tabs */}
        <TabsList className="hidden sm:flex mb-4">
          {tabOptions.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="templates">
          {loadingTemplates ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : templates && templates.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <TemplateCard key={t.id} template={t} onDelete={(id) => deleteTemplate.mutate(id)} onEdit={(tmpl) => setEditingTemplate(tmpl)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No hay plantillas creadas</p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Crear plantilla
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="links">
          {loadingLinks ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : links && links.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {links.map((l) => (
                <LinkCard key={l.id} link={l} onDeactivate={(id) => deactivateLink.mutate(id)} onDelete={(id) => deleteLink.mutate(id)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No hay envíos</p>
              <Button onClick={() => setSendOpen(true)}>
                <Send className="h-4 w-4 mr-2" /> Enviar autorregistro
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity">
          <ActivityFeed
            onOpenFullRegistro={(entry) => {
              setFilterPatientId(entry.patient_id);
              setFilterTemplateId(entry.template_id);
              setSelectedIds(new Set());
              setTab('entries');
            }}
          />
        </TabsContent>

        <TabsContent value="entries" className="space-y-4">
          {/* Patient + template selectors — unit of work */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={filterPatientId} onValueChange={(v) => {
              setFilterPatientId(v);
              setFilterTemplateId('');
              setSelectedIds(new Set());
            }}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selecciona un paciente" />
              </SelectTrigger>
              <SelectContent>
                {patients?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterTemplateId}
              onValueChange={(v) => {
                setFilterTemplateId(v);
                setSelectedIds(new Set());
              }}
              disabled={!filterPatientId}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Selecciona una plantilla" />
              </SelectTrigger>
              <SelectContent>
                {templates?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!patientTemplateSelected ? (
            <div className="text-center py-16 border border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">
                Selecciona un paciente y una plantilla para visualizar los registros.
              </p>
            </div>
          ) : loadingEntries ? (
            <p className="text-sm text-muted-foreground">Cargando registros...</p>
          ) : !entries || entries.length === 0 ? (
            <div className="text-center py-16 border border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">
                No hay registros para este paciente en la plantilla seleccionada.
              </p>
            </div>
          ) : (
            <>
              {/* Clinical summary header */}
              <ClinicalSummaryHeader
                patientName={`${selectedPatient?.first_name ?? ''} ${selectedPatient?.last_name ?? ''}`.trim()}
                templateName={selectedTemplate?.name ?? ''}
                entries={filteredEntries}
                alerts={clinicalAlerts}
                dateRange={{
                  from: dateFrom ? new Date(dateFrom) : null,
                  to: dateTo ? new Date(dateTo) : null,
                }}
              />

              {/* Filters toolbar */}
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col sm:flex-row gap-2 flex-1 min-w-0">
                  <div className="relative flex-1 min-w-0 max-w-xs">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Buscar en registros..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-9 text-sm w-auto"
                      aria-label="Desde"
                    />
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-9 text-sm w-auto"
                      aria-label="Hasta"
                    />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <ColumnSelector
                    allFields={fieldMetas}
                    visibleLabels={visibleLabelSet}
                    onToggle={toggleColumn}
                    onReset={resetConfig}
                    hasCustomConfig={hasCustomConfig}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={selectedIds.size < 2}
                    onClick={() => setCompareOpen(true)}
                  >
                    <GitCompare className="h-4 w-4" />
                    <span className="hidden sm:inline">Comparar</span>
                    {selectedIds.size >= 2 && (
                      <span className="text-xs">({selectedIds.size})</span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={exportSelectedAsCsv}
                    disabled={filteredEntries.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Exportar</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Borrar todos</span>
                  </Button>
                </div>
              </div>

              {/* Charts */}
              {filteredEntries.length > 0 && (
                <ConfigurableCharts entries={filteredEntries} fieldMetas={fieldMetas} />
              )}

              {/* Table (desktop) / Cards (mobile) */}
              {filteredEntries.length === 0 ? (
                <div className="text-center py-12 border border-dashed rounded-lg">
                  <p className="text-muted-foreground text-sm">
                    Ningún registro coincide con los filtros actuales.
                  </p>
                </div>
              ) : (
                <>
                  <div className="hidden sm:block">
                    <ClinicalTable
                      entries={filteredEntries}
                      visibleFields={visibleFieldMetas}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelectEntry}
                      onSelectAll={selectAllEntries}
                      onViewDetail={(e) => setSelectedEntry(e)}
                    />
                  </div>
                  <div className="sm:hidden">
                    <MobileEntryCards
                      entries={filteredEntries}
                      visibleFields={visibleFieldMetas}
                      allFields={fieldMetas}
                      onViewDetail={(e) => setSelectedEntry(e)}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SendAutoregistroDialog open={sendOpen} onOpenChange={setSendOpen} />
      <EntryDetailDrawer
        open={!!selectedEntry}
        onOpenChange={(v) => !v && setSelectedEntry(null)}
        entry={selectedEntry}
        fieldMetas={fieldMetas}
      />
      <CompareRegistrosDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        entries={selectedEntries}
        fieldMetas={fieldMetas}
      />

      {editingTemplate && (
        <EditTemplateDialog
          open={true}
          onOpenChange={(v) => !v && setEditingTemplate(null)}
          template={editingTemplate}
        />
      )}

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los registros?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los registros de {selectedPatient?.first_name} {selectedPatient?.last_name}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteEntries.mutate(filterPatientId)}
            >
              Eliminar todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
