import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import {
  Users,
  Calendar,
  Receipt,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

const stats = [
  {
    title: 'Pacientes Activos',
    value: '0',
    description: 'Total de pacientes',
    icon: Users,
    trend: null,
  },
  {
    title: 'Citas Hoy',
    value: '0',
    description: 'Sesiones programadas',
    icon: Calendar,
    trend: null,
  },
  {
    title: 'Facturación Mes',
    value: '€0',
    description: 'Ingresos del mes',
    icon: Receipt,
    trend: null,
  },
  {
    title: 'Pendientes Cobro',
    value: '€0',
    description: 'Deudas pendientes',
    icon: AlertCircle,
    trend: null,
  },
];

const recentActivity = [
  {
    id: 1,
    type: 'info',
    message: 'Bienvenido a Psynuma',
    time: 'Ahora',
  },
];

export default function Dashboard() {
  const { profile } = useAuth();

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

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Today's Schedule */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Agenda de Hoy
            </CardTitle>
            <CardDescription>Tus próximas sesiones programadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                No hay sesiones programadas para hoy
              </p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Las sesiones aparecerán aquí cuando las programes
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Actividad Reciente
            </CardTitle>
            <CardDescription>Últimas acciones en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 rounded-lg bg-muted/50 p-3"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{activity.message}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
          <CardDescription>Accesos directos a las funciones más utilizadas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Users className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nuevo Paciente</span>
            </button>
            <button className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Calendar className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nueva Sesión</span>
            </button>
            <button className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <Receipt className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Nueva Factura</span>
            </button>
            <button className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted">
              <TrendingUp className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Ver Informes</span>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
