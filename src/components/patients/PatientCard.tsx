import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { User, Mail, Phone, Calendar, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Patient } from '@/hooks/usePatients';

interface PatientCardProps {
  patient: Patient & {
    assigned_professional?: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
    } | null;
  };
}

const statusConfig = {
  active: { label: 'Activo', variant: 'default' as const },
  inactive: { label: 'Inactivo', variant: 'secondary' as const },
  discharged: { label: 'Alta', variant: 'outline' as const },
};

export function PatientCard({ patient }: PatientCardProps) {
  const navigate = useNavigate();
  const status = statusConfig[patient.status as keyof typeof statusConfig] || statusConfig.active;

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
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12 border-2 border-primary/10">
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold text-foreground truncate">
                {patient.first_name} {patient.last_name}
              </h3>
              <Badge variant={status.variant} className="shrink-0">
                {status.label}
              </Badge>
            </div>

            <div className="mt-2 space-y-1">
              {patient.email && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3.5 w-3.5" />
                  <span className="truncate">{patient.email}</span>
                </div>
              )}
              {patient.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{patient.phone}</span>
                </div>
              )}
              {patient.date_of_birth && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {format(new Date(patient.date_of_birth), "d MMM yyyy", { locale: es })}
                    {age !== null && ` (${age} años)`}
                  </span>
                </div>
              )}
            </div>

            {patient.assigned_professional && (
              <div className="mt-3 flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm text-primary">
                  {patient.assigned_professional.first_name} {patient.assigned_professional.last_name}
                </span>
              </div>
            )}
          </div>

          <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </CardContent>
    </Card>
  );
}
