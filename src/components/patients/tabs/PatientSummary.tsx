import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Patient } from '@/hooks/usePatients';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Icon } from '@/components/ui/icon';
import { usePatientConsentPurposes } from '@/hooks/usePatientConsentPurposes';
import { countGrantedConsentPurposes } from '@/lib/consent-block-messages';

interface PatientSummaryProps {
  patient: Patient & {
    assigned_professional?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      specialty: string | null;
    } | null;
    status_source?: string | null;
    status_reason?: string | null;
  };
  /** Switches the parent detail view to the "Documentos clínicos > Consentimientos" tab. */
  onNavigateToConsents?: () => void;
}

export function PatientSummary({ patient, onNavigateToConsents }: PatientSummaryProps) {
  const { results: consentResults, isLoading: isConsentLoading, isError: isConsentError } =
    usePatientConsentPurposes(patient.id);
  const { granted: grantedPurposes, total: totalPurposes } = countGrantedConsentPurposes(consentResults);
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

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sesiones
            </CardTitle>
            <Icon name="schedule" className="h-4 w-4 text-muted-foreground" />
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
            <Icon name="trending_up" className="h-4 w-4 text-muted-foreground" />
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
            <Icon name="credit_card" className="h-4 w-4 text-muted-foreground" />
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
            <Icon name="description" className="h-4 w-4 text-muted-foreground" />
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

        <Card
          role={onNavigateToConsents ? 'button' : undefined}
          tabIndex={onNavigateToConsents ? 0 : undefined}
          onClick={onNavigateToConsents}
          onKeyDown={(e) => {
            if (onNavigateToConsents && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onNavigateToConsents();
            }
          }}
          className={
            onNavigateToConsents
              ? 'cursor-pointer transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring'
              : undefined
          }
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Permisos
            </CardTitle>
            <Icon name="verified_user" className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isConsentLoading ? (
              <div className="text-2xl font-bold text-muted-foreground">…</div>
            ) : isConsentError ? (
              <div className="text-sm font-medium text-destructive">No se pudo comprobar</div>
            ) : (
              <div className="text-2xl font-bold">
                {grantedPurposes} de {totalPurposes}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isConsentLoading
                ? 'Comprobando…'
                : isConsentError
                  ? 'Inténtalo de nuevo'
                  : 'Ver consentimientos'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Guardian Info (if minor) */}
      {patient.is_minor && patient.guardian_name && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon name="error" className="h-4 w-4 text-warning" />
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
