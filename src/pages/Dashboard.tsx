import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SessionDetailDrawer } from '@/components/agenda/SessionDetailDrawer';
import {
  Users,
  Calendar,
  Receipt,
  TrendingUp,
  Clock,
  AlertCircle,
  Package,
} from 'lucide-react';

function useDashboardStats() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

      const [patientsRes, todaySessionsRes, monthInvoicesRes, debtsRes] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('session_date', today).neq('status', 'cancelled').neq('status', 'no_show').neq('status', 'blocked'),
        supabase.from('invoices').select('total, status').gte('issue_date', startOfMonth).lte('issue_date', endOfMonth),
        supabase.from('debts').select('amount, paid_amount').in('status', ['pending', 'partial']),
      ]);

      const monthlyRevenue = monthInvoicesRes.data
        ?.filter(inv => inv.status === 'issued' || inv.status === 'paid')
        .reduce((sum, inv) => sum + Number(inv.total), 0) || 0;

      const pendingDebts = debtsRes.data
        ?.reduce((sum, debt) => sum + (Number(debt.amount) - Number(debt.paid_amount)), 0) || 0;

      return {
        activePatients: patientsRes.count || 0,
        todaySessions: todaySessionsRes.count || 0,
        monthlyRevenue,
        pendingDebts,
      };
    },
    enabled: !!profile?.center_id,
  });
}

function useTodaySessions() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['today-sessions'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

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

export default function Dashboard() {
  const { profile } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: todaySessions, isLoading: sessionsLoading } = useTodaySessions();
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  const statCards = [
    {
      title: 'Contactos Activos',
      value: stats?.activePatients || 0,
      description: 'Total de contactos',
      icon: Users,
      href: '/pacientes',
    },
    {
      title: 'Citas Hoy',
      value: stats?.todaySessions || 0,
      description: 'Sesiones programadas',
      icon: Calendar,
      href: '/agenda',
    },
    {
      title: 'Facturación Mes',
      value: `${(stats?.monthlyRevenue || 0).toFixed(0)}€`,
      description: 'Ingresos del mes',
      icon: Receipt,
      href: '/facturas',
    },
    {
      title: 'Pendientes Cobro',
      value: `${(stats?.pendingDebts || 0).toFixed(0)}€`,
      description: 'Deudas pendientes',
      icon: AlertCircle,
      href: '/cobros',
      alert: (stats?.pendingDebts || 0) > 0,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-bold md:text-3xl">
          ¡Hola, {profile?.first_name || 'Profesional'}!
        </h1>
        <p className="text-muted-foreground">
          Aquí tienes un resumen de tu actividad clínica
        </p>
      </div>

      {/* 1. Agenda de Hoy - PRIMERA */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Agenda de Hoy
          </CardTitle>
          <CardDescription>Tus próximas sesiones programadas</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : !todaySessions || todaySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No hay sesiones programadas para hoy
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((session: any) => (
                <div
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className="flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">
                        {session.patient?.first_name} {session.patient?.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    session.status === 'confirmed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    session.status === 'blocked' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {session.status === 'scheduled' ? 'Programada' :
                     session.status === 'confirmed' ? 'Confirmada' :
                     session.status === 'completed' ? 'Completada' :
                     session.status === 'blocked' ? 'Bloqueado' : session.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Acciones Rápidas */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Acciones Rápidas
          </CardTitle>
          <CardDescription>Accesos directos a funciones frecuentes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <Link to="/pacientes" className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Users className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nuevo Paciente</span>
            </Link>
            <Link to="/agenda" className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Calendar className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nueva Sesión</span>
            </Link>
            <Link to="/facturas" className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Receipt className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nueva Factura</span>
            </Link>
            <Link to="/bonos" className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Package className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nuevo Bono</span>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 3. Stats Grid - AL FINAL */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Link key={stat.title} to={stat.href}>
            <Card className={`shadow-card transition-shadow hover:shadow-card-hover ${stat.alert ? 'border-destructive/50' : ''}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.alert ? 'text-destructive' : 'text-muted-foreground'}`} />
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
                {statsLoading ? (
                  <Skeleton className="h-6 sm:h-8 w-16 sm:w-20" />
                ) : (
                  <div className={`text-lg sm:text-2xl font-bold ${stat.alert ? 'text-destructive' : ''}`}>
                    {stat.value}
                  </div>
                )}
                <p className="text-[10px] sm:text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Session Detail Drawer */}
      <SessionDetailDrawer
        session={selectedSession}
        open={!!selectedSession}
        onOpenChange={(open) => !open && setSelectedSession(null)}
      />
    </div>
  );
}