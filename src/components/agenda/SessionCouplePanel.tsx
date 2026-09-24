import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PatientSelector } from './PatientSelector';
import { useToast } from '@/hooks/use-toast';
import { useUpdateSession } from '@/hooks/useSessions';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  usePatientPartner,
  usePendingCoupleCancellation,
  useResolveCoupleCancellation,
  useSessionParticipants,
  useSetSessionPartner,
} from '@/hooks/usePatientRelationships';

interface SessionCouplePanelProps {
  session: {
    id: string;
    patient_id: string | null;
    payment_status?: string | null;
    patient?: { first_name: string; last_name: string } | null;
  };
  onNavigate?: () => void;
}

/**
 * Segundo miembro de una sesión de pareja dentro del detalle de la cita:
 * ver quién es, cambiar quién paga o quitarlo/añadirlo.
 */
export function SessionCouplePanel({ session, onNavigate }: SessionCouplePanelProps) {
  const { toast } = useToast();
  const { data: participants } = useSessionParticipants(session.id);
  const { data: link } = usePatientPartner(session.patient_id ?? undefined);
  const setPartner = useSetSessionPartner();
  const updateSession = useUpdateSession();
  const { data: pendingCancellation } = usePendingCoupleCancellation(session.id);
  const resolveCancellation = useResolveCoupleCancellation();
  const [choosing, setChoosing] = useState(false);

  if (!session.patient_id || participants === undefined) return null;

  const partner = participants[0];
  const payerName = session.patient ? `${session.patient.first_name} ${session.patient.last_name}` : '';
  // Cambiar el titular reasigna la deuda y la factura: solo mientras no esté pagada.
  const canSwapPayer = session.payment_status !== 'paid';

  const onError = (error: unknown) =>
    toast({
      title: 'No se pudo actualizar la sesión',
      description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
      variant: 'destructive',
    });

  const addPartner = (partnerId: string) =>
    setPartner
      .mutateAsync({ sessionId: session.id, partnerId })
      .then(() => {
        setChoosing(false);
        toast({ title: 'Sesión de pareja', description: 'Se ha añadido el otro miembro.' });
      })
      .catch(onError);

  if (!partner) {
    if (choosing) {
      return (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">Añadir el otro miembro de la pareja</p>
          <PatientSelector
            onSelect={addPartner}
            excludeIds={[session.patient_id]}
            placeholder="Buscar contacto..."
            disabled={setPartner.isPending}
          />
          <Button variant="ghost" size="sm" onClick={() => setChoosing(false)}>
            Cancelar
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {link && (
          <Button
            variant="outline"
            size="sm"
            disabled={setPartner.isPending}
            onClick={() => addPartner(link.partner.id)}
          >
            <Icon name="favorite" className="mr-1.5 h-4 w-4" />
            Hacerla de pareja con {link.partner.first_name}
          </Button>
        )}
        {!link && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setChoosing(true)}>
            <Icon name="group_add" className="mr-1.5 h-4 w-4" />
            Añadir pareja a esta sesión
          </Button>
        )}
      </div>
    );
  }

  const memberName = (id: string) =>
    id === partner.id ? partner.first_name : session.patient?.first_name ?? 'El titular';

  const resolve = (decision: 'cancel_both' | 'attend_alone') =>
    pendingCancellation &&
    resolveCancellation
      .mutateAsync({ requestId: pendingCancellation.id, decision })
      .then((result) => toast({ title: result.message }))
      .catch(onError);

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
      {pendingCancellation && (
        <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          <p>
            <span className="font-medium">{memberName(pendingCancellation.requested_by_patient_id)}</span> ha
            cancelado. Esperando a que {memberName(pendingCancellation.other_patient_id)} confirme si asiste
            solo/a o cancela también (hasta el{' '}
            {format(new Date(pendingCancellation.deadline_at), "d 'de' MMMM 'a las' HH:mm", { locale: es })}).
          </p>
          {pendingCancellation.charge_applies && (
            <p className="text-xs text-muted-foreground">
              Si se cancela, cargo estimado a {memberName(pendingCancellation.requested_by_patient_id)}:{' '}
              {Number(pendingCancellation.charge_amount ?? 0).toFixed(2)} €
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={resolveCancellation.isPending} onClick={() => resolve('attend_alone')}>
              Individual para {memberName(pendingCancellation.other_patient_id)}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" disabled={resolveCancellation.isPending} onClick={() => resolve('cancel_both')}>
              Cancelar para los dos
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <Icon name="favorite" className="h-4 w-4 text-primary" />
        <span>
          Sesión de pareja con{' '}
          <Link
            to={`/pacientes/${partner.id}`}
            className="font-medium text-primary hover:underline"
            onClick={onNavigate}
          >
            {partner.first_name} {partner.last_name}
          </Link>
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Paga y recibe la factura: {payerName}. Los avisos de la cita llegan a los dos.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canSwapPayer || updateSession.isPending}
          title={canSwapPayer ? undefined : 'La sesión ya está pagada'}
          onClick={() =>
            updateSession
              .mutateAsync({ id: session.id, patient_id: partner.id })
              .then(() => toast({ title: `Ahora paga ${partner.first_name}` }))
              .catch(onError)
          }
        >
          Que pague {partner.first_name}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={setPartner.isPending}
          onClick={() =>
            setPartner
              .mutateAsync({ sessionId: session.id, partnerId: null })
              .then(() => toast({ title: 'Ahora es una sesión individual' }))
              .catch(onError)
          }
        >
          Quitar a {partner.first_name}
        </Button>
      </div>
    </div>
  );
}
