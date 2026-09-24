import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';
import { supabase } from '@/integrations/supabase/client';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';

interface CoupleCancellationInfo {
  status: 'pending' | 'cancelled_both' | 'converted_individual' | 'expired_cancelled' | 'withdrawn';
  deadline_at: string;
  requester_first_name: string;
  other_first_name: string;
  session: { date: string; start_time: string; end_time: string; modality: string | null } | null;
  center: { name: string; logo_url: string | null } | null;
}

type Decision = 'cancel_both' | 'attend_alone';

const RESOLVED_TEXT: Record<Exclude<CoupleCancellationInfo['status'], 'pending'>, string> = {
  cancelled_both: 'La sesión se ha cancelado para los dos.',
  expired_cancelled: 'El plazo para responder terminó y la sesión se canceló para los dos.',
  converted_individual: 'La sesión se mantiene como sesión individual.',
  withdrawn: 'Esta solicitud ya no está activa.',
};

/**
 * /pareja/cancelacion/:token — el otro miembro de una sesión de pareja decide si
 * también cancela o asiste solo. El enlace solo se le envía a él.
 */
export default function CoupleCancellationResponse() {
  const { token } = useParams<{ token: string }>();
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ['couple-cancellation', token],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('couple-cancellation', {
        body: { action: 'get', token },
      });
      if (error) throw new Error(await describeEdgeFunctionError(error, 'Enlace no válido o caducado.'));
      return data as CoupleCancellationInfo;
    },
    enabled: !!token,
    retry: false,
  });

  const respond = async (decision: Decision) => {
    setSubmitting(decision);
    setError(null);
    try {
      const { data: response, error } = await supabase.functions.invoke('couple-cancellation', {
        body: { action: 'respond', token, decision },
      });
      if (error) throw new Error(await describeEdgeFunctionError(error, 'No se pudo registrar tu respuesta.'));
      setResult((response as { message?: string })?.message ?? 'Respuesta registrada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar tu respuesta.');
    } finally {
      setSubmitting(null);
    }
  };

  const sessionWhen = data?.session
    ? `${format(parseISO(data.session.date), "EEEE d 'de' MMMM", { locale: es })} a las ${data.session.start_time.slice(0, 5)}`
    : '';
  const deadline = data?.deadline_at
    ? format(new Date(data.deadline_at), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })
    : '';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {data?.center?.logo_url && (
            <img src={data.center.logo_url} alt={data.center.name} className="mx-auto mb-2 h-12 object-contain" />
          )}
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Icon name="favorite" className="h-7 w-7 text-primary" />
          </div>
          <CardTitle>Sesión de pareja</CardTitle>
          {data?.center?.name && <CardDescription>{data.center.name}</CardDescription>}
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {loadError && (
            <p className="text-center text-sm text-destructive">
              {loadError instanceof Error ? loadError.message : 'Enlace no válido o caducado.'}
            </p>
          )}

          {result && (
            <div className="rounded-lg bg-muted p-4 text-center text-sm">
              <Icon name="check_circle" className="mx-auto mb-2 h-8 w-8 text-primary" />
              {result}
            </div>
          )}

          {data && !result && data.status !== 'pending' && (
            <p className="rounded-lg bg-muted p-4 text-center text-sm">{RESOLVED_TEXT[data.status]}</p>
          )}

          {data && !result && data.status === 'pending' && (
            <>
              <p className="text-center">
                Hola {data.other_first_name}, <strong>{data.requester_first_name}</strong> ha cancelado su
                asistencia a la sesión de pareja del <strong>{sessionWhen}</strong>.
              </p>
              <p className="text-center text-sm text-muted-foreground">
                ¿Quieres asistir tú solo/a o cancelar también? Tienes hasta el {deadline}. Si no respondes,
                la sesión se cancelará para los dos.
              </p>

              {error && <p className="text-center text-sm text-destructive">{error}</p>}

              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  disabled={submitting !== null}
                  onClick={() => respond('attend_alone')}
                >
                  {submitting === 'attend_alone' ? (
                    <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="person" className="mr-2 h-4 w-4" />
                  )}
                  Asistiré en sesión individual
                </Button>
                <Button
                  className="w-full"
                  size="lg"
                  variant="outline"
                  disabled={submitting !== null}
                  onClick={() => respond('cancel_both')}
                >
                  {submitting === 'cancel_both' ? (
                    <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="event_busy" className="mr-2 h-4 w-4" />
                  )}
                  Yo también cancelo
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                Si asistes solo/a, la sesión pasará a ser individual a tu nombre.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
