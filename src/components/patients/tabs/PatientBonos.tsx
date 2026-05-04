import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Ticket, Calendar, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { BonoSessionsDialog } from '@/components/patients/BonoSessionsDialog';

interface PatientBonosProps {
  patientId: string;
}

const statusConfig = {
  active: { label: 'Activo', variant: 'default' as const },
  exhausted: { label: 'Agotado', variant: 'secondary' as const },
  expired: { label: 'Expirado', variant: 'destructive' as const },
  cancelled: { label: 'Cancelado', variant: 'outline' as const },
};

export function PatientBonos({ patientId }: PatientBonosProps) {
  const { data: bonos, isLoading } = useQuery({
    queryKey: ['patient-bonos', patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bonos')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!bonos || bonos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        <Ticket className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 font-display text-lg font-semibold">Sin bonos</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Este contacto no tiene bonos de sesiones asignados.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bonos.map((bono) => {
        const status = statusConfig[bono.status as keyof typeof statusConfig] || statusConfig.active;
        const usedSessions = bono.used_sessions || 0;
        const remainingSessions = bono.total_sessions - usedSessions;
        const progressPercentage = (usedSessions / bono.total_sessions) * 100;
        const isExpiringSoon = bono.expires_at && new Date(bono.expires_at) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        return (
          <Card key={bono.id} className="transition-colors hover:bg-muted/50">
            <CardContent className="p-4">
              <div className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Ticket className="h-5 w-5 text-primary shrink-0" />
                    <span className="font-semibold truncate max-w-[200px] sm:max-w-none">{bono.name}</span>
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {isExpiringSoon && bono.status === 'active' && (
                      <Badge variant="outline" className="border-warning text-warning">
                        <AlertCircle className="mr-1 h-3 w-3" />
                        Expira pronto
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-right">
                    <p className="text-lg font-semibold">{Number(bono.total_price).toFixed(2)}€</p>
                    <p className="text-xs text-muted-foreground">
                      {Number(bono.price_per_session).toFixed(2)}€/sesión
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {usedSessions} de {bono.total_sessions} sesiones usadas
                    </span>
                    <span className="font-medium text-primary">
                      {remainingSessions} restantes
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      Creado: {format(new Date(bono.created_at), "d MMM yyyy", { locale: es })}
                    </span>
                  </div>
                  {bono.expires_at && (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>
                        Expira: {format(new Date(bono.expires_at), "d MMM yyyy", { locale: es })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
