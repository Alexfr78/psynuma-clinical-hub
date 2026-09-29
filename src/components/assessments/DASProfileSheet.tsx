import { useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { usePartnerResultsByCode } from '@/hooks/usePatientResultsByCode';
import { PartnerResultSelect, NO_PARTNER_RESULT } from './PartnerResultSelect';
import {
  renderDASProfileSvg,
  dasNormSeries,
  DAS_SERIES_DASH,
  type DASProfileColors,
  type DASProfileSeries,
} from '../../../supabase/functions/_shared/dasProfileSvg';
import type { DASNorm } from '../../../supabase/functions/_shared/dasScoring';

// Colores del tema para que la hoja siga el modo claro/oscuro de la app
const THEME_COLORS: DASProfileColors = {
  text: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border))',
  gridStrong: 'hsl(var(--muted-foreground) / 0.5)',
  headerFill: 'hsl(var(--muted))',
  clinicalFill: 'hsl(var(--muted))',
  medioFill: 'hsl(var(--primary) / 0.14)',
  markFill: 'hsl(var(--card))',
  first: 'hsl(var(--primary))',
  second: 'rgb(234 88 12)',
};

interface DASProfileSheetProps {
  factorScores: Record<string, number>;
  patientId?: string;
  patientName: string;
}

/**
 * Hoja de perfil del DAS. Sola muestra al contacto con los dos baremos; si tiene
 * pareja vinculada con un DAS completado, permite superponer ambos miembros sobre
 * el baremo elegido.
 */
export function DASProfileSheet({ factorScores, patientId, patientName }: DASProfileSheetProps) {
  const { partnerName, results: partnerResults } = usePartnerResultsByCode(patientId, 'DAS');

  const [compareChoice, setCompareChoice] = useState<string | null>(null);
  const [norm, setNorm] = useState<DASNorm>('GEN');

  // Por defecto se superpone el DAS más reciente de la pareja
  const compareId = compareChoice ?? partnerResults[0]?.assessmentId ?? NO_PARTNER_RESULT;
  const partnerResult = partnerResults.find(r => r.assessmentId === compareId);

  const series: DASProfileSeries[] = partnerResult
    ? [
        { label: patientName, scores: factorScores, norm, color: THEME_COLORS.first, dash: DAS_SERIES_DASH[0] },
        { label: partnerName, scores: partnerResult.factorScores, norm, color: THEME_COLORS.second, dash: DAS_SERIES_DASH[1] },
      ]
    : dasNormSeries(factorScores, THEME_COLORS);

  return (
    <div className="space-y-4">
      {partnerResults.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <PartnerResultSelect
            partnerName={partnerName}
            results={partnerResults}
            value={compareId}
            onChange={setCompareChoice}
          />
          {partnerResult && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Baremo</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={norm}
                onValueChange={value => value && setNorm(value as DASNorm)}
              >
                <ToggleGroupItem value="GEN">General</ToggleGroupItem>
                <ToggleGroupItem value="CLIN">Clínico</ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        {/* SVG generado solo a partir de números y nombres escapados */}
        <div
          className="min-w-[640px]"
          dangerouslySetInnerHTML={{ __html: renderDASProfileSvg(series, THEME_COLORS) }}
        />
      </div>
    </div>
  );
}
