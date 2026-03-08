import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Send, Eye } from 'lucide-react';
import { useAutoregistroEntries } from '@/hooks/useAutoregistroEntries';
import { useAutoregistroLinks } from '@/hooks/useAutoregistroLinks';
import { EntryDetailDialog } from '@/components/autoregistros/EntryDetailDialog';
import { EntryChart } from '@/components/autoregistros/EntryChart';
import { SendAutoregistroDialog } from '@/components/autoregistros/SendAutoregistroDialog';
import type { AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface PatientAutoregistrosProps {
  patientId: string;
}

export function PatientAutoregistros({ patientId }: PatientAutoregistrosProps) {
  const [selectedEntry, setSelectedEntry] = useState<AutoregistroEntry | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const { data: entries, isLoading } = useAutoregistroEntries({ patientId });
  const { data: links } = useAutoregistroLinks({ patientId });

  // Get fields from first entry's template for chart
  const firstTemplate = entries?.[0]?.template;
  const fields = firstTemplate?.fields ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Autorregistros</h3>
        <Button size="sm" onClick={() => setSendOpen(true)}>
          <Send className="h-4 w-4 mr-2" /> Enviar
        </Button>
      </div>

      {/* Chart */}
      {entries && entries.length >= 2 && fields.length > 0 && (
        <EntryChart entries={entries} fields={fields} />
      )}

      {/* Active links */}
      {links && links.filter((l) => l.status === 'active').length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">
            Enlaces activos: {links.filter((l) => l.status === 'active').length}
          </p>
        </div>
      )}

      {/* Entries */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : entries && entries.length > 0 ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onClick={() => setSelectedEntry(entry)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-8">
          No hay registros aún
        </p>
      )}

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
    </div>
  );
}
