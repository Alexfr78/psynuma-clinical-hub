import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ShieldCheck, Search, CalendarIcon, Eye, AlertTriangle, RefreshCw,
  FileText, RotateCcw, ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useProfessionals } from '@/hooks/useProfessionals';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useNavigate } from 'react-router-dom';

const ACTION_OPTIONS = [
  'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'DOWNLOAD',
  'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'SHARE', 'PRINT',
] as const;

const RESOURCE_OPTIONS = [
  'patients', 'sessions', 'assessments', 'consents', 'invoices',
  'autoregistro_entries', 'documents', 'reports', 'clinical_notes',
] as const;

const STATUS_OPTIONS = ['success', 'denied', 'failed'] as const;

const ACTION_BADGE: Record<string, { className: string }> = {
  CREATE: { className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' },
  VIEW: { className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
  UPDATE: { className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  DELETE: { className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
  DOWNLOAD: { className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30' },
  EXPORT: { className: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30' },
  ACCESS_DENIED: { className: 'bg-red-600/20 text-red-700 dark:text-red-400 border-red-600/40 font-bold' },
  LOGIN: { className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' },
  LOGOUT: { className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' },
  SHARE: { className: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' },
  PRINT: { className: 'bg-muted text-muted-foreground border-muted-foreground/20' },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  success: { label: 'Éxito', className: 'bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30' },
  denied: { label: 'Denegado', className: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
  failed: { label: 'Error', className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
};

const PAGE_SIZE = 50;

interface AuditEntry {
  id: string;
  created_at: string;
  seq: number;
  user_id: string | null;
  user_role: string | null;
  organization_id: string | null;
  patient_id: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  justification: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  metadata: Record<string, unknown>;
  previous_hash: string | null;
  current_hash: string;
  is_anomalous: boolean;
  anomaly_reason: string | null;
  user_first_name: string | null;
  user_last_name: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
}

export default function AuditLog() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { professionals } = useProfessionals();
  const { data: patients } = usePatients();

  // Filters
  const [fromDate, setFromDate] = useState<Date>(subDays(new Date(), 7));
  const [toDate, setToDate] = useState<Date>(new Date());
  const [userId, setUserId] = useState<string>('all');
  const [patientId, setPatientId] = useState<string>('all');
  const [action, setAction] = useState<string>('all');
  const [resourceType, setResourceType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [anomalousOnly, setAnomalousOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  if (!isAdmin) {
    navigate('/dashboard');
    return null;
  }

  const rpcParams = useMemo(() => ({
    p_from: fromDate.toISOString(),
    p_to: toDate.toISOString(),
    p_user_id: userId !== 'all' ? userId : null,
    p_patient_id: patientId !== 'all' ? patientId : null,
    p_action: action !== 'all' ? action : null,
    p_resource_type: resourceType !== 'all' ? resourceType : null,
    p_status: status !== 'all' ? status : null,
    p_anomalous_only: anomalousOnly,
    p_search: searchText || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  }), [fromDate, toDate, userId, patientId, action, resourceType, status, anomalousOnly, searchText, page]);

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', rpcParams],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_audit_logs', rpcParams);
      if (error) throw error;
      return (data || []) as unknown as AuditEntry[];
    },
  });

  // Anomaly count
  const { data: anomalyCount = 0 } = useQuery({
    queryKey: ['audit-anomaly-count', fromDate.toISOString(), toDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_audit_logs', {
        p_from: fromDate.toISOString(),
        p_to: toDate.toISOString(),
        p_anomalous_only: true,
        p_limit: 1000,
        p_offset: 0,
      });
      if (error) return 0;
      return (data || []).length;
    },
  });

  const resetFilters = useCallback(() => {
    setFromDate(subDays(new Date(), 7));
    setToDate(new Date());
    setUserId('all');
    setPatientId('all');
    setAction('all');
    setResourceType('all');
    setStatus('all');
    setAnomalousOnly(false);
    setSearchText('');
    setPage(0);
  }, []);

  const exportCSV = useCallback(() => {
    if (!logs.length) return;
    const headers = ['timestamp', 'user', 'action', 'resource_type', 'resource_id', 'patient', 'status', 'is_anomalous', 'anomaly_reason', 'ip_address', 'justification', 'metadata'];
    const rows = logs.map(l => [
      l.created_at,
      [l.user_first_name, l.user_last_name].filter(Boolean).join(' ') || 'Sistema',
      l.action,
      l.resource_type,
      l.resource_id || '',
      [l.patient_first_name, l.patient_last_name].filter(Boolean).join(' ') || '',
      l.status,
      l.is_anomalous ? 'true' : 'false',
      l.anomaly_reason || '',
      l.ip_address || '',
      l.justification || '',
      JSON.stringify(l.metadata || {}),
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  const totalShown = page * PAGE_SIZE + logs.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Registro de Auditoría</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">
              Historial inmutable de accesos y operaciones clínicas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={!logs.length}>
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </Button>
        </div>
      </div>

      {/* Anomaly banner */}
      {anomalyCount > 0 && !anomalousOnly && (
        <Card className="border-orange-500/50 bg-orange-500/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <span className="text-sm font-medium">
                ⚠ {anomalyCount} evento{anomalyCount > 1 ? 's' : ''} anómalo{anomalyCount > 1 ? 's' : ''} detectado{anomalyCount > 1 ? 's' : ''} en este periodo
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setAnomalousOnly(true); setPage(0); }}>
              Ver solo anómalos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchText}
                onChange={(e) => { setSearchText(e.target.value); setPage(0); }}
                className="pl-10"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Date from */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-xs">
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {format(fromDate, 'dd/MM/yy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fromDate} onSelect={(d) => d && setFromDate(d)} locale={es} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {/* Date to */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-xs">
                  <CalendarIcon className="mr-1 h-3.5 w-3.5" />
                  {format(toDate, 'dd/MM/yy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={toDate} onSelect={(d) => d && setToDate(d)} locale={es} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>

            {/* User */}
            <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(0); }}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Usuario" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {(professionals || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Action */}
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(0); }}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Acción" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las acciones</SelectItem>
                {ACTION_OPTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Resource */}
            <Select value={resourceType} onValueChange={(v) => { setResourceType(v); setPage(0); }}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Recurso" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los recursos</SelectItem>
                {RESOURCE_OPTIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Patient */}
            <Select value={patientId} onValueChange={(v) => { setPatientId(v); setPage(0); }}>
              <SelectTrigger className="w-[200px] text-xs"><SelectValue placeholder="Paciente" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los pacientes</SelectItem>
                {(patients || []).map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch checked={anomalousOnly} onCheckedChange={(v) => { setAnomalousOnly(v); setPage(0); }} id="anomalous" />
              <Label htmlFor="anomalous" className="text-xs cursor-pointer">Solo anómalos</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0 sm:p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16">
              <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No hay eventos para estos filtros</p>
              <p className="text-xs text-muted-foreground mt-1">Ajusta los filtros o el rango de fechas</p>
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 p-3 md:hidden">
                {logs.map(entry => (
                  <div
                    key={entry.id}
                    className="p-3 border rounded-lg space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedEntry(entry)}
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn('text-xs', ACTION_BADGE[entry.action]?.className)}>
                        {entry.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {format(new Date(entry.created_at), 'dd/MM HH:mm')}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {[entry.user_first_name, entry.user_last_name].filter(Boolean).join(' ') || 'Sistema'}
                      </span>
                      <span className="font-mono">{entry.resource_type}</span>
                    </div>
                    {entry.is_anomalous && (
                      <div className="flex items-center gap-1 text-orange-500 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{entry.anomaly_reason}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Fecha/Hora</TableHead>
                      <TableHead>Usuario</TableHead>
                      <TableHead>Acción</TableHead>
                      <TableHead>Recurso</TableHead>
                      <TableHead>Paciente</TableHead>
                      <TableHead className="w-[80px]">Estado</TableHead>
                      <TableHead className="w-[50px]">⚠</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(entry => {
                      const userName = [entry.user_first_name, entry.user_last_name].filter(Boolean).join(' ') || 'Sistema';
                      const patientName = [entry.patient_first_name, entry.patient_last_name].filter(Boolean).join(' ') || '—';
                      const resourceLabel = entry.resource_id
                        ? `${entry.resource_type} · ${entry.resource_id.length > 20 ? entry.resource_id.slice(0, 20) + '…' : entry.resource_id}`
                        : entry.resource_type;

                      return (
                        <TableRow key={entry.id} className={entry.is_anomalous ? 'bg-orange-500/5' : ''}>
                          <TableCell className="font-mono text-xs">
                            <Tooltip>
                              <TooltipTrigger>
                                {format(new Date(entry.created_at), 'dd/MM/yyyy HH:mm:ss')}
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: es })}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-sm">{userName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs', ACTION_BADGE[entry.action]?.className)}>
                              {entry.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{resourceLabel}</TableCell>
                          <TableCell className="text-sm">{patientName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn('text-xs', STATUS_BADGE[entry.status]?.className)}>
                              {STATUS_BADGE[entry.status]?.label || entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {entry.is_anomalous && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                </TooltipTrigger>
                                <TooltipContent>{entry.anomaly_reason}</TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedEntry(entry)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-xs text-muted-foreground">
                  Mostrando {page * PAGE_SIZE + 1}-{totalShown} eventos
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Detalle del Evento
            </SheetTitle>
          </SheetHeader>

          {selectedEntry && (
            <ScrollArea className="mt-6 pr-2">
              <div className="space-y-6">
                {/* Basic info */}
                <div className="grid grid-cols-2 gap-4">
                  <DetailField label="Fecha/Hora" value={format(new Date(selectedEntry.created_at), 'dd/MM/yyyy HH:mm:ss')} mono />
                  <DetailField label="Secuencia" value={String(selectedEntry.seq)} mono />
                  <DetailField label="Usuario" value={[selectedEntry.user_first_name, selectedEntry.user_last_name].filter(Boolean).join(' ') || 'Sistema'} />
                  <DetailField label="Rol" value={selectedEntry.user_role || '—'} />
                  <DetailField label="Acción" value={selectedEntry.action} badge badgeClass={ACTION_BADGE[selectedEntry.action]?.className} />
                  <DetailField label="Estado" value={STATUS_BADGE[selectedEntry.status]?.label || selectedEntry.status} badge badgeClass={STATUS_BADGE[selectedEntry.status]?.className} />
                  <DetailField label="Recurso" value={selectedEntry.resource_type} />
                  <DetailField label="ID Recurso" value={selectedEntry.resource_id || '—'} mono />
                  <DetailField label="Paciente" value={[selectedEntry.patient_first_name, selectedEntry.patient_last_name].filter(Boolean).join(' ') || '—'} />
                  <DetailField label="IP" value={selectedEntry.ip_address || '—'} mono />
                </div>

                {selectedEntry.justification && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-xs text-muted-foreground">Justificación</Label>
                      <p className="mt-1 text-sm">{selectedEntry.justification}</p>
                    </div>
                  </>
                )}

                {selectedEntry.is_anomalous && (
                  <>
                    <Separator />
                    <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="font-medium text-sm text-orange-700 dark:text-orange-400">Evento Anómalo</span>
                      </div>
                      <p className="text-xs text-orange-600 dark:text-orange-300">{selectedEntry.anomaly_reason}</p>
                    </div>
                  </>
                )}

                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">Cadena de Hash</Label>
                  <div className="mt-2 space-y-2">
                    <div>
                      <span className="text-xs text-muted-foreground">Hash anterior:</span>
                      <p className="font-mono text-xs break-all bg-muted p-2 rounded mt-1">{selectedEntry.previous_hash || 'GENESIS'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Hash actual:</span>
                      <p className="font-mono text-xs break-all bg-muted p-2 rounded mt-1">{selectedEntry.current_hash}</p>
                    </div>
                  </div>
                </div>

                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">Metadata</Label>
                  <pre className="mt-2 text-xs font-mono bg-muted p-3 rounded overflow-x-auto max-h-60 whitespace-pre-wrap break-all">
                    {JSON.stringify(selectedEntry.metadata, null, 2)}
                  </pre>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                  <DetailField label="User Agent" value={selectedEntry.user_agent || '—'} mono />
                  <DetailField label="ID Evento" value={selectedEntry.id} mono />
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailField({ label, value, mono, badge, badgeClass }: {
  label: string;
  value: string;
  mono?: boolean;
  badge?: boolean;
  badgeClass?: string;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {badge ? (
        <div className="mt-0.5">
          <Badge variant="outline" className={cn('text-xs', badgeClass)}>{value}</Badge>
        </div>
      ) : (
        <p className={cn('text-sm mt-0.5 break-all', mono && 'font-mono text-xs')}>{value}</p>
      )}
    </div>
  );
}
