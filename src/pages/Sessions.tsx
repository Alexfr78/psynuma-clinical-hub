import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSessions, SessionWithRelations } from '@/hooks/useSessions';
import { useProfessionals } from '@/hooks/usePatients';
import { PaymentStatusIndicator } from '@/components/agenda/PaymentStatusIndicator';
import { CreateSessionDialog } from '@/components/agenda/CreateSessionDialog';
import { SessionDetailDialog } from '@/components/agenda/SessionDetailDialog';
import { TranscriptionAnalysisDialog } from '@/components/agenda/TranscriptionAnalysisDialog';
import { Icon } from '@/components/ui/icon';

type Period = 'this_month' | 'last_month' | 'last_3_months' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  this_month: 'Este mes',
  last_month: 'Mes pasado',
  last_3_months: 'Últimos 3 meses',
  all: 'Todo',
};

function isBlockedSession(session: SessionWithRelations) {
  return session.status === 'blocked'
    || session.session_type === 'Bloqueado'
    || !!session.patient?.first_name?.startsWith('[Bloqueado]');
}

export default function Sessions() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [professionalFilter, setProfessionalFilter] = useState('all');
  const [period, setPeriod] = useState<Period>('this_month');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null);
  const [transcriptionSessionId, setTranscriptionSessionId] = useState<string | null>(null);
  const [transcriptionOpen, setTranscriptionOpen] = useState(false);

  const { data: professionals } = useProfessionals();
  const { data: sessions, isLoading } = useSessions(undefined, undefined, professionalFilter);

  const now = new Date();
  const periodRange = useMemo(() => {
    if (period === 'all') return null;
    if (period === 'this_month') {
      return {
        from: format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'),
        to: format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd'),
      };
    }
    if (period === 'last_month') {
      return {
        from: format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd'),
        to: format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd'),
      };
    }
    return {
      from: format(new Date(now.getFullYear(), now.getMonth() - 2, 1), 'yyyy-MM-dd'),
      to: format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const billableSessions = sessions?.filter((s) => !isBlockedSession(s)) || [];

  const filteredSessions = billableSessions.filter((session) => {
    const fullName = `${session.patient?.first_name ?? ''} ${session.patient?.last_name ?? ''}`.toLowerCase().trim();
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matchesSearch = terms.length === 0 || terms.every((term) => fullName.includes(term));
    const matchesStatus = statusFilter === 'all' || session.status === statusFilter;
    const matchesPeriod = !periodRange || (session.session_date >= periodRange.from && session.session_date <= periodRange.to);
    return matchesSearch && matchesStatus && matchesPeriod;
  }).sort((a, b) => (a.session_date + a.start_time < b.session_date + b.start_time ? 1 : -1));

  // Month-to-date summary, independent of the period/search/status filters above
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
  const monthSessions = billableSessions.filter((s) => s.session_date >= monthStart && s.session_date <= monthEnd);
  const totalSessionsThisMonth = monthSessions.length;
  const totalBilledThisMonth = monthSessions.reduce((sum, s) => sum + Number(s.price || 0), 0);

  const handleExportCsv = () => {
    if (filteredSessions.length === 0) return;
    const header = ['Fecha', 'Hora', 'Paciente', 'Tipo', 'Modalidad', 'Estado de pago', 'Importe'];
    const rows = filteredSessions.map((s) => [
      s.session_date,
      s.start_time.slice(0, 5),
      `${s.patient?.first_name ?? ''} ${s.patient?.last_name ?? ''}`.trim(),
      s.session_type || '',
      s.session_modality === 'in_person' ? 'Presencial' : 'Online',
      s.payment_status || (s.bono_id ? 'bono' : ''),
      Number(s.price || 0).toFixed(2),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => {
        const str = String(cell).replace(/"/g, '""');
        return /[",\n]/.test(str) ? `"${str}"` : str;
      }).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sesiones-${format(now, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Historial de Sesiones</h1>
          <p className="text-muted-foreground">
            Gestiona y revisa todas las citas programadas y pasadas
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          Nueva Sesión
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between rounded-2xl border bg-card p-6 shadow-card">
          <div>
            <p className="text-sm text-muted-foreground">Total Sesiones (Este mes)</p>
            <p className="text-3xl font-bold">{totalSessionsThisMonth}</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="calendar_month" className="h-6 w-6" />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border bg-card p-6 shadow-card">
          <div>
            <p className="text-sm text-muted-foreground">Total Facturado (Este mes)</p>
            <p className="text-3xl font-bold">{totalBilledThisMonth.toFixed(2)} €</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
            <Icon name="account_balance_wallet" className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative sm:w-56">
            <Icon name="search" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por contacto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="sm:w-40">
              <Icon name="event" className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-40">
              <Icon name="filter_list" className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="scheduled">Programada</SelectItem>
              <SelectItem value="confirmed">Confirmada</SelectItem>
              <SelectItem value="completed">Completada</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
              <SelectItem value="no_show">No asistió</SelectItem>
            </SelectContent>
          </Select>

          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="sm:w-48">
              <Icon name="person" className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Profesional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los profesionales</SelectItem>
              {professionals?.map((prof) => (
                <SelectItem key={prof.id} value={prof.id}>
                  {prof.first_name} {prof.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" className="text-primary" onClick={handleExportCsv} disabled={filteredSessions.length === 0}>
          <Icon name="download" className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Icon name="calendar_month" className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-display text-lg font-semibold">Sin sesiones</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {search || statusFilter !== 'all' || period !== 'all'
                ? 'No se encontraron sesiones con los filtros seleccionados.'
                : 'No hay sesiones registradas aún.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-6 py-4 font-medium text-muted-foreground">Fecha y Hora</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Paciente</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Tipo</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Modalidad</th>
                  <th className="px-6 py-4 font-medium text-muted-foreground">Estado de Pago</th>
                  <th className="px-6 py-4 text-right font-medium text-muted-foreground">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSessions.map((session) => {
                  const isOnline = session.session_modality !== 'in_person';
                  const initials = `${session.patient?.first_name?.[0] || ''}${session.patient?.last_name?.[0] || ''}`.toUpperCase();
                  return (
                    <tr
                      key={session.id}
                      onClick={() => setSelectedSession(session)}
                      className="group cursor-pointer transition-colors hover:bg-muted/50"
                    >
                      <td className="px-6 py-4">
                        <p className="tabular-nums">{format(new Date(session.session_date + 'T00:00:00'), 'd MMM, yyyy', { locale: es })}</p>
                        <p className="text-xs text-muted-foreground">{session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {initials || '?'}
                          </div>
                          <p className="font-medium group-hover:text-primary transition-colors">
                            {session.patient?.first_name} {session.patient?.last_name}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {session.session_type ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {session.session_type}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Icon name={isOnline ? 'videocam' : 'location_on'} className="h-4 w-4" />
                          <span>{isOnline ? 'Online' : 'Presencial'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <PaymentStatusIndicator
                          paymentStatus={session.payment_status}
                          price={session.price}
                          bonoId={session.bono_id}
                          showLabel
                        />
                      </td>
                      <td className="px-6 py-4 text-right font-medium tabular-nums">
                        {Number(session.price || 0).toFixed(2)} €
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredSessions.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Mostrando {filteredSessions.length} sesión{filteredSessions.length !== 1 ? 'es' : ''}
        </div>
      )}

      {/* Dialogs */}
      <CreateSessionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        initialDate={new Date()}
        initialTime="09:00"
      />

      <SessionDetailDialog
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
        onAnalyzeTranscription={(id) => {
          setTranscriptionSessionId(id);
          setTimeout(() => setTranscriptionOpen(true), 300);
        }}
      />

      {transcriptionSessionId && (() => {
        const s = sessions?.find(s => s.id === transcriptionSessionId);
        const pName = s?.patient ? `${s.patient.first_name} ${s.patient.last_name}` : undefined;
        return (
          <TranscriptionAnalysisDialog
            open={transcriptionOpen}
            onOpenChange={(open) => {
              setTranscriptionOpen(open);
              if (!open) setTranscriptionSessionId(null);
            }}
            sessionId={transcriptionSessionId}
            patientName={pName}
            patientPhone={s?.patient?.phone}
            patientEmail={s?.patient?.email}
            sessionDate={s?.session_date}
          />
        );
      })()}
    </div>
  );
}
