import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, AlertTriangle, User } from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import { es } from 'date-fns/locale';
import { BonoWithPatient } from '@/hooks/useBonos';
import { getBonoStatusDisplay } from '@/lib/payment-status';

interface BonoCardProps {
  bono: BonoWithPatient;
  onClick?: () => void;
}

export function BonoCard({ bono, onClick }: BonoCardProps) {
  const usedSessions = bono.used_sessions || 0;
  const availableSessions = bono.total_sessions - usedSessions;
  const progress = (usedSessions / bono.total_sessions) * 100;
  
  const isExpiringSoon = bono.expires_at && 
    differenceInDays(new Date(bono.expires_at), new Date()) <= 7 &&
    differenceInDays(new Date(bono.expires_at), new Date()) > 0;

  const isExpired = bono.expires_at && isPast(new Date(bono.expires_at));
  
  const status = getBonoStatusDisplay(bono.status);

  return (
    <Card 
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0 flex-1">
            <CardTitle className="text-base font-semibold truncate">{bono.name}</CardTitle>
            {bono.patients && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {bono.patients.first_name} {bono.patients.last_name}
                </span>
              </div>
            )}
          </div>
          <Badge variant={status.variant} className="flex-shrink-0">
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Advertencia de expiración próxima */}
        {isExpiringSoon && bono.status === 'active' && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-sm bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>Expira en {differenceInDays(new Date(bono.expires_at!), new Date())} días</span>
          </div>
        )}

        {/* Contador de sesiones */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Sesiones</span>
            <span className="font-medium tabular-nums text-right whitespace-nowrap">
              <span className="text-primary">{availableSessions}</span>
              <span className="text-muted-foreground"> / {bono.total_sessions}</span>
              <span className="text-muted-foreground hidden sm:inline"> disponibles</span>
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Usadas: {usedSessions}</span>
            <span>Restantes: {availableSessions}</span>
          </div>
        </div>

        {/* Precios */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/50 rounded-md p-2">
            <p className="text-muted-foreground text-xs">Precio/sesión</p>
            <p className="font-semibold">{bono.price_per_session.toFixed(2)} €</p>
          </div>
          <div className="bg-muted/50 rounded-md p-2">
            <p className="text-muted-foreground text-xs">Total bono</p>
            <p className="font-semibold">{bono.total_price.toFixed(2)} €</p>
          </div>
        </div>

        {/* Fechas */}
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground border-t pt-3">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Creado: {format(new Date(bono.created_at), "d MMM yyyy", { locale: es })}</span>
          </div>
          {bono.expires_at && (
            <div className={`flex items-center gap-1.5 ${isExpired ? 'text-destructive' : ''}`}>
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {isExpired ? 'Expiró' : 'Expira'}: {format(new Date(bono.expires_at), "d MMM yyyy", { locale: es })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
