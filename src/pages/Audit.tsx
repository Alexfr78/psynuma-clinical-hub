import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ClipboardList, Filter, RefreshCw, Loader2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuditLog, AuditLogEntry } from '@/hooks/useAuditLog';

const TABLE_NAMES = [
  { value: '', label: 'Todas las tablas' },
  { value: 'patients', label: 'Pacientes' },
  { value: 'sessions', label: 'Sesiones' },
  { value: 'invoices', label: 'Facturas' },
  { value: 'bonos', label: 'Bonos' },
  { value: 'payments', label: 'Pagos' },
  { value: 'debts', label: 'Deudas' },
  { value: 'notifications', label: 'Notificaciones' },
  { value: 'profiles', label: 'Perfiles' },
  { value: 'centers', label: 'Centros' },
];

const ACTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'INSERT', label: 'Creación' },
  { value: 'UPDATE', label: 'Actualización' },
  { value: 'DELETE', label: 'Eliminación' },
];

const getActionBadgeVariant = (action: string) => {
  switch (action) {
    case 'INSERT':
      return 'default';
    case 'UPDATE':
      return 'secondary';
    case 'DELETE':
      return 'destructive';
    default:
      return 'outline';
  }
};

const getActionLabel = (action: string) => {
  switch (action) {
    case 'INSERT':
      return 'Creación';
    case 'UPDATE':
      return 'Actualización';
    case 'DELETE':
      return 'Eliminación';
    default:
      return action;
  }
};

const getTableLabel = (tableName: string) => {
  const table = TABLE_NAMES.find((t) => t.value === tableName);
  return table?.label || tableName;
};

export default function Audit() {
  const [tableName, setTableName] = useState('');
  const [action, setAction] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  const { logs, isLoading, refetch } = useAuditLog({
    tableName: tableName || undefined,
    action: action || undefined,
    startDate: startDate || undefined,
    endDate: endDate ? `${endDate}T23:59:59` : undefined,
  });

  const clearFilters = () => {
    setTableName('');
    setAction('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">Auditoría</h1>
          <p className="mt-1 text-muted-foreground">
            Registro de actividad del sistema
          </p>
        </div>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label>Tabla</Label>
              <Select value={tableName} onValueChange={setTableName}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las tablas" />
                </SelectTrigger>
                <SelectContent>
                  {TABLE_NAMES.map((table) => (
                    <SelectItem key={table.value} value={table.value}>
                      {table.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Acción</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las acciones" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Desde</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="ghost" onClick={clearFilters} className="w-full">
                Limpiar filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Registros ({logs.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">No hay registros</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                No se encontraron registros de auditoría con los filtros seleccionados
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tabla</TableHead>
                    <TableHead>Acción</TableHead>
                    <TableHead>ID Registro</TableHead>
                    <TableHead className="text-right">Detalles</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm", {
                          locale: es,
                        })}
                      </TableCell>
                      <TableCell>{getTableLabel(log.table_name)}</TableCell>
                      <TableCell>
                        <Badge variant={getActionBadgeVariant(log.action)}>
                          {getActionLabel(log.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {log.record_id?.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEntry(log)}
                        >
                          Ver detalles
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalles del Registro</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">Fecha</Label>
                  <p className="font-medium">
                    {format(new Date(selectedEntry.created_at), "dd MMM yyyy HH:mm:ss", {
                      locale: es,
                    })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Acción</Label>
                  <p>
                    <Badge variant={getActionBadgeVariant(selectedEntry.action)}>
                      {getActionLabel(selectedEntry.action)}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tabla</Label>
                  <p className="font-medium">{getTableLabel(selectedEntry.table_name)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID Registro</Label>
                  <p className="font-mono text-sm">{selectedEntry.record_id}</p>
                </div>
              </div>

              {selectedEntry.old_values && (
                <div>
                  <Label className="text-muted-foreground">Valores Anteriores</Label>
                  <ScrollArea className="mt-2 h-32 rounded-md border bg-muted/50 p-3">
                    <pre className="text-xs">
                      {JSON.stringify(selectedEntry.old_values, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {selectedEntry.new_values && (
                <div>
                  <Label className="text-muted-foreground">Valores Nuevos</Label>
                  <ScrollArea className="mt-2 h-32 rounded-md border bg-muted/50 p-3">
                    <pre className="text-xs">
                      {JSON.stringify(selectedEntry.new_values, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}

              {(selectedEntry.ip_address || selectedEntry.user_agent) && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <Label className="text-muted-foreground">Información del Cliente</Label>
                  {selectedEntry.ip_address && (
                    <p className="mt-1 text-sm">
                      <span className="font-medium">IP:</span> {selectedEntry.ip_address}
                    </p>
                  )}
                  {selectedEntry.user_agent && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selectedEntry.user_agent}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
