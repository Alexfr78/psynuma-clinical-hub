import type { KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import type { Professional } from '@/hooks/useProfessionals';
import { Icon } from '@/components/ui/icon';

interface ProfessionalCardProps {
  professional: Professional;
  onClick: () => void;
}

export function ProfessionalCard({ professional, onClick }: ProfessionalCardProps) {
  const initials = `${professional.first_name?.[0] || ''}${professional.last_name?.[0] || ''}`.toUpperCase() || 'P';
  const isAdmin = professional.roles.includes('admin');
  const fullName = `${professional.first_name || ''} ${professional.last_name || ''}`.trim();

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Ver ficha de ${fullName || 'profesional'}`}
    >
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={professional.avatar_url || undefined} alt="" />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-base break-words">
                {professional.first_name} {professional.last_name}
              </CardTitle>
              {professional.specialty && (
                <p className="text-sm text-muted-foreground">{professional.specialty}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge variant={professional.is_active ? 'default' : 'secondary'}>
              {professional.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Badge
              variant="outline"
              className={isAdmin ? 'border-primary/30 bg-primary/5 text-primary' : undefined}
            >
              {isAdmin ? (
                <Icon name="verified_user" className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <Icon name="person" className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {isAdmin ? 'Administrador' : 'Profesional'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {professional.email && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="mail" className="h-4 w-4" aria-hidden="true" />
            <span className="truncate">{professional.email}</span>
          </div>
        )}
        {professional.phone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="call" className="h-4 w-4" aria-hidden="true" />
            <span>{professional.phone}</span>
          </div>
        )}
        {professional.license_number && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="military_tech" className="h-4 w-4" aria-hidden="true" />
            <span>Nº Col: {professional.license_number}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="percent" className="h-4 w-4" aria-hidden="true" />
          <span>Comisión: {professional.commission_rate || 0}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
