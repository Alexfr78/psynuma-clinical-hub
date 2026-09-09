import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useCenter } from '@/hooks/useCenter';
import { useSessions, type SessionWithRelations } from '@/hooks/useSessions';
import { clearSharedAudio, readSharedAudio, type SharedAudio } from '@/lib/shared-audio';
import { TranscriptionAnalysisDialog } from '@/components/agenda/TranscriptionAnalysisDialog';

/** Ventana de sesiones ofrecidas para emparejar: se comparte la grabación justo tras la sesión. */
const DAYS_BACK = 30;

/** Por encima de este tamaño la transcripción se trocea en el servidor (ver `transcribe-session-audio`). */
const CHUNKING_THRESHOLD_BYTES = 24 * 1024 * 1024;

/**
 * Formatos cuyo troceado por bytes produce fragmentos INVÁLIDOS. `transcribe-session-audio`
 * parte los archivos grandes por posición de byte y manda cada trozo con la extensión original;
 * en un contenedor (MP4/M4A, WebM, OGG) los metadatos van al principio, así que del segundo
 * fragmento en adelante no hay un archivo que decodificar. El MP3 sobrevive a duras penas
 * porque el decodificador resincroniza con la siguiente cabecera de trama.
 */
const CONTAINER_EXTENSIONS = ['.m4a', '.mp4', '.webm', '.ogg'];

function isContainerFormat(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return CONTAINER_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatSessionDate(date: string, time: string): string {
  const parsed = new Date(`${date}T${time}`);
  return parsed.toLocaleString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function patientName(session: SessionWithRelations): string {
  if (!session.patient) return 'Sin contacto asignado';
  return `${session.patient.first_name} ${session.patient.last_name}`.trim();
}

/**
 * Destino del share target de Android: recibe un audio compartido desde otra app (la grabadora
 * del móvil, la app de Plaud, cualquier gestor de archivos), lo empareja con una sesión elegida
 * a mano y lo manda a transcribir.
 *
 * El emparejamiento es manual a propósito. La ingesta de Plaud tenía que adivinar a qué sesión
 * pertenecía cada archivo porque el dispositivo grababa a ciegas; aquí la persona que comparte
 * acaba de terminar la sesión y sabe perfectamente cuál es, así que preguntar es más fiable y
 * más barato que inferir.
 */
export default function ShareAudio() {
  const { centerId } = useCenter();

  const [shared, setShared] = useState<SharedAudio | null>(null);
  const [isLoadingShared, setIsLoadingShared] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - DAYS_BACK);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }, []);

  const { data: sessions, isLoading: isLoadingSessions } = useSessions(range.start, range.end);

  useEffect(() => {
    let cancelled = false;
    readSharedAudio()
      .then((result) => {
        if (!cancelled) setShared(result);
      })
      .catch(() => {
        if (!cancelled) setShared(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingShared(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Más recientes primero: `useSessions` ordena ascendente para la agenda, pero aquí la sesión
  // que se acaba de dar es casi siempre la que se busca.
  const candidates = useMemo(() => {
    const list = [...(sessions ?? [])].reverse();
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((session) => patientName(session).toLowerCase().includes(term));
  }, [sessions, search]);

  const selectedSession = candidates.find((s) => s.id === selectedSessionId)
    ?? sessions?.find((s) => s.id === selectedSessionId)
    ?? null;

  const handleTranscribe = async () => {
    if (!shared || !selectedSession || !centerId) return;

    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append('audio', shared.file);
      formData.append('centerId', centerId);

      const { data, error } = await supabase.functions.invoke('transcribe-session-audio', {
        body: formData,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Error al transcribir');

      setTranscription(data.transcription);
      setDialogOpen(true);
      // El audio ya cumplió su función: si se queda en caché, la próxima visita a esta página
      // lo ofrecería otra vez como si fuera una grabación nueva sin procesar.
      await clearSharedAudio();
      toast.success(`Audio transcrito — ${data.wordCount} palabras`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al transcribir el audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleDiscard = async () => {
    await clearSharedAudio();
    setShared(null);
    setSelectedSessionId(null);
    toast.success('Grabación descartada');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold flex items-center gap-2">
          <Icon name="share" className="h-6 w-6" />
          Grabación compartida
        </h1>
        <p className="text-muted-foreground">
          Elige a qué sesión pertenece el audio que acabas de compartir y se transcribirá para
          generar los documentos de esa sesión.
        </p>
      </div>

      {isLoadingShared ? (
        <Skeleton className="h-28 w-full" />
      ) : !shared ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No hay ninguna grabación esperando</CardTitle>
            <CardDescription>
              Para traer un audio hasta aquí, ábrelo en la app donde lo tengas —la grabadora del
              móvil, por ejemplo— y usa el botón de compartir de Android. Psycma aparece en la
              lista de destinos siempre que la app esté instalada en el teléfono.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon name="graphic_eq" className="h-5 w-5 text-primary" />
                {shared.file.name}
              </CardTitle>
              <CardDescription>
                {formatSize(shared.file.size)} · compartido a las{' '}
                {shared.sharedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </CardDescription>
            </CardHeader>
            {shared.file.size > CHUNKING_THRESHOLD_BYTES && (
              <CardContent className="pt-0">
                {isContainerFormat(shared.file.name) ? (
                  <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                    <Icon name="warning" className="h-4 w-4 shrink-0" />
                    <span>
                      Este archivo supera los 24 MB y su formato no admite el troceado que hace el
                      servidor: la transcripción saldrá incompleta o ilegible a partir del primer
                      fragmento. Vuelve a grabar con menor calidad, o convierte el archivo a MP3
                      antes de compartirlo.
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Icon name="info" className="h-4 w-4 shrink-0" />
                    Es un archivo grande: se transcribirá por fragmentos y puede tardar varios
                    minutos. No cierres la app mientras tanto.
                  </p>
                )}
              </CardContent>
            )}
          </Card>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">¿A qué sesión pertenece?</h2>
              <Button variant="ghost" size="sm" onClick={handleDiscard} disabled={isTranscribing}>
                <Icon name="delete" className="mr-1 h-3 w-3" />
                Descartar
              </Button>
            </div>

            <Input
              placeholder="Buscar por nombre del contacto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={isTranscribing}
            />

            {isLoadingSessions ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No hay sesiones de los últimos {DAYS_BACK} días que coincidan con la búsqueda.
              </p>
            ) : (
              <div className="space-y-2">
                {candidates.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    disabled={isTranscribing}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedSessionId === session.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{patientName(session)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatSessionDate(session.session_date, session.start_time)}
                      </p>
                    </div>
                    {selectedSessionId === session.id && (
                      <Icon name="check_circle" className="h-5 w-5 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleTranscribe}
            disabled={!selectedSession || isTranscribing || !centerId}
          >
            {isTranscribing ? (
              <>
                <Icon name="progress_activity" className="mr-2 h-4 w-4 animate-spin" />
                Transcribiendo con Whisper...
              </>
            ) : (
              <>
                <Icon name="psychology" className="mr-2 h-4 w-4" />
                Transcribir y generar documentos
              </>
            )}
          </Button>
        </>
      )}

      {selectedSession && transcription && (
        <TranscriptionAnalysisDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          sessionId={selectedSession.id}
          patientName={selectedSession.patient ? patientName(selectedSession) : undefined}
          patientPhone={selectedSession.patient?.phone ?? undefined}
          patientEmail={selectedSession.patient?.email ?? undefined}
          sessionDate={selectedSession.session_date}
          initialTranscription={transcription}
        />
      )}
    </div>
  );
}
