import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Mail, Phone, Award, Percent } from 'lucide-react';
import type { Profile } from '@/hooks/useProfessionals';

interface ProfessionalCardProps {
  professional: Profile;
  onClick: () => void;
}

export function ProfessionalCard({ professional, onClick }: ProfessionalCardProps) {
  const initials = `${professional.first_name?.[0] || ''}${professional.last_name?.[0] || ''}`.toUpperCase() || 'P';

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={professional.avatar_url || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-base">
                {professional.first_name} {professional.last_name}
              </CardTitle>
              {professional.specialty && (
                <p className="text-sm text-muted-foreground">{professional.specialty}</p>
              )}
            </div>
          </div>
          <Badge variant={professional.is_active ? 'default' : 'secondary'}>
            {professional.is_active ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {professional.email && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span className="truncate">{professional.email}</span>
          </div>
        )}
        {professional.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            <span>{professional.phone}</span>
          </div>
        )}
        {professional.license_number && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Award className="h-4 w-4" />
            <span>Nº Col: {professional.license_number}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Percent className="h-4 w-4" />
          <span>Comisión: {professional.commission_rate || 0}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
