import { qk } from '@/lib/query-keys';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SessionDetailDrawer } from '@/components/agenda/SessionDetailDrawer';
import { useDebtStats, useDebts } from '@/hooks/useDebts';
import type { SessionWithRelations } from '@/hooks/useSessions';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { TranscriptionIssuesCard } from '@/components/web-recorder/TranscriptionIssuesCard';

function useDashboardStats() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: qk.dashboardStats.all,
    queryFn: async () => {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const startOfMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
      const endOfMonth = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
      const startOfPrevMonth = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd');
      const endOfPrevMonth = format(new Date(now.getFullYear(), now.getMonth(), 0), 'yyyy-MM-dd');

      const [
        patientsRes,
        todaySessionsRes,
        monthInvoicesRes,
        monthSessionsRes,
        prevMonthSessionsRes,
        newPatientsRes,
        prevNewPatientsRes,
      ] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('session_date', today).neq('status', 'cancelled').neq('status', 'no_show').neq('status', 'blocked'),
        supabase.from('invoices').select('total, status, retention_amount').gte('issue_date', startOfMonth).lte('issue_date', endOfMonth),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('session_date', startOfMonth).lte('session_date', endOfMonth).neq('status', 'cancelled').neq('status', 'no_show').neq('status', 'blocked').neq('session_type', 'Bloqueado'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('session_date', startOfPrevMonth).lte('session_date', endOfPrevMonth).neq('status', 'cancelled').neq('status', 'no_show').neq('status', 'blocked').neq('session_type', 'Bloqueado'),
        supabase.from('patients').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
        supabase.from('patients').select('id', { count: 'exact', head: true }).gte('created_at', startOfPrevMonth).lte('created_at', endOfPrevMonth),
      ]);

      const monthEffective = monthInvoicesRes.data?.filter(inv => inv.status === 'issued' || inv.status === 'paid') || [];
      const monthlyRevenueNet = monthEffective.reduce((sum, inv) => sum + Number(inv.total), 0);
      const monthlyRetained = monthEffective.reduce((sum, inv) => sum + Number(inv.retention_amount ?? 0), 0);
      const monthlyRevenue = monthlyRevenueNet + monthlyRetained;

      const monthSessions = monthSessionsRes.count || 0;
      const prevMonthSessions = prevMonthSessionsRes.count || 0;
      const newPatients = newPatientsRes.count || 0;
      const prevNewPatients = prevNewPatientsRes.count || 0;

      const trend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? { delta: current, percent: null as number | null } : { delta: 0, percent: null };
        return { delta: current - previous, percent: Math.round(((current - previous) / previous) * 100) };
      };

      return {
        activePatients: patientsRes.count || 0,
        todaySessions: todaySessionsRes.count || 0,
        monthlyRevenue,
        monthlyRevenueNet,
        monthlyRetained,
        monthSessions,
        monthSessionsTrend: trend(monthSessions, prevMonthSessions),
        newPatients,
        newPatientsTrend: trend(newPatients, prevNewPatients),
      };
    },
    enabled: !!profile?.center_id,
  });
}

function useTodaySessions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: qk.sessions.today(),
    queryFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('sessions')
        .select(`
          id, session_date, start_time, end_time, status, price, notes,
          session_type, session_modality, location_id, bono_id,
          cancellation_policy, cancellation_reason, video_call_link,
          send_reminder_email, send_reminder_sms, send_reminder_whatsapp,
          access_token, room, professional_id, patient_id,
          patient:patients!sessions_patient_id_fkey(id, first_name, last_name, email, phone),
          professional:profiles!sessions_professional_id_fkey(id, first_name, last_name, email)
        `)
        .eq('session_date', today)
        .neq('status', 'cancelled')
        .neq('status', 'no_show')
        .neq('status', 'blocked')
        .order('start_time');

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.center_id,
  });
}

function TrendBadge({ trend }: { trend: { delta: number; percent: number | null } }) {
  if (trend.delta === 0 && trend.percent === null) return null;
  const positive = trend.delta >= 0;
  const label = trend.percent !== null ? `${positive ? '+' : ''}${trend.percent}%` : `${positive ? '+' : ''}${trend.delta}`;
  return (
    <span className={cn(
      'rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
      positive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
    )}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  // Usa la misma fuente que la página de Cobros/Deudas para evitar discrepancias
  const { data: debtStats } = useDebtStats();
  // El pendiente de cobro sale de useDebtStats (get_receivables_summary), la misma cifra que en Cobros.
  const pendingDebts = debtStats?.totalPending ?? 0;
  const { data: todaySessions, isLoading: sessionsLoading } = useTodaySessions();
  const { data: pendingDebtsList, isLoading: debtsListLoading } = useDebts();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Always read the selected session fresh from the DB so edits (date, price,
  // status, patient...) are reflected in the drawer and its actions (WhatsApp,
  // Google sync, etc.). Any invalidation of ['sessions'] refetches this too.
  const { data: selectedSession } = useQuery({
    queryKey: qk.sessions.detail(selectedSessionId),
    queryFn: async () => {
      if (!selectedSessionId) return null;
      const { data, error } = await supabase
        .from('sessions')
        .select(`
          *,
          patient:patients!sessions_patient_id_fkey(id, first_name, last_name, email, phone, auto_invoice_on_complete, preferred_invoice_type),
          professional:profiles!sessions_professional_id_fkey(id, first_name, last_name, email)
        `)
        .eq('id', selectedSessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSessionId,
  });

  useEffect(() => {
    const handleSelectSession = (event: Event) => {
      const { sessionId } = (event as CustomEvent<{ sessionId?: string }>).detail || {};
      if (!sessionId) return;
      setSelectedSessionId(sessionId);
    };

    window.addEventListener('select-session', handleSelectSession);
    return () => window.removeEventListener('select-session', handleSelectSession);
  }, []);

  const nowTime = format(new Date(), 'HH:mm:ss');
  const nextSession = todaySessions?.find((s) => s.start_time >= nowTime);

  return (
    <div className="flex flex-col gap-6">
      <TranscriptionIssuesCard />
      {/* Hero (desktop only: on mobile the dashboard opens straight on today's agenda) */}
      <div className="relative hidden overflow-hidden rounded-2xl border bg-card p-6 shadow-card md:block">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-card to-secondary/5" />
        <div className="relative z-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Hola, {profile?.first_name || 'Profesional'}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {sessionsLoading
                ? 'Cargando tu agenda de hoy...'
                : todaySessions && todaySessions.length > 0
                  ? `Tienes ${todaySessions.length} ${todaySessions.length === 1 ? 'sesión programada' : 'sesiones programadas'} hoy.`
                  : 'No tienes sesiones programadas para hoy.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-3 rounded-xl border bg-background/80 px-4 py-3">
              <Icon name="schedule" className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Próxima cita</p>
                <p className="text-sm text-muted-foreground">
                  {nextSession ? nextSession.start_time.slice(0, 5) : 'Sin más citas hoy'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-background/80 px-4 py-3">
              <Icon name="group" className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-sm font-medium">Contactos</p>
                <p className="text-sm text-muted-foreground">
                  {todaySessions?.length ?? 0} programados
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="order-2 grid grid-cols-1 gap-4 md:order-none md:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Sesiones este mes</p>
            <Icon name="trending_up" className="h-4 w-4 text-muted-foreground" />
          </div>
          {statsLoading ? <Skeleton className="h-8 w-16" /> : (
            <div className="flex items-end gap-2">
              <h3 className="text-2xl font-bold tabular-nums">{stats?.monthSessions ?? 0}</h3>
              {stats && <TrendBadge trend={stats.monthSessionsTrend} />}
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="mb-2 flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Nuevos contactos</p>
            <Icon name="person_add" className="h-4 w-4 text-muted-foreground" />
          </div>
          {statsLoading ? <Skeleton className="h-8 w-16" /> : (
            <div className="flex items-end gap-2">
              <h3 className="text-2xl font-bold tabular-nums">{stats?.newPatients ?? 0}</h3>
              {stats && <TrendBadge trend={stats.newPatientsTrend} />}
            </div>
          )}
        </div>
        <Link to="/facturas" className="rounded-2xl border bg-card p-4 shadow-card transition-shadow hover:shadow-card-hover">
          <div className="mb-2 flex items-start justify-between">
            <p className="text-sm font-medium text-muted-foreground">Ingresos del mes</p>
            <Icon name="payments" className="h-4 w-4 text-muted-foreground" />
          </div>
          {statsLoading ? <Skeleton className="h-8 w-24" /> : (
            <h3 className="text-2xl font-bold tabular-nums">{(stats?.monthlyRevenue ?? 0).toFixed(2)}€</h3>
          )}
        </Link>
      </div>

      <div className="order-1 grid grid-cols-1 gap-4 md:order-none lg:grid-cols-3">
        {/* Agenda de Hoy */}
        <div className="rounded-2xl border bg-card p-4 shadow-card lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Agenda de Hoy</h3>
            <Link to="/agenda" className="text-sm font-medium text-primary hover:underline">
              Ver calendario
            </Link>
          </div>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !todaySessions || todaySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Icon name="calendar_month" className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No hay sesiones programadas para hoy
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((session) => {
                const isOnline = session.session_modality !== 'in_person';
                const isPast = session.end_time < nowTime;
                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={cn(
                      'group flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors hover:bg-muted',
                      isPast && 'opacity-60'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <span className="text-sm font-semibold tabular-nums">{session.start_time.slice(0, 5)}</span>
                      </div>
                      <div>
                        <p className="font-medium group-hover:text-primary transition-colors">
                          {session.patient?.first_name} {session.patient?.last_name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                          <Icon name={isOnline ? 'videocam' : 'location_on'} className="h-3.5 w-3.5" />
                          <span>{isOnline ? 'Sesión Online' : 'Presencial'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                    {isOnline && session.video_call_link ? (
                      <a
                        href={session.video_call_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hidden shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-0 transition-opacity group-hover:opacity-100 md:block"
                      >
                        Entrar a sesión
                      </a>
                    ) : (
                      <Link
                        to={`/pacientes/${session.patient_id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hidden shrink-0 rounded-xl border px-3 py-2 text-sm font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100 md:block"
                      >
                        Ver expediente
                      </Link>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagos Pendientes */}
        <div className="flex flex-col rounded-2xl border bg-card p-4 shadow-card">
          <h3 className="mb-4 text-lg font-semibold">Pagos Pendientes</h3>
          <div className="flex flex-1 flex-col gap-2">
            {debtsListLoading ? (
              [1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)
            ) : !pendingDebtsList || pendingDebtsList.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                <Icon name="check_circle" className="mb-2 h-8 w-8 text-success/60" />
                <p className="text-sm text-muted-foreground">Sin pagos pendientes</p>
              </div>
            ) : (
              pendingDebtsList.slice(0, 4).map((debt) => (
                <Link
                  key={debt.id}
                  to="/cobros"
                  className="flex items-start justify-between gap-2 rounded-xl border p-3 transition-colors hover:bg-muted"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {debt.patients?.first_name} {debt.patients?.last_name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {debt.status === 'partial' ? 'Pago parcial' : 'Pendiente de pago'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-warning">
                    {(Number(debt.amount) - Number(debt.paid_amount)).toFixed(2)}€
                  </span>
                </Link>
              ))
            )}
          </div>
          {pendingDebts > 0 && (
            <Link to="/cobros" className="mt-3 pt-2 text-center text-sm font-medium text-primary hover:underline">
              Ver todas ({pendingDebts.toFixed(2)}€)
            </Link>
          )}
        </div>
      </div>

      {/* Session Detail Drawer */}
      <SessionDetailDrawer
        session={selectedSession as SessionWithRelations | null}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSessionId(null)}
      />
    </div>
  );
}
