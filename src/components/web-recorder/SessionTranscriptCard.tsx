import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useSessionTranscriptAvailability } from '@/hooks/useAIDocuments';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';

interface SessionTranscriptCardProps {
  sessionId: string;
  /** Abre el diálogo de análisis para generar (o regenerar) los informes a partir de la transcripción. */
  onGenerateReports?: () => void;
}

/**
 * Muestra en el detalle de la sesión que hay una transcripción guardada (p. ej. de la
 * grabadora web) y permite leerla y generar informes. El texto solo se descarga al
 * pulsar "Ver", para no traer contenido clínico a pantalla sin que se pida.
 */
export function SessionTranscriptCard({ sessionId, onGenerateReports }: SessionTranscriptCardProps) {
  const { data: availability } = useSessionTranscriptAvailability(sessionId);
  const [showText, setShowText] = useState(false);
  const transcriptId = availability?.available ? availability.transcriptId : undefined;

  const { data: text, isLoading } = useQuery({
    queryKey: ['transcript-text', transcriptId],
    queryFn: async () => {
      const { data, error } = await supabase.from('transcripts').select('normalized_text').eq('id', transcriptId!).maybeSingle();
      if (error) throw error;
      return (data as { normalized_text: string | null } | null)?.normalized_text ?? '';
    },
    enabled: showText && !!transcriptId,
  });

  if (!availability?.available) return null;

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <Icon name="description" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Transcripción disponible</p>
          {availability.expiresAt && (
            <p className="text-xs text-muted-foreground">
              Se borra automáticamente el {format(new Date(availability.expiresAt), "d 'de' MMMM", { locale: es })}.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setShowText((v) => !v)}>
          <Icon name={showText ? 'visibility_off' : 'visibility'} className="mr-1.5 h-4 w-4" />
          {showText ? 'Ocultar' : 'Ver transcripción'}
        </Button>
        {onGenerateReports && (
          <Button type="button" size="sm" onClick={onGenerateReports}>
            <Icon name="auto_awesome" className="mr-1.5 h-4 w-4" />
            Generar informes
          </Button>
        )}
      </div>
      {showText && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
          {isLoading ? 'Cargando...' : text || 'La transcripción está vacía.'}
        </div>
      )}
    </div>
  );
}
