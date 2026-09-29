import { useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { usePatientPartner } from '@/hooks/usePatientRelationships';
import { usePatientDASResults } from '@/hooks/useDASResults';
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

const NONE = 'none';

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
  const { data: couple } = usePatientPartner(patientId);
  const partner = couple?.partner;
  const { data: partnerResults = [] } = usePatientDASResults(partner?.id);

  const [compareChoice, setCompareChoice] = useState<string | null>(null);
  const [norm, setNorm] = useState<DASNorm>('GEN');

  // Por defecto se superpone el DAS más reciente de la pareja
  const compareId = compareChoice ?? partnerResults[0]?.assessmentId ?? NONE;
  const partnerResult = partnerResults.find(r => r.assessmentId === compareId);
  const partnerName = partner ? `${partner.first_name} ${partner.last_name}`.trim() : '';

  const series: DASProfileSeries[] = partnerResult
    ? [
        { label: patientName, scores: factorScores, norm, color: THEME_COLORS.first, dash: DAS_SERIES_DASH[0] },
        { label: partnerName, scores: partnerResult.factorScores, norm, color: THEME_COLORS.second, dash: DAS_SERIES_DASH[1] },
      ]
    : dasNormSeries(factorScores, THEME_COLORS);

  return (
    <div className="space-y-4">
      {partner && partnerResults.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-72">
            <Label className="text-xs text-muted-foreground">Superponer con la pareja</Label>
            <Select value={compareId} onValueChange={setCompareChoice}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No superponer</SelectItem>
                {partnerResults.map(result => (
                  <SelectItem key={result.assessmentId} value={result.assessmentId}>
                    {partnerName}
                    {result.completedAt
                      ? ` · ${format(new Date(result.completedAt), 'd MMM yyyy', { locale: es })}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
