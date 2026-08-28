import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Patient } from '@/hooks/usePatients';
import { PatientStatusBadge } from './PatientStatusBadge';
import { PatientStatusToggle } from './PatientStatusToggle';
import { Icon } from '@/components/ui/icon';

interface PatientHeaderProps {
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
  onEditClick?: () => void;
}

function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function PatientHeader({ patient, onEditClick }: PatientHeaderProps) {
  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();
  const age = calculateAge(patient.date_of_birth);

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-card sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative z-10 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-background bg-primary/10 text-2xl font-semibold text-primary shadow-sm sm:h-28 sm:w-28 sm:text-3xl">
          {initials}
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap sm:justify-between">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              <h2 className="break-words font-display text-xl font-bold sm:text-2xl">
                {patient.first_name} {patient.last_name}
              </h2>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <PatientStatusBadge
                  status={patient.status || 'active'}
                  statusSource={patient.status_source}
                  statusReason={patient.status_reason}
                  showReason
                />
                {patient.is_minor && (
                  <Badge variant="outline" className="border-warning text-warning">
                    Menor
                  </Badge>
                )}
              </div>
            </div>
            <PatientStatusToggle
              patientId={patient.id}
              currentStatus={patient.status || 'active'}
              statusSource={patient.status_source}
            />
          </div>

          {age !== null && (
            <p className="mt-1 text-sm text-muted-foreground">{age} años</p>
          )}

          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            {patient.phone && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                <Icon name="call" className="h-4 w-4" />
                {patient.phone}
              </span>
            )}
            {patient.email && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                <Icon name="mail" className="h-4 w-4" />
                <span className="max-w-[220px] truncate">{patient.email}</span>
              </span>
            )}
            {(patient.city || patient.address) && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm text-muted-foreground">
                <Icon name="location_on" className="h-4 w-4" />
                <span className="max-w-[220px] truncate">{patient.city || patient.address}</span>
              </span>
            )}
            {onEditClick && (
              <Button variant="ghost" size="sm" className="ml-auto text-primary hover:bg-primary/10" onClick={onEditClick}>
                <Icon name="edit" className="mr-1.5 h-4 w-4" />
                Editar perfil
              </Button>
            )}
          </div>

          {patient.assigned_professional && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm sm:justify-start">
              <Icon name="person" className="h-4 w-4 text-primary" />
              <span className="font-medium text-primary">
                {patient.assigned_professional.first_name} {patient.assigned_professional.last_name}
              </span>
              {patient.assigned_professional.specialty && (
                <span className="text-muted-foreground">· {patient.assigned_professional.specialty}</span>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Contacto desde {format(new Date(patient.created_at), "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
      </div>
    </div>
  );
}
