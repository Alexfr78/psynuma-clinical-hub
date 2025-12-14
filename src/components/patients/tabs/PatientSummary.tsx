import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Calendar, 
  CreditCard, 
  Clock, 
  TrendingUp,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/hooks/usePatients';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PatientSummaryProps {
  patient: Patient & {
    assigned_professional?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      specialty: string | null;
    } | null;
  };
}

const statusConfig = {
  active: { label: 'Activo', variant: 'default' as const, color: 'bg-success' },
  inactive: { label: 'Inactivo', variant: 'secondary' as const, color: 'bg-muted' },
  discharged: { label: 'Alta', variant: 'outline' as const, color: 'bg-info' },
};

export function PatientSummary({ patient }: PatientSummaryProps) {
  const status = statusConfig[patient.status as keyof typeof statusConfig] || statusConfig.active;
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();

  // Fetch patient stats
  const { data: stats } = useQuery({
    queryKey: ['patient-stats', patient.id],
    queryFn: async () => {
      const [sessionsRes, debtsRes, bonosRes] = await Promise.all([
        supabase
          .from('sessions')
          .select('id, status')
          .eq('patient_id', patient.id),
        supabase
          .from('debts')
          .select('amount, paid_amount, status')
          .eq('patient_id', patient.id)
          .eq('status', 'pending'),
        supabase
          .from('bonos')
          .select('id, total_sessions, used_sessions, status')
          .eq('patient_id', patient.id)
          .eq('status', 'active'),
      ]);

      const totalSessions = sessionsRes.data?.length || 0;
      const completedSessions = sessionsRes.data?.filter(s => s.status === 'completed').length || 0;
      const pendingDebt = debtsRes.data?.reduce((acc, d) => acc + (Number(d.amount) - Number(d.paid_amount || 0)), 0) || 0;
      const activeBonos = bonosRes.data?.length || 0;
      const remainingBonoSessions = bonosRes.data?.reduce((acc, b) => acc + (b.total_sessions - (b.used_sessions || 0)), 0) || 0;

      return {
        totalSessions,
        completedSessions,
        pendingDebt,
        activeBonos,
        remainingBonoSessions,
      };
    },
  });

  const calculateAge = (dateOfBirth: string | null) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const age = calculateAge(patient.date_of_birth);

  return (
    <div className="space-y-6">
      {/* Patient Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:gap-6 sm:flex-row sm:items-start">
            <Avatar className="h-16 w-16 sm:h-24 sm:w-24 border-4 border-primary/10 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xl sm:text-2xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap">
                <h2 className="font-display text-xl sm:text-2xl font-bold break-words">
                  {patient.first_name} {patient.last_name}
                </h2>
                <div className="flex gap-2 flex-wrap justify-center sm:justify-start">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  {patient.is_minor && (
                    <Badge variant="outline" className="border-warning text-warning">
                      Menor
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 sm:mt-4 grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {patient.email && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="truncate">{patient.email}</span>
                  </div>
                )}
                {patient.phone && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>{patient.phone}</span>
                  </div>
                )}
                {patient.date_of_birth && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span>
                      {format(new Date(patient.date_of_birth), "d MMM yyyy", { locale: es })}
                      {age !== null && ` (${age} años)`}
                    </span>
                  </div>
                )}
                {(patient.city || patient.address) && (
                  <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                    <span className="truncate">{patient.city || patient.address}</span>
                  </div>
                )}
              </div>

              {patient.assigned_professional && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-primary" />
                  <span className="text-primary font-medium">
                    {patient.assigned_professional.first_name} {patient.assigned_professional.last_name}
                  </span>
                  {patient.assigned_professional.specialty && (
                    <span className="text-muted-foreground">
                      · {patient.assigned_professional.specialty}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sesiones
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalSessions || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.completedSessions || 0} completadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bonos activos
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeBonos || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.remainingBonoSessions || 0} sesiones restantes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Deuda pendiente
            </CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats?.pendingDebt && stats.pendingDebt > 0 ? 'text-destructive' : ''}`}>
              {stats?.pendingDebt ? `${stats.pendingDebt.toFixed(2)}€` : '0€'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.pendingDebt && stats.pendingDebt > 0 ? 'Pagos pendientes' : 'Sin deuda'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Alta en sistema
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {format(new Date(patient.created_at), "d MMM", { locale: es })}
            </div>
            <p className="text-xs text-muted-foreground">
              {format(new Date(patient.created_at), "yyyy", { locale: es })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Guardian Info (if minor) */}
      {patient.is_minor && patient.guardian_name && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-warning" />
              Tutor/Responsable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Nombre</p>
                <p className="font-medium">{patient.guardian_name}</p>
              </div>
              {patient.guardian_relationship && (
                <div>
                  <p className="text-sm text-muted-foreground">Relación</p>
                  <p className="font-medium capitalize">{patient.guardian_relationship}</p>
                </div>
              )}
              {patient.guardian_phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Teléfono</p>
                  <p className="font-medium">{patient.guardian_phone}</p>
                </div>
              )}
              {patient.guardian_email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{patient.guardian_email}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {patient.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{patient.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
