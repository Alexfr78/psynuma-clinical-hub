import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Patient } from '@/hooks/usePatients';
import type { PatientSessionSummary } from '@/hooks/usePatientSessionSummaries';
import { PatientStatusBadge } from './PatientStatusBadge';
import { Icon } from '@/components/ui/icon';

type PatientRow = Patient & {
  assigned_professional?: { id: string; first_name: string | null; last_name: string | null } | null;
  status_source?: string | null;
};

interface PatientTableProps {
  patients: PatientRow[];
  sessionSummaries?: Map<string, PatientSessionSummary>;
}

function initials(firstName?: string | null, lastName?: string | null) {
  return `${(firstName?.[0] || '').toUpperCase()}${(lastName?.[0] || '').toUpperCase()}` || '?';
}

export function PatientTable({ patients, sessionSummaries }: PatientTableProps) {
  const navigate = useNavigate();

  return (
    <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-1/4 px-6 py-4 text-sm font-medium text-muted-foreground">Contacto</th>
            <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Teléfono</th>
            <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Última sesión</th>
            <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Próxima cita</th>
            <th className="px-6 py-4 text-sm font-medium text-muted-foreground">Estado</th>
            <th className="w-12 px-6 py-4" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {patients.map((patient) => {
            const summary = sessionSummaries?.get(patient.id);
            return (
              <tr
                key={patient.id}
                onClick={() => navigate(`/pacientes/${patient.id}`)}
                className="group h-16 cursor-pointer transition-colors hover:bg-muted/50"
              >
                <td className="px-6 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initials(patient.first_name, patient.last_name)}
                    </div>
                    <p className="truncate font-medium transition-colors group-hover:text-primary">
                      {patient.first_name} {patient.last_name}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-2 tabular-nums text-muted-foreground">{patient.phone || '-'}</td>
                <td className="px-6 py-2 tabular-nums">
                  {summary?.lastSessionDate
                    ? format(new Date(summary.lastSessionDate + 'T00:00:00'), 'd MMM yyyy', { locale: es })
                    : <span className="text-muted-foreground">-</span>}
                </td>
                <td className="px-6 py-2">
                  {summary?.nextSessionDate ? (
                    <div className="flex items-center gap-1.5 font-medium tabular-nums text-primary">
                      <Icon name="event" className="h-4 w-4" />
                      {format(new Date(summary.nextSessionDate + 'T00:00:00'), 'd MMM', { locale: es })}
                      {summary.nextSessionTime && `, ${summary.nextSessionTime.slice(0, 5)}`}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Sin programar</span>
                  )}
                </td>
                <td className="px-6 py-2">
                  <PatientStatusBadge status={patient.status || 'active'} statusSource={patient.status_source} />
                </td>
                <td className="px-6 py-2 text-right">
                  <Icon name="chevron_right" className="ml-auto h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
