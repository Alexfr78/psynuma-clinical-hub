import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  AlertCircle,
  Search,
  Users,
  FileText,
  Eye,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAutoregistroEntries, type AutoregistroEntry } from '@/hooks/useAutoregistroEntries';
import { useAutoregistroTemplates } from '@/hooks/useAutoregistroTemplates';
import { EntryDetailDrawer } from '@/components/autoregistros/registros/EntryDetailDrawer';
import { buildFieldDisplayMetas } from '@/lib/autoregistro-field-display';
import { normalizeAutoregistroFields } from '@/lib/autoregistro-fields';

interface ActivityFeedProps {
  onOpenFullRegistro?: (entry: AutoregistroEntry) => void;
}

export function ActivityFeed({ onOpenFullRegistro }: ActivityFeedProps = {}) {
  const [searchText, setSearchText] = useState('');
  const [filterTemplateId, setFilterTemplateId] = useState<string>('all');
  const [filterAlerts, setFilterAlerts] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AutoregistroEntry | null>(null);

  const { data: entries, isLoading } = useAutoregistroEntries();
  const { data: templates } = useAutoregistroTemplates();

  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const q = searchText.trim().toLowerCase();

    return entries.filter((e) => {
      if (filterTemplateId !== 'all' && e.template_id !== filterTemplateId) return false;
      if (filterAlerts && !e.alertSeverity) return false;
      const ts = new Date(e.submitted_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (q) {
        const patientName = `${e.patient?.first_name ?? ''} ${e.patient?.last_name ?? ''}`.toLowerCase();
        const templateName = (e.template?.name ?? '').toLowerCase();
        if (!patientName.includes(q) && !templateName.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filterTemplateId, filterAlerts, dateFrom, dateTo, searchText]);

  // Stats
  const stats = useMemo(() => {
    if (!filteredEntries.length) return { total: 0, patients: 0, alerts: 0 };
    const patientIds = new Set(filteredEntries.map((e) => e.patient_id));
    const alertCount = filteredEntries.filter((e) => e.alertSeverity).length;
    return { total: filteredEntries.length, patients: patientIds.size, alerts: alertCount };
  }, [filteredEntries]);

  // Field metas for the selected entry's template (for the detail drawer)
  const selectedFieldMetas = useMemo(() => {
    if (!selectedEntry?.template?.fields) return [];
    const fields = normalizeAutoregistroFields(selectedEntry.template.fields);
    return buildFieldDisplayMetas(fields);
  }, [selectedEntry]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando actividad...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Registros</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.patients}</p>
              <p className="text-xs text-muted-foreground">Pacientes activos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 sm:col-span-1">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{stats.alerts}</p>
              <p className="text-xs text-muted-foreground">Con alertas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 min-w-0 max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar paciente o plantilla..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={filterTemplateId} onValueChange={setFilterTemplateId}>
          <SelectTrigger className="w-full sm:w-52 h-9">
            <SelectValue placeholder="Todas las plantillas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las plantillas</SelectItem>
            {templates?.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Button
          variant={filterAlerts ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 h-9"
          onClick={() => setFilterAlerts(!filterAlerts)}
        >
          <AlertCircle className="h-4 w-4" />
          <span className="hidden sm:inline">Solo alertas</span>
        </Button>
      </div>

      {/* Table / empty state */}
      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <Activity className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">
            {entries?.length === 0
              ? 'Aún no se han recibido autoregistros.'
              : 'Ningún registro coincide con los filtros actuales.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Plantilla</TableHead>
                  <TableHead className="text-center">Alerta</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(entry.submitted_at), "d MMM yyyy, HH:mm", { locale: es })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.patient?.first_name} {entry.patient?.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.template?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {entry.alertSeverity === 'critical' && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> Crítica
                        </Badge>
                      )}
                      {entry.alertSeverity === 'warning' && (
                        <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600">
                          <AlertCircle className="h-3 w-3" /> Aviso
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setSelectedEntry(entry)}
                          title="Ver detalle del registro"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {onOpenFullRegistro && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => onOpenFullRegistro(entry)}
                            title="Ir al autoregistro completo"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filteredEntries.map((entry) => (
              <Card
                key={entry.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedEntry(entry)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {entry.patient?.first_name} {entry.patient?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.template?.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(entry.submitted_at), "d MMM yyyy, HH:mm", { locale: es })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.alertSeverity === 'critical' && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                        </Badge>
                      )}
                      {entry.alertSeverity === 'warning' && (
                        <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                        </Badge>
                      )}
                      {onOpenFullRegistro && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFullRegistro(entry);
                          }}
                          title="Ir al autoregistro completo"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Detail drawer */}
      <EntryDetailDrawer
        open={!!selectedEntry}
        onOpenChange={(v) => !v && setSelectedEntry(null)}
        entry={selectedEntry}
        fieldMetas={selectedFieldMetas}
      />
    </div>
  );
}
