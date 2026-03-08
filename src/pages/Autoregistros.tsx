import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Send } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAutoregistroTemplates, type AutoregistroTemplate } from '@/hooks/useAutoregistroTemplates';
import { useAutoregistroLinks } from '@/hooks/useAutoregistroLinks';
import { useAutoregistroEntries } from '@/hooks/useAutoregistroEntries';
import { TemplateCard } from '@/components/autoregistros/TemplateCard';
import { EditTemplateDialog } from '@/components/autoregistros/EditTemplateDialog';
import { CreateTemplateDialog } from '@/components/autoregistros/CreateTemplateDialog';
import { SendAutoregistroDialog } from '@/components/autoregistros/SendAutoregistroDialog';
import { LinkCard } from '@/components/autoregistros/LinkCard';
import { EntryCard } from '@/components/autoregistros/EntryCard';
import { EntryDetailDialog } from '@/components/autoregistros/EntryDetailDialog';
import { EntryChart } from '@/components/autoregistros/EntryChart';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';

const tabOptions = [
  { value: 'templates', label: 'Plantillas' },
  { value: 'links', label: 'Envíos' },
  { value: 'entries', label: 'Registros' },
];

export default function Autoregistros() {
  const [tab, setTab] = useState('templates');
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AutoregistroTemplate | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<AutoregistroEntry | null>(null);

  const { data: templates, isLoading: loadingTemplates, deleteTemplate } = useAutoregistroTemplates();
  const { data: links, isLoading: loadingLinks, deactivateLink } = useAutoregistroLinks();
  const { data: entries, isLoading: loadingEntries } = useAutoregistroEntries();

  // Get fields from first entry for chart
  const firstTemplate = entries?.[0]?.template;
  const chartFields = firstTemplate?.fields ?? [];

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
                <LinkCard key={l.id} link={l} onDeactivate={(id) => deactivateLink.mutate(id)} />
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

        <TabsContent value="entries">
          {entries && entries.length >= 2 && chartFields.length > 0 && (
            <div className="mb-4">
              <EntryChart entries={entries} fields={chartFields} />
            </div>
          )}

          {loadingEntries ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : entries && entries.length > 0 ? (
            <div className="space-y-2">
              {entries.map((e) => (
                <EntryCard key={e.id} entry={e} onClick={() => setSelectedEntry(e)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No hay registros completados</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CreateTemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <SendAutoregistroDialog open={sendOpen} onOpenChange={setSendOpen} />
      <EntryDetailDialog
        open={!!selectedEntry}
        onOpenChange={(v) => !v && setSelectedEntry(null)}
        entry={selectedEntry}
      />
    </div>
  );
}
