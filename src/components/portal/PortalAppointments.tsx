import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SESSION_STATUS_LABELS, getSessionStatusDisplay } from '@/lib/payment-status';
import type { PortalSession } from '@/hooks/usePatientPortal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Icon } from '@/components/ui/icon';

interface PortalAppointmentsProps {
  sessions: PortalSession[];
  loading: boolean;
  onCancel?: (sessionId: string) => Promise<void>;
  onCancellationPreview?: (sessionId: string) => Promise<CancellationPolicyPreview | null>;
  onConfirm?: (sessionId: string) => Promise<void>;
  onReschedule?: (session: PortalSession) => void;
  onSaveCard?: (sessionId: string) => Promise<void> | void;
  isPast?: boolean;
  isCancelled?: boolean;
  emptyMessage?: string;
}

interface CancellationPolicyPreview {
  hasSignedPolicy: boolean;
  applies: boolean;
  amount: number;
  basePrice: number;
  percentage: number;
  concept: string | null;
  message: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: string }> = {
  scheduled: { label: SESSION_STATUS_LABELS.scheduled, variant: 'secondary', icon: 'calendar_month' },
  confirmed: { label: SESSION_STATUS_LABELS.confirmed, variant: 'default', icon: 'check_circle' },
  pending_approval: { label: SESSION_STATUS_LABELS.pending_approval, variant: 'outline', icon: 'error' },
  draft: { label: SESSION_STATUS_LABELS.draft, variant: 'outline', icon: 'credit_card' },
  completed: { label: SESSION_STATUS_LABELS.completed, variant: 'default', icon: 'check_circle' },
  cancelled: { label: SESSION_STATUS_LABELS.cancelled, variant: 'destructive', icon: 'cancel' },
  no_show: { label: SESSION_STATUS_LABELS.no_show, variant: 'destructive', icon: 'cancel' },
};

export function PortalAppointments({
  sessions,
  loading,
  onCancel,
  onCancellationPreview,
  onConfirm,
  onReschedule,
  onSaveCard,
  isPast = false,
  isCancelled = false,
  emptyMessage = 'No hay citas',
}: PortalAppointmentsProps) {
  const [cancelDialogSessionId, setCancelDialogSessionId] = useState<string | null>(null);
  const [cancellationPreview, setCancellationPreview] = useState<CancellationPolicyPreview | null>(null);
  const [cancellationPreviewLoading, setCancellationPreviewLoading] = useState(false);

  const handleCancelDialogOpenChange = async (open: boolean, sessionId: string) => {
    setCancelDialogSessionId(open ? sessionId : null);
    if (!open) return;

    setCancellationPreview(null);
    if (!onCancellationPreview) return;

    setCancellationPreviewLoading(true);
    try {
      setCancellationPreview(await onCancellationPreview(sessionId));
    } finally {
      setCancellationPreviewLoading(false);
    }
  };

  const addToCalendar = (session: PortalSession) => {
    const compact = (value: string) => value.replace(/[-:]/g, '').slice(0, 6);
    const start = `${session.session_date.replace(/-/g, '')}T${compact(session.start_time)}`;
    const end = `${session.session_date.replace(/-/g, '')}T${compact(session.end_time)}`;
    const professional = session.professional
      ? `${session.professional.first_name} ${session.professional.last_name}`
      : '';
    const location = session.video_call_link
      || [session.location?.name, session.location?.street, session.location?.city].filter(Boolean).join(', ');
    const escapeIcs = (value: string) => value.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const calendar = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Psycma//Portal del paciente//ES',
      'BEGIN:VEVENT',
      `UID:${session.id}@psycma`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcs(session.session_type || 'Cita')}`,
      professional ? `DESCRIPTION:${escapeIcs(`Cita con ${professional}`)}` : '',
      location ? `LOCATION:${escapeIcs(location)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
    const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cita-${session.session_date}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Icon name="progress_activity" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Icon name="calendar_month" className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const status = statusConfig[session.status] || statusConfig.scheduled;
        const canCancel = !isPast && !isCancelled && ['scheduled', 'confirmed', 'pending_approval', 'draft'].includes(session.status);
        const canConfirm = !isPast && !isCancelled && session.status === 'scheduled';
        const canReschedule = !isPast && !isCancelled && ['scheduled', 'confirmed'].includes(session.status);
        const canSaveCard = !isPast && !isCancelled && session.status === 'draft' && !!onSaveCard;
        const canJoinVideo = !isPast
          && !isCancelled
          && ['scheduled', 'confirmed'].includes(session.status)
          && !!session.video_call_link;
        const address = [session.location?.street, session.location?.city].filter(Boolean).join(', ');
        const mapsUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;

        return (
          <div
            key={session.id}
            className="space-y-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40 sm:p-5"
          >
            {/* Date and Status */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon name="calendar_month" className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="font-semibold capitalize">
                  {format(new Date(session.session_date), "EEEE, d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <Badge variant="outline" className={`flex items-center gap-1 ${getSessionStatusDisplay(session.status).badgeClass}`}>
                <Icon name={status.icon} className="h-3 w-3" />
                <span className="text-xs">{status.label}</span>
              </Badge>
            </div>

            {/* Time and Type */}
            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Icon name="schedule" className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {session.start_time.substring(0, 5)} - {session.end_time.substring(0, 5)}
                </span>
              </div>
              {session.professional && (
                <div className="flex items-center gap-2">
                  <Icon name="person" className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {session.professional.first_name} {session.professional.last_name}
                  </span>
                </div>
              )}
            </div>

            {/* Session Type and Location */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline">{session.session_type}</Badge>
              {session.location && (
                mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon name="location_on" className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{session.location.name}{address ? ` - ${address}` : ''}</span>
                    <Icon name="open_in_new" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground"><Icon name="location_on" className="h-4 w-4" aria-hidden="true" /><span>{session.location.name}</span></div>
                )
              )}
            </div>

            {/* Nota para borradores (falta guardar la tarjeta) */}
            {!isPast && session.status === 'draft' && (
              <p className="text-xs text-muted-foreground">
                Reserva pendiente: falta guardar tu tarjeta para completarla. No se te cobra nada ahora.
              </p>
            )}

            {/* Actions */}
            {!isCancelled && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                {canJoinVideo && (
                  <Button asChild size="sm" className="min-h-11">
                    <a href={session.video_call_link || undefined} target="_blank" rel="noopener noreferrer">
                      <Icon name="videocam" className="mr-2 h-4 w-4" aria-hidden="true" />Entrar en videollamada
                    </a>
                  </Button>
                )}
                {!isPast && (
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => addToCalendar(session)}>
                    <Icon name="event_available" className="mr-2 h-4 w-4" aria-hidden="true" />Añadir al calendario
                  </Button>
                )}
                {canSaveCard && (
                  <Button
                    variant="default"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onSaveCard?.(session.id)}
                  >
                    <Icon name="credit_card" className="h-4 w-4 mr-1" />
                    Guardar tarjeta
                  </Button>
                )}
                {canConfirm && onConfirm && (
                  <Button
                    variant="default"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onConfirm(session.id)}
                  >
                    <Icon name="check_circle" className="h-4 w-4 mr-1" />
                    Confirmar
                  </Button>
                )}
                {canReschedule && onReschedule && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-11"
                    onClick={() => onReschedule(session)}
                  >
                    <Icon name="refresh" className="h-4 w-4 mr-1" />
                    Reprogramar
                  </Button>
                )}
                {canCancel && onCancel && (
                  <AlertDialog
                    open={cancelDialogSessionId === session.id}
                    onOpenChange={(open) => handleCancelDialogOpenChange(open, session.id)}
                  >
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="min-h-11 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                        <Icon name="cancel" className="h-4 w-4 mr-1" />
                        Cancelar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La cita del {format(new Date(session.session_date), "d 'de' MMMM", { locale: es })} a las {session.start_time.substring(0, 5)} será cancelada.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Alert className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100">
                        <Icon name="error" className="h-4 w-4 text-amber-600" />
                        <AlertDescription>
                          {cancellationPreviewLoading ? (
                            'Comprobando la política de cancelación...'
                          ) : cancellationPreview?.applies ? (
                            <>
                              Esta cita está sujeta a la política de cancelación aceptada. Al cancelarla fuera de plazo, tu profesional revisará si corresponde aplicar un cargo.
                              <span className="mt-2 block font-medium">
                                Importe estimado sujeto a revisión: {Number(cancellationPreview.amount || 0).toFixed(2)} EUR
                                {cancellationPreview.percentage > 0 && cancellationPreview.basePrice > 0
                                  ? ` (${cancellationPreview.percentage}% de ${Number(cancellationPreview.basePrice).toFixed(2)} EUR)`
                                  : ''}
                              </span>
                            </>
                          ) : cancellationPreview?.hasSignedPolicy ? (
                            'Esta cita está cubierta por la política de cancelación aceptada. Según el plazo actual, no se estima cargo por cancelación.'
                          ) : (
                            'Se avisará al centro de la cancelación. Si tienes dudas sobre la política aplicable, contacta con tu profesional.'
                          )}
                        </AlertDescription>
                      </Alert>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Volver</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onCancel(session.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Cancelar cita
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
