import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { qk } from '@/lib/query-keys';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type UntypedRpcCall = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

interface RepriceCandidate {
  session_id: string;
  session_date: string;
  start_time: string;
  session_type_name: string | null;
  old_price: number;
  new_price: number;
}

interface RepriceResult {
  applied: boolean;
  sessions: RepriceCandidate[];
}

async function repriceFutureSessions(patientId: string, apply: boolean): Promise<RepriceResult> {
  const { data, error } = await (supabase.rpc as unknown as UntypedRpcCall)('reprice_future_sessions', {
    p_patient_id: patientId,
    p_apply: apply,
  });
  if (error) throw new Error(error.message);
  return data as RepriceResult;
}

const formatEuros = (value: number) => `${Number(value).toFixed(2)} €`;

interface RepriceFutureSessionsDialogProps {
  patientId: string;
  /** Se incrementa tras cada cambio de tarifa; cada cambio dispara una comprobación. */
  checkKey: number;
}

/**
 * El precio de una cita se fija al crearla, así que una tarifa nueva o cambiada
 * no llega sola a las citas ya programadas. Tras cada cambio se buscan las citas
 * futuras sin cobro, factura ni bono cuyo precio ya no coincide y se ofrece
 * actualizarlas.
 */
export function RepriceFutureSessionsDialog({ patientId, checkKey }: RepriceFutureSessionsDialogProps) {
  const queryClient = useQueryClient();
  const [candidates, setCandidates] = useState<RepriceCandidate[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (checkKey === 0) return;
    let cancelled = false;
    repriceFutureSessions(patientId, false)
      .then(result => {
        if (!cancelled) setCandidates(result.sessions ?? []);
      })
      .catch(error => {
        console.error('No se pudieron revisar los precios de las citas futuras:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, checkKey]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await repriceFutureSessions(patientId, true);
      const count = result.sessions?.length ?? 0;
      queryClient.invalidateQueries({ queryKey: qk.sessions.all });
      queryClient.invalidateQueries({ queryKey: qk.patientSessions.all });
      toast.success(`Precio actualizado en ${count} cita${count !== 1 ? 's' : ''}`);
      setCandidates([]);
    } catch (error) {
      toast.error('No se pudieron actualizar los precios: ' + (error as Error).message);
    } finally {
      setApplying(false);
    }
  };

  const count = candidates.length;

  return (
    <AlertDialog open={count > 0} onOpenChange={(open) => { if (!open && !applying) setCandidates([]); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {count === 1 ? 'Hay 1 cita futura con otro precio' : `Hay ${count} citas futuras con otro precio`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Estas citas se crearon antes del cambio de tarifa. Solo se muestran las que no tienen cobro, factura ni bono.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-64 overflow-y-auto divide-y rounded-md border text-sm">
          {candidates.map(c => (
            <li key={c.session_id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="font-medium">
                  {format(new Date(`${c.session_date}T00:00:00`), "EEE d MMM", { locale: es })}
                </span>{' '}
                <span className="text-muted-foreground">
                  {c.start_time.slice(0, 5)}{c.session_type_name ? ` · ${c.session_type_name}` : ''}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="text-muted-foreground line-through">{formatEuros(c.old_price)}</span>{' '}
                <span className="font-medium">{formatEuros(c.new_price)}</span>
              </span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={applying}>Dejarlas como están</AlertDialogCancel>
          <AlertDialogAction
            disabled={applying}
            onClick={(e) => {
              e.preventDefault();
              void handleApply();
            }}
          >
            {applying ? 'Actualizando…' : 'Actualizar precios'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
