import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { TranscriptionIssuesCard } from '@/components/web-recorder/TranscriptionIssuesCard';
import { isAccountBlockedCode } from '@/lib/transcription-account-errors';
import { describeEdgeFunctionError } from '@/lib/edge-function-error';
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

const LIST_DAYS = 30;

const SOURCE_LABELS: Record<string, string> = {
  web_recorder: 'Grabadora de Psycma',
  share_target: 'Compartido desde el móvil',
  manual_upload: 'Subida manual',
  android_recorder: 'App Android',
  samsung_media_store: 'Grabadora del móvil',
};

type Tone = 'default' | 'secondary' | 'destructive' | 'outline';
const STATUS: Record<string, { label: string; tone: Tone }> = {
  uploading: { label: 'Subiendo', tone: 'outline' },
  uploaded: { label: 'En cola', tone: 'outline' },
  queued_for_transcription: { label: 'En cola', tone: 'outline' },
  transcription_processing: { label: 'Transcribiendo', tone: 'secondary' },
  transcription_verified: { label: 'Transcrita', tone: 'default' },
  audio_deleted: { label: 'Transcrita · audio borrado', tone: 'default' },
  expired_unprocessed: { label: 'Caducada sin transcribir', tone: 'destructive' },
  failed: { label: 'Fallida', tone: 'destructive' },
};

interface RecordingRow {
  id: string;
  source: string;
  status: string;
  professional_id: string;
  patient_id: string | null;
  session_id: string | null;
  duration_ms: number | null;
  created_at: string;
  job: { status: string; error_code: string | null }[] | null;
  transcripts: { id: string }[] | null;
}

function formatDuration(ms: number | null) {
  if (!ms) return '';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return minutes ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

/**
 * Grabaciones de sesión de los últimos 30 días (grabadora web, audio compartido o
 * subido a mano) con su estado de transcripción. Sustituye a la antigua bandeja de
 * Plaud, que queda en /grabaciones/plaud solo como histórico.
 */
/** Estados en los que el servidor rechaza el borrado (se está subiendo o transcribiendo). */
const BUSY_STATUSES = ['uploading', 'transcription_processing'];

export default function Recordings() {
  const { user, profile, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; label: string; hasTranscript: boolean } | null>(null);

  const deleteRecording = useMutation({
    mutationFn: async (audioIngestionId: string) => {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        'delete-audio-recording',
        { body: { audioIngestionId } },
      );
      if (error) throw new Error(await describeEdgeFunctionError(error, 'No se pudo borrar la grabación'));
      if (!data?.success) throw new Error(data?.error || 'No se pudo borrar la grabación');
    },
    onSuccess: () => {
      toast.success('Grabación borrada');
      setToDelete(null);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'No se pudo borrar la grabación'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['recordings'] });
      void queryClient.invalidateQueries({ queryKey: ['transcription-issues'] });
      void queryClient.invalidateQueries({ queryKey: ['ai-documents'] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recordings', profile?.center_id, user?.id, isAdmin],
    queryFn: async () => {
      const since = new Date(Date.now() - LIST_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('audio_ingestions')
        .select('id, source, status, professional_id, patient_id, session_id, duration_ms, created_at, job:transcription_jobs(status, error_code), transcripts(id)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!isAdmin) query = query.eq('professional_id', user!.id);
      const { data: rows, error } = await query;
      if (error) throw error;
      const recordings = (rows ?? []) as unknown as RecordingRow[];

      const patientIds = [...new Set(recordings.map((r) => r.patient_id).filter(Boolean))] as string[];
      const names = new Map<string, string>();
      if (patientIds.length) {
        const { data: patients } = await supabase.from('patients').select('id, first_name, last_name').in('id', patientIds);
        for (const p of patients ?? []) names.set(p.id, `${p.first_name} ${p.last_name ?? ''}`.trim());
      }
      return recordings.map((r) => ({ ...r, patientName: r.patient_id ? names.get(r.patient_id) ?? null : null }));
    },
    enabled: !!user?.id && !!profile?.center_id,
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold md:text-3xl">
          <Icon name="graphic_eq" className="h-7 w-7" />
          Grabaciones
        </h1>
        <p className="mt-1 text-muted-foreground">
          Grabaciones de sesión de los últimos {LIST_DAYS} días y el estado de su transcripción. El audio se borra
          automáticamente al transcribirse (como máximo a los 7 días); la transcripción, a los 30 días.
        </p>
      </div>

      <TranscriptionIssuesCard />

      <div className="rounded-2xl border bg-card shadow-card">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Icon name="progress_activity" className="h-4 w-4 animate-spin" /> Cargando grabaciones...
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Icon name="mic_off" className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Todavía no hay grabaciones</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Pulsa «Grabar sesión» en la cabecera o en el detalle de una cita para grabar. La transcripción aparecerá en la propia cita.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {data.map((r) => {
              const job = r.job?.[0];
              const waiting = job?.status === 'queued' && isAccountBlockedCode(job.error_code);
              const hasTranscript = (r.transcripts?.length ?? 0) > 0;
              const fullyDeleted = r.status === 'audio_deleted' && !hasTranscript;
              const status = waiting
                ? { label: 'En espera (cuenta de OpenAI)', tone: 'destructive' as Tone }
                : fullyDeleted
                  ? { label: 'Borrada', tone: 'outline' as Tone }
                  : STATUS[r.status] ?? { label: r.status, tone: 'outline' as Tone };
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.patientName || 'Sin paciente'}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                      {r.duration_ms ? ` · ${formatDuration(r.duration_ms)}` : ''}
                      {` · ${SOURCE_LABELS[r.source] ?? r.source}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={status.tone}>{status.label}</Badge>
                    {r.session_id && (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/agenda?sesion=${r.session_id}`}>Ver sesión</Link>
                      </Button>
                    )}
                    {!fullyDeleted ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={BUSY_STATUSES.includes(r.status)}
                        title={BUSY_STATUSES.includes(r.status) ? 'Espera a que termine de subirse o transcribirse' : 'Borrar grabación'}
                        aria-label={`Borrar grabación de ${r.patientName || 'sesión sin paciente'}`}
                        onClick={() => setToDelete({
                          id: r.id,
                          label: `${r.patientName || 'Sin paciente'} · ${format(new Date(r.created_at), "d MMM yyyy, HH:mm", { locale: es })}`,
                          hasTranscript,
                        })}
                      >
                        <Icon name="delete" className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => { if (!open && !deleteRecording.isPending) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta grabación?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{toDelete?.label}</p>
                <p>
                  Se borrarán definitivamente el audio{toDelete?.hasTranscript ? ' y la transcripción' : ''}. No se puede deshacer.
                </p>
                <p>
                  Los informes ya generados a partir de ella <strong>no se borran</strong>: forman parte de la historia clínica.
                  Si hay que retirarlos, hazlo desde la sesión.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRecording.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteRecording.isPending}
              onClick={(event) => {
                // Se mantiene abierto hasta que el servidor confirme el borrado.
                event.preventDefault();
                if (toDelete) deleteRecording.mutate(toDelete.id);
              }}
            >
              {deleteRecording.isPending ? 'Borrando...' : 'Borrar definitivamente'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
