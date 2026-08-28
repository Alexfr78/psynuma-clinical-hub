import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/hooks/usePatients';
import { PatientStatusBadge } from './PatientStatusBadge';
import { Icon } from '@/components/ui/icon';

interface PatientCardProps {
  patient: Patient & {
    assigned_professional?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
    status_source?: string | null;
    status_reason?: string | null;
  };
}

export function PatientCard({ patient }: PatientCardProps) {
  const navigate = useNavigate();

  const initials = `${patient.first_name?.[0] || ''}${patient.last_name?.[0] || ''}`.toUpperCase();

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
    <Card 
      className="group cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:border-primary/20"
      onClick={() => navigate(`/pacientes/${patient.id}`)}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3 sm:gap-4">
          <Avatar className="h-10 w-10 sm:h-12 sm:w-12 border-2 border-primary/10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-sm sm:text-base">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-foreground text-sm sm:text-base truncate">
                {patient.first_name} {patient.last_name}
              </h3>
              <PatientStatusBadge 
                status={patient.status || 'active'} 
                statusSource={patient.status_source}
                className="shrink-0"
              />
            </div>

            <div className="mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1">
              {patient.email && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Icon name="mail" className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span className="truncate">{patient.email}</span>
                </div>
              )}
              {patient.phone && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Icon name="call" className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  <span>{patient.phone}</span>
                </div>
              )}
              {patient.date_of_birth && (
                <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
                  <Icon name="calendar_month" className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {format(new Date(patient.date_of_birth), "d MMM yyyy", { locale: es })}
                    {age !== null && ` (${age} años)`}
                  </span>
                </div>
              )}
            </div>

            {patient.assigned_professional && (
              <div className="mt-2 sm:mt-3 flex items-center gap-2">
                <Icon name="person" className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
                <span className="text-xs sm:text-sm text-primary truncate">
                  {patient.assigned_professional.first_name} {patient.assigned_professional.last_name}
                </span>
              </div>
            )}
          </div>

          <Icon name="chevron_right" className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}
