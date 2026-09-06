import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import {
  useGeneratePlaudReports,
  usePlaudGenerationConsent,
  type PlaudRecordingWithContext,
} from '@/hooks/usePlaudRecordings';
import { describePlaudGenerationBlock } from './plaudReviewLabels';

type GenerationStage = 'layer1' | 'layer2' | 'layer3' | null;

const STAGE_LABELS: Record<Exclude<GenerationStage, null>, string> = {
  layer1: 'Extrayendo la base clínica…',
  layer2: 'Generando el informe clínico…',
  layer3: 'Generando el informe para el paciente…',
};

/**
 * Botón deliberado para generar los informes de IA de una grabación Plaud ya emparejada y
 * confirmada (`status: 'matched'` o `'processed'` — para el resto de estados no se
 * renderiza nada). Vive separado del diálogo de confirmación del emparejamiento a
 * propósito: confirmar a qué sesión pertenece un archivo y decidir mandar su contenido a un
 * proveedor de IA externo son dos decisiones distintas, y la segunda nunca debe dispararse
 * como efecto colateral de la primera (ver cabecera de `useGeneratePlaudReports` en
 * `usePlaudRecordings.tsx`).
 */
export function PlaudGenerateReportsButton({ recording }: { recording: PlaudRecordingWithContext }) {
  const [stage, setStage] = useState<GenerationStage>(null);
  const generate = useGeneratePlaudReports();

  // Defensa en profundidad (punto 5 del encargo): por construcción del emparejamiento
  // (`plaud-matching.ts`), una grabación con sospecha de mezcla o solape solo llega a
  // `matched` pasando por la casilla extra del diálogo de confirmación manual — así que
  // esto no debería darse nunca en la práctica, pero si ocurriera, se bloquea aquí en vez
  // de generar sobre un archivo que podría mezclar a dos pacientes.
  const isRiskUnconfirmed =
    (recording.contains_multiple_sessions || recording.overlap_flag) && recording.matched_by !== 'manual';

  const { data: consentResults, isLoading: isConsentLoading } = usePlaudGenerationConsent(
    recording.patient_id,
    !isRiskUnconfirmed,
  );
  const consentBlockReason = describePlaudGenerationBlock(consentResults);

  if (recording.status !== 'matched' && recording.status !== 'processed') return null;

  const alreadyProcessed = recording.status === 'processed' && !!recording.report_generated_at;

  const handleGenerate = () => {
    generate.mutate(
      { recording, onProgress: setStage },
      {
        onSuccess: () => toast.success('Informes generados y guardados en la sesión.'),
        onError: (error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Error al generar los informes.');
        },
        onSettled: () => setStage(null),
      },
    );
  };

  if (isRiskUnconfirmed) {
    return (
      <Alert variant="destructive" className="mt-2">
        <Icon name="block" className="h-4 w-4" />
        <AlertDescription>
          No se pueden generar informes: esta grabación tiene sospecha de mezclar más de una
          sesión o de solaparse con otra, y no consta que haya sido confirmada a mano.
          Revísala y confírmala explícitamente antes de generar nada.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      {alreadyProcessed && recording.report_generated_at && (
        <p className="text-xs text-muted-foreground">
          Informes generados el{' '}
          {format(parseISO(recording.report_generated_at), "d 'de' MMMM 'de' yyyy 'a las' HH:mm", { locale: es })}.
        </p>
      )}

      {consentBlockReason && (
        <Alert variant="destructive">
          <Icon name="lock" className="h-4 w-4" />
          <AlertDescription>{consentBlockReason}</AlertDescription>
        </Alert>
      )}

      <Button
        size="sm"
        variant={alreadyProcessed ? 'outline' : 'default'}
        className="gap-2"
        disabled={generate.isPending || isConsentLoading || !!consentBlockReason}
        onClick={handleGenerate}
      >
        <Icon
          name={generate.isPending ? 'progress_activity' : 'auto_awesome'}
          className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`}
        />
        {generate.isPending
          ? stage
            ? STAGE_LABELS[stage]
            : 'Generando…'
          : isConsentLoading
            ? 'Comprobando consentimiento…'
            : alreadyProcessed
              ? 'Regenerar informes'
              : 'Generar informes'}
      </Button>
    </div>
  );
}
