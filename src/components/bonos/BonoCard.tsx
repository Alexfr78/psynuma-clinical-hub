import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Package, AlertTriangle, User } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { BonoWithPatient } from '@/hooks/useBonos';

interface BonoCardProps {
  bono: BonoWithPatient;
  onClick?: () => void;
}

const statusConfig = {
  active: { label: 'Activo', variant: 'default' as const },
  exhausted: { label: 'Agotado', variant: 'secondary' as const },
  expired: { label: 'Expirado', variant: 'destructive' as const },
  cancelled: { label: 'Cancelado', variant: 'outline' as const },
};

export function BonoCard({ bono, onClick }: BonoCardProps) {
  const status = statusConfig[bono.status] || statusConfig.active;
  const progress = (bono.used_sessions / bono.total_sessions) * 100;
  const remainingSessions = bono.total_sessions - bono.used_sessions;

  const isExpiringSoon = bono.expires_at && bono.status === 'active' &&
    new Date(bono.expires_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return (
    <Card 
      className="transition-all hover:shadow-md cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">{bono.name}</h3>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{bono.patients.first_name} {bono.patients.last_name}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={status.variant}>{status.label}</Badge>
              {isExpiringSoon && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Expira pronto
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Sesiones usadas</span>
              <span className="font-medium">
                {bono.used_sessions} / {bono.total_sessions}
              </span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {remainingSessions} sesiones restantes
            </p>
          </div>

          <div className="flex justify-between items-center pt-2 border-t">
            <div className="text-sm">
              <span className="text-muted-foreground">Precio/sesión: </span>
              <span className="font-medium">{Number(bono.price_per_session).toFixed(2)}€</span>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">{Number(bono.total_price).toFixed(2)}€</p>
              {bono.expires_at && (
                <p className="text-xs text-muted-foreground">
                  Expira: {format(new Date(bono.expires_at), "d MMM yyyy", { locale: es })}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
