import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Send, Eye, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAutoregistroEntries, useDeleteAutoregistroEntries } from '@/hooks/useAutoregistroEntries';
import { EntryDetailDialog } from '@/components/autoregistros/EntryDetailDialog';
import { EntryChart } from '@/components/autoregistros/EntryChart';
import { SendAutoregistroDialog } from '@/components/autoregistros/SendAutoregistroDialog';
import { PatientLinksList } from '@/components/autoregistros/PatientLinksList';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import type { AutoregistroField } from '@/hooks/useAutoregistroTemplates';
import { formatFieldValue } from '@/lib/autoregistro-format';

interface PatientAutoregistrosProps {
  patientId: string;
}

const ALL = '__all__';

export function PatientAutoregistros({ patientId }: PatientAutoregistrosProps) {
  const [selectedEntry, setSelectedEntry] = useState<AutoregistroEntry | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [subtab, setSubtab] = useState('responses');
  const [templateFilter, setTemplateFilter] = useState<string>(ALL);
  const { data: entries, isLoading } = useAutoregistroEntries({ patientId });
  const deleteEntries = useDeleteAutoregistroEntries();

  // Distinct templates present in entries
  const templates = useMemo(() => {
    const map = new Map<string, { id: string; name: string; fields: AutoregistroField[] }>();
    for (const e of entries ?? []) {
      if (!map.has(e.template_id)) {
        map.set(e.template_id, {
          id: e.template_id,
          name: e.template?.name ?? 'Plantilla',
          fields: (e.template?.fields ?? []) as AutoregistroField[],
        });
      }
    }
    return Array.from(map.values());
  }, [entries]);

  const showTemplateFilter = templates.length > 1;

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    if (templateFilter === ALL) return entries;
    return entries.filter((e) => e.template_id === templateFilter);
  }, [entries, templateFilter]);

  // Fields to use for table columns: from selected template, or from first entry when "all"
  const activeTemplate = templateFilter === ALL ? templates[0] : templates.find((t) => t.id === templateFilter);
  const dynamicFields: AutoregistroField[] = useMemo(() => {
    return [...(activeTemplate?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [activeTemplate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Autorregistros</h3>
        <div className="flex gap-2">
          {entries && entries.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Borrar respuestas
            </Button>
          )}
          <Button size="sm" onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4 mr-2" /> Enviar
          </Button>
        </div>
      </div>

      <Tabs value={subtab} onValueChange={setSubtab}>
        <TabsList>
          <TabsTrigger value="responses">Respuestas {entries ? `(${entries.length})` : ''}</TabsTrigger>
          <TabsTrigger value="links">Enlaces enviados</TabsTrigger>
          <TabsTrigger value="evolution">Evolución</TabsTrigger>
        </TabsList>

        {showTemplateFilter && subtab !== 'links' && (
          <div className="mt-3">
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Plantilla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas las plantillas</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <TabsContent value="responses" className="space-y-3 mt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : filteredEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay registros aún</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-3 sm:hidden">
                {filteredEntries.map((entry) => {
                  const fields = (entry.template?.fields ?? []) as AutoregistroField[];
                  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                  return (
                    <div
                      key={entry.id}
                      className="border rounded-lg p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">
                          {entry.template?.name}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(entry.submitted_at), 'dd MMM HH:mm', { locale: es })}
                        </span>
                      </div>
                      {sorted.slice(0, 4).map((f) => (
                        <div key={f.label} className="flex justify-between items-baseline gap-2">
                          <span className="text-xs text-muted-foreground shrink-0">{f.label}</span>
                          <span className="text-sm font-medium text-right truncate">
                            {formatFieldValue(f, entry.values?.[f.label])}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              {/* Desktop table */}
              <div className="overflow-x-auto hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Fecha</TableHead>
                      {(templateFilter === ALL && showTemplateFilter) && (
                        <TableHead>Plantilla</TableHead>
                      )}
                      {dynamicFields.map((f) => (
                        <TableHead key={f.label}>{f.label}</TableHead>
                      ))}
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => {
                      const rowFields: AutoregistroField[] =
                        templateFilter === ALL
                          ? ((entry.template?.fields ?? []) as AutoregistroField[]).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                          : dynamicFields;
                      return (
                        <TableRow
                          key={entry.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedEntry(entry)}
                        >
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.submitted_at), 'dd MMM yyyy HH:mm', { locale: es })}
                          </TableCell>
                          {(templateFilter === ALL && showTemplateFilter) && (
                            <TableCell className="text-sm">{entry.template?.name}</TableCell>
                          )}
                          {templateFilter === ALL && showTemplateFilter ? (
                            <TableCell colSpan={dynamicFields.length} className="text-sm text-muted-foreground">
                              {rowFields.slice(0, 3).map((f) => `${f.label}: ${formatFieldValue(f, entry.values?.[f.label])}`).join(' · ')}
                            </TableCell>
                          ) : (
                            dynamicFields.map((f) => (
                              <TableCell key={f.label}>
                                {formatFieldValue(f, entry.values?.[f.label])}
                              </TableCell>
                            ))
                          )}
                          <TableCell>
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="links" className="mt-4">
          <PatientLinksList patientId={patientId} entries={entries ?? []} />
        </TabsContent>

        <TabsContent value="evolution" className="mt-4">
          {filteredEntries.length < 2 || dynamicFields.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Se necesitan al menos 2 respuestas para mostrar la evolución.
            </p>
          ) : (
            <EntryChart entries={filteredEntries} fields={dynamicFields} splitByField />
          )}
        </TabsContent>
      </Tabs>

      <EntryDetailDialog
        open={!!selectedEntry}
        onOpenChange={(v) => !v && setSelectedEntry(null)}
        entry={selectedEntry}
      />

      <SendAutoregistroDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        preselectedPatientId={patientId}
      />

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todas las respuestas?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todas las respuestas de autorregistros de este contacto. Los enlaces enviados se mantendrán.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteEntries.mutate(patientId)}
            >
              Eliminar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
