import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PatientSelector } from './PatientSelector';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  usePatientPartner,
  usePendingCoupleCancellation,
  useResolveCoupleCancellation,
  useSessionMemberConfirmations,
  useSessionParticipants,
  useSetSessionPartner,
  useSwapCouplePayer,
  type PayerSwapScope,
} from '@/hooks/usePatientRelationships';

const CONFIRMATION_VIA_LABELS: Record<string, string> = {
  session_link: 'por el enlace de la cita',
  portal: 'desde el portal',
  whatsapp: 'por WhatsApp',
  professional: 'desde la agenda',
  system: 'automáticamente',
};

interface SessionCouplePanelProps {
  session: {
    id: string;
    patient_id: string | null;
    status?: string | null;
    recurring_series_id?: string | null;
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
  const swapPayer = useSwapCouplePayer();
  const { data: confirmations } = useSessionMemberConfirmations(session.id);
  const { data: pendingCancellation } = usePendingCoupleCancellation(session.id);
  const resolveCancellation = useResolveCoupleCancellation();
  const [choosing, setChoosing] = useState(false);
  const [choosingPayerScope, setChoosingPayerScope] = useState(false);

  if (!session.patient_id || participants === undefined) return null;

  const partner = participants[0];
  const payerName = session.patient ? `${session.patient.first_name} ${session.patient.last_name}` : '';
  // El servidor bloquea además si ya hay factura o cobros registrados.
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

  const swap = (scope: PayerSwapScope) =>
    swapPayer
      .mutateAsync({ sessionId: session.id, scope })
      .then(({ changed, skipped }) => {
        setChoosingPayerScope(false);
        toast({
          title: `Ahora paga ${partner.first_name}`,
          description: scope === 'following'
            ? `${changed} ${changed === 1 ? 'cita actualizada' : 'citas actualizadas'}${skipped ? `; ${skipped} sin cambiar porque ya están facturadas o cobradas` : ''}.`
            : undefined,
        });
      })
      .catch(onError);

  const members = [
    { id: session.patient_id, name: session.patient?.first_name ?? 'Titular' },
    { id: partner.id, name: partner.first_name },
  ];
  const showConfirmations = ['scheduled', 'confirmed'].includes(session.status ?? '');
  const memberState = (id: string) => {
    if (pendingCancellation?.requested_by_patient_id === id) return { icon: 'cancel', tone: 'text-destructive', text: 'Ha cancelado' };
    const confirmation = confirmations?.find((c) => c.patient_id === id);
    if (confirmation) {
      return {
        icon: 'check_circle',
        tone: 'text-primary',
        text: `Confirmado ${CONFIRMATION_VIA_LABELS[confirmation.via] ?? ''} · ${format(new Date(confirmation.confirmed_at), "d MMM, HH:mm", { locale: es })}`,
      };
    }
    if (session.status === 'confirmed') return { icon: 'check_circle', tone: 'text-primary', text: 'Confirmado' };
    return { icon: 'schedule', tone: 'text-muted-foreground', text: 'Pendiente de confirmar' };
  };

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
      {showConfirmations && (
        <ul className="space-y-1 text-sm" aria-label="Confirmación de asistencia">
          {members.map((member) => {
            const state = memberState(member.id);
            return (
              <li key={member.id} className="flex items-center gap-2">
                <Icon name={state.icon} className={`h-4 w-4 shrink-0 ${state.tone}`} />
                <span className="font-medium">{member.name}</span>
                <span className="text-muted-foreground">{state.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Paga y recibe la factura: {payerName}. Los avisos de la cita llegan a los dos.
      </p>
      {choosingPayerScope && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-sm">
          <span>¿A qué citas aplicar el cambio?</span>
          <Button size="sm" variant="outline" disabled={swapPayer.isPending} onClick={() => swap('single')}>
            Solo esta
          </Button>
          <Button size="sm" variant="outline" disabled={swapPayer.isPending} onClick={() => swap('following')}>
            Esta y las siguientes
          </Button>
          <Button size="sm" variant="ghost" disabled={swapPayer.isPending} onClick={() => setChoosingPayerScope(false)}>
            Cancelar
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canSwapPayer || swapPayer.isPending || choosingPayerScope}
          title={canSwapPayer ? undefined : 'La sesión ya está pagada'}
          onClick={() => (session.recurring_series_id ? setChoosingPayerScope(true) : swap('single'))}
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
