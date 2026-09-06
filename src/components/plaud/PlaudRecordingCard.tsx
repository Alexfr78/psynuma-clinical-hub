import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { PlaudSessionPicker } from '@/components/plaud/PlaudSessionPicker';
import { PlaudConfirmMatchDialog, type PlaudConfirmMatchTarget } from '@/components/plaud/PlaudConfirmMatchDialog';
import { PlaudDiscardDialog } from '@/components/plaud/PlaudDiscardDialog';
import { PlaudGenerateReportsButton } from '@/components/plaud/PlaudGenerateReportsButton';
import {
  describePrimaryReviewReasons,
  describeSegmentBoundaries,
  describeSegmentationSignals,
  describeSuggestionDetails,
  formatConfidencePct,
  formatDurationMs,
} from '@/components/plaud/plaudReviewLabels';
import {
  useConfirmPlaudMatch,
  useDiscardPlaudRecording,
  type PlaudRecordingWithContext,
  type PlaudSessionSearchResult,
} from '@/hooks/usePlaudRecordings';

interface PlaudRecordingCardProps {
  recording: PlaudRecordingWithContext;
  readOnly?: boolean;
}

/**
 * Una grabación en la bandeja de revisión. El objetivo declarado del encargo: quien la use
 * tiene que entender de un vistazo por qué está aquí y qué está a punto de confirmar — así
 * que cada sección explica una cosa y las señales de riesgo (varias sesiones, solape) van
 * primero y en rojo, nunca escondidas entre el resto de detalles.
 */
export function PlaudRecordingCard({ recording, readOnly }: PlaudRecordingCardProps) {
  const [confirmTarget, setConfirmTarget] = useState<{
    sessionId: string;
    patientId: string;
    display: PlaudConfirmMatchTarget;
  } | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const confirmMatch = useConfirmPlaudMatch();
  const discardRecording = useDiscardPlaudRecording();

  const primaryReasons = describePrimaryReviewReasons(recording.match_reasons);
  const suggestionDetails = describeSuggestionDetails(recording.match_reasons);
  const segmentationSignals = describeSegmentationSignals(recording.segmentation_signals);
  const boundaries = describeSegmentBoundaries(recording.segment_boundaries);

  const hasRiskFlags = recording.contains_multiple_sessions || recording.overlap_flag;
  // La confianza queda anulada a 0 por diseño cuando hay riesgo de mezcla (ver plaud-matching.ts):
  // no tiene sentido mostrarla como si fuera un porcentaje real en ese caso.
  const confidenceDisplay = hasRiskFlags ? null : recording.match_confidence;

  const startDate = parseISO(recording.start_at);

  const openConfirmForSuggestion = () => {
    if (!recording.suggestedSession || !recording.session_id || !recording.patient_id) return;
    setConfirmTarget({
      sessionId: recording.session_id,
      patientId: recording.patient_id,
      display: {
        patientFirstName: recording.suggestedSession.patient_first_name,
        patientLastName: recording.suggestedSession.patient_last_name,
        sessionDate: recording.suggestedSession.session_date,
        startTime: recording.suggestedSession.start_time,
        endTime: recording.suggestedSession.end_time,
      },
    });
  };

  const openConfirmForChosenSession = (session: PlaudSessionSearchResult) => {
    setConfirmTarget({
      sessionId: session.id,
      patientId: session.patient_id,
      display: {
        patientFirstName: session.patient_first_name,
        patientLastName: session.patient_last_name,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
      },
    });
  };

  const handleConfirm = () => {
    if (!confirmTarget) return;
    confirmMatch.mutate(
      { recordingId: recording.id, sessionId: confirmTarget.sessionId, patientId: confirmTarget.patientId },
      { onSuccess: () => setConfirmTarget(null) },
    );
  };

  const handleDiscard = () => {
    discardRecording.mutate(recording.id, { onSuccess: () => setDiscardOpen(false) });
  };

  return (
    <Card className={hasRiskFlags ? 'border-destructive/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-base font-medium">
            <Icon name="graphic_eq" className="h-5 w-5 text-muted-foreground" />
            {format(startDate, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
            <span className="text-muted-foreground font-normal">
              · {format(startDate, 'HH:mm', { locale: es })} · {formatDurationMs(recording.duration_ms)}
            </span>
          </div>
          {!readOnly && recording.status === 'needs_review' && (
            <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 gap-1">
              <Icon name="pending_actions" className="h-3 w-3" />
              Pendiente de revisión
            </Badge>
          )}
          {readOnly && <ResolvedBadge recording={recording} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Por qué está aquí */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">Por qué está en revisión</p>
          <ul className="space-y-1">
            {primaryReasons.map((reason) => (
              <li key={reason} className="text-sm flex items-start gap-2">
                <Icon name="info" className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                {reason}
              </li>
            ))}
            {primaryReasons.length === 0 && (
              <li className="text-sm text-muted-foreground">Sin motivo específico registrado.</li>
            )}
          </ul>
        </div>

        {/* Aviso prominente de posibles varias sesiones */}
        {recording.contains_multiple_sessions && (
          <Alert variant="destructive">
            <Icon name="warning" className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p className="font-medium">
                Este archivo puede contener el contenido de más de una sesión.
              </p>
              {segmentationSignals.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {segmentationSignals.map((signal) => (
                    <li key={signal.code}>· {signal.label}</li>
                  ))}
                </ul>
              )}
              {boundaries.length > 0 && (
                <p className="text-sm">
                  Posible corte cerca de:{' '}
                  <span className="font-mono font-medium">{boundaries.join(', ')}</span>
                  {' '}(minutos:segundos desde el inicio del archivo).
                </p>
              )}
              <p className="text-sm">
                Confirmar sin comprobarlo puede mezclar el relato de un paciente con la ficha
                de otro. Escucha o revisa la transcripción de ese tramo antes de decidir.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Aviso de solapamiento */}
        {recording.overlap_flag && (
          <Alert variant="destructive">
            <Icon name="sync_problem" className="h-4 w-4" />
            <AlertDescription>
              <p className="font-medium">Se solapa en el tiempo con otra grabación.</p>
              {recording.overlapRecording ? (
                <p className="text-sm mt-1">
                  La otra grabación empieza el{' '}
                  {format(parseISO(recording.overlapRecording.start_at), "d 'de' MMMM", { locale: es })} a las{' '}
                  {format(parseISO(recording.overlapRecording.start_at), 'HH:mm', { locale: es })}
                  {' '}({formatDurationMs(recording.overlapRecording.duration_ms)}).
                </p>
              ) : (
                <p className="text-sm mt-1">No se ha podido localizar la otra grabación implicada.</p>
              )}
              <p className="text-sm mt-1">
                Con un único dispositivo esto no debería ocurrir salvo error — revisa ambas
                antes de confirmar cualquiera de las dos.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Sugerencia del sistema */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Propuesta del sistema</p>
          {recording.suggestedSession ? (
            <>
              <p className="text-sm">
                Podría corresponder a{' '}
                <span className="font-medium">
                  {recording.suggestedSession.patient_first_name} {recording.suggestedSession.patient_last_name}
                </span>
                , sesión del{' '}
                {format(parseISO(recording.suggestedSession.session_date), "d 'de' MMMM", { locale: es })}
                {' '}a las {recording.suggestedSession.start_time.slice(0, 5)}.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">
                  Confianza: {formatConfidencePct(confidenceDisplay)}
                </Badge>
                {suggestionDetails.map((detail) => (
                  <Badge key={detail} variant="outline" className="font-normal">
                    {detail}
                  </Badge>
                ))}
              </div>
              {hasRiskFlags && (
                <p className="text-xs text-muted-foreground">
                  Esta propuesta se calculó antes de saber que hay riesgo de mezcla — no se
                  muestra un porcentaje de confianza numérico porque no sería fiable.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No se propone ninguna sesión: no se encontró ninguna cita agendada cerca de la
              hora de esta grabación.
            </p>
          )}
        </div>

        {/* Acciones */}
        {!readOnly && (
          <div className="flex flex-wrap gap-2 pt-1">
            {recording.suggestedSession && (
              <Button size="sm" onClick={openConfirmForSuggestion} className="gap-2">
                <Icon name="check" className="h-4 w-4" />
                Confirmar propuesta
              </Button>
            )}
            <PlaudSessionPicker onSelect={openConfirmForChosenSession} />
            <Button
              size="sm"
              variant="ghost"
              className="gap-2 text-destructive hover:text-destructive"
              onClick={() => setDiscardOpen(true)}
            >
              <Icon name="block" className="h-4 w-4" />
              No es una sesión clínica
            </Button>
          </div>
        )}

        {readOnly && (
          <>
            <ResolvedDetails recording={recording} />
            <PlaudGenerateReportsButton recording={recording} />
          </>
        )}
      </CardContent>

      <PlaudConfirmMatchDialog
        open={!!confirmTarget}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
        target={confirmTarget?.display ?? null}
        requiresExtraConfirmation={hasRiskFlags}
        onConfirm={handleConfirm}
        isSubmitting={confirmMatch.isPending}
      />
      <PlaudDiscardDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={handleDiscard}
        isSubmitting={discardRecording.isPending}
      />
    </Card>
  );
}

function ResolvedBadge({ recording }: { recording: PlaudRecordingWithContext }) {
  if (recording.status === 'ignored') {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Icon name="block" className="h-3 w-3" />
        Descartada
      </Badge>
    );
  }
  if (recording.matched_by === 'manual') {
    return (
      <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 gap-1">
        <Icon name="check_circle" className="h-3 w-3" />
        Confirmada manualmente
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 gap-1">
      <Icon name="bolt" className="h-3 w-3" />
      Emparejada automáticamente
    </Badge>
  );
}

function ResolvedDetails({ recording }: { recording: PlaudRecordingWithContext }) {
  const who = recording.confirmedByProfile
    ? `${recording.confirmedByProfile.first_name ?? ''} ${recording.confirmedByProfile.last_name ?? ''}`.trim()
    : null;
  const when = recording.confirmed_at ? parseISO(recording.confirmed_at) : null;

  return (
    <p className="text-xs text-muted-foreground pt-1">
      {who && when
        ? `Resuelto por ${who} el ${format(when, "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}.`
        : recording.matched_by === 'auto'
          ? 'Resuelto automáticamente por la ingesta.'
          : 'Sin más detalles de quién lo resolvió.'}
    </p>
  );
}
