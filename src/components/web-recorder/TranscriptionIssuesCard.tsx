import { format, formatDistanceToNowStrict } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { useRetryTranscription, useTranscriptionIssues } from '@/hooks/useTranscriptionIssues';

/**
 * Aviso del panel principal cuando hay transcripciones en espera (cuenta de OpenAI
 * sin saldo o con la clave mal) o fallidas con el audio todavía guardado. No se
 * muestra si no hay nada que atender.
 */
export function TranscriptionIssuesCard() {
  const { data: issues } = useTranscriptionIssues();
  const retry = useRetryTranscription();
  if (!issues?.length) return null;

  const blocked = issues.filter((i) => i.kind === 'blocked');
  const failed = issues.filter((i) => i.kind === 'failed');
  const outOfCredit = blocked.some((i) => i.errorCode === 'stt_insufficient_quota');

  return (
    <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <Icon name="warning" className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-3">
          {blocked.length > 0 && (
            <div>
              <p className="font-semibold">
                {blocked.length === 1 ? '1 transcripción en espera' : `${blocked.length} transcripciones en espera`}
              </p>
              <p className="text-sm">
                {outOfCredit
                  ? 'Tu cuenta de OpenAI no tiene saldo. Recárgala y se transcribirán solas en la próxima hora; no se ha perdido ningún audio.'
                  : blocked[0].message || 'Hay un problema con la cuenta de OpenAI del centro. Se reintentará cada hora.'}
              </p>
              <p className="mt-1 text-xs opacity-80">
                El audio se conserva hasta {blocked[0].expiresAt ? format(new Date(blocked[0].expiresAt), "d 'de' MMMM", { locale: es }) : '7 días'}; después se borra sin transcribir.
              </p>
            </div>
          )}

          {failed.length > 0 && (
            <div className="space-y-2">
              <p className="font-semibold">
                {failed.length === 1 ? '1 transcripción fallida' : `${failed.length} transcripciones fallidas`}
              </p>
              <ul className="space-y-2">
                {failed.map((issue) => (
                  <li key={issue.jobId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 p-2 text-sm dark:bg-background/20">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{issue.patientName || 'Sesión sin paciente'}</p>
                      <p className="text-xs opacity-80">
                        {issue.uploadedAt ? `Grabada ${format(new Date(issue.uploadedAt), "d MMM, HH:mm", { locale: es })}` : ''}
                        {issue.expiresAt ? ` · el audio se borra en ${formatDistanceToNowStrict(new Date(issue.expiresAt), { locale: es })}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() =>
                        retry.mutate(issue.audioIngestionId, {
                          onSuccess: () => toast.success('Transcripción reintentada. Aparecerá en la sesión en unos minutos.'),
                          onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo reintentar.'),
                        })
                      }
                    >
                      <Icon name="refresh" className="mr-1.5 h-4 w-4" />
                      Reintentar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
