import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Icon } from '@/components/ui/icon';
import { usePartnerResultsByCode } from '@/hooks/usePatientResultsByCode';
import { PartnerResultSelect, NO_PARTNER_RESULT } from './PartnerResultSelect';
import { EAS_SCORING } from '@/data/eas-template';
import {
  EAS_COMPONENT_MAX,
  EAS_COMPONENT_MIN,
  easAnchorLabel,
  type EASComponent,
} from '../../../supabase/functions/_shared/easScoring';
import {
  renderEASTriangleSvg,
  EAS_SERIES_DASH,
  type EASTriangleColors,
  type EASTriangleSeries,
} from '../../../supabase/functions/_shared/easTriangleSvg';

// Colores del tema para que el triángulo siga el modo claro/oscuro de la app
const THEME_COLORS: EASTriangleColors = {
  text: 'hsl(var(--foreground))',
  muted: 'hsl(var(--muted-foreground))',
  axis: 'hsl(var(--foreground) / 0.7)',
  grid: 'hsl(var(--border))',
  surface: 'hsl(var(--card))',
  first: 'hsl(var(--primary))',
  second: 'rgb(234 88 12)',
};

const COMPONENTS: EASComponent[] = ['INT', 'PAS', 'COM'];
const ITEMS_PER_COMPONENT = 15;
const ICONS: Record<EASComponent, string> = { INT: 'handshake', PAS: 'local_fire_department', COM: 'verified' };

interface EASResultsViewProps {
  factorScores: Record<string, number>;
  patientId?: string;
  patientName: string;
}

export function EASResultsView({ factorScores, patientId, patientName }: EASResultsViewProps) {
  const { partnerName, results: partnerResults } = usePartnerResultsByCode(patientId, 'EAS');
  const [compareChoice, setCompareChoice] = useState<string | null>(null);

  // Por defecto se superpone la EAS más reciente de la pareja
  const compareId = compareChoice ?? partnerResults[0]?.assessmentId ?? NO_PARTNER_RESULT;
  const partnerScores = partnerResults.find(r => r.assessmentId === compareId)?.factorScores;

  const series: EASTriangleSeries[] = [
    { label: patientName, scores: factorScores, color: THEME_COLORS.first, dash: EAS_SERIES_DASH[0] },
  ];
  if (partnerScores) {
    series.push({ label: partnerName, scores: partnerScores, color: THEME_COLORS.second, dash: EAS_SERIES_DASH[1] });
  }

  const sorted = [...COMPONENTS].sort((a, b) => (factorScores[b] ?? 0) - (factorScores[a] ?? 0));
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const isFlat = (factorScores[highest] ?? 0) === (factorScores[lowest] ?? 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Triángulo del amor</CardTitle>
          <CardDescription>
            Puntuación de cada componente sobre su eje (de 0 a 135, una marca cada 5 puntos).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {partnerResults.length > 0 && (
            <PartnerResultSelect
              partnerName={partnerName}
              results={partnerResults}
              value={compareId}
              onChange={setCompareChoice}
            />
          )}

          {/* SVG generado solo a partir de números y nombres escapados */}
          <div dangerouslySetInnerHTML={{ __html: renderEASTriangleSvg(series, THEME_COLORS) }} />

          {partnerScores && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-2 text-left font-medium">Componente</th>
                    <th className="py-2 text-right font-medium">{patientName}</th>
                    <th className="py-2 text-right font-medium">{partnerName}</th>
                    <th className="py-2 text-right font-medium">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {[...COMPONENTS, 'TOTAL'].map(code => {
                    const own = factorScores[code] ?? 0;
                    const other = partnerScores[code] ?? 0;
                    const diff = own - other;
                    return (
                      <tr key={code} className={`border-b last:border-b-0 ${code === 'TOTAL' ? 'font-semibold' : ''}`}>
                        <td className="py-2">{code === 'TOTAL' ? 'Total' : EAS_SCORING[code as EASComponent].label}</td>
                        <td className="py-2 text-right tabular-nums">{own}</td>
                        <td className="py-2 text-right tabular-nums">{other}</td>
                        <td className="py-2 text-right tabular-nums">{diff > 0 ? `+${diff}` : diff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COMPONENTS.map(code => {
          const score = factorScores[code] ?? 0;
          const mean = score / ITEMS_PER_COMPONENT;
          return (
            <Card key={code}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Icon name={ICONS[code]} className="h-5 w-5 text-primary" />
                  {EAS_SCORING[code].label}
                </CardTitle>
                <CardDescription>{EAS_SCORING[code].description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold">{score}</span>
                    <span className="text-muted-foreground text-sm">/ {EAS_COMPONENT_MAX}</span>
                  </div>
                  <Progress
                    value={((score - EAS_COMPONENT_MIN) / (EAS_COMPONENT_MAX - EAS_COMPONENT_MIN)) * 100}
                    className="h-3"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Media por ítem {mean.toFixed(1).replace('.', ',')}</span>
                    <span>{easAnchorLabel(mean)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interpretación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            {isFlat
              ? 'Los tres componentes tienen la misma puntuación.'
              : `El componente más alto es ${EAS_SCORING[highest].label.toLowerCase()} (${factorScores[highest]}) y el más bajo, ${EAS_SCORING[lowest].label.toLowerCase()} (${factorScores[lowest]}).`}{' '}
            Puntuación total: {factorScores['TOTAL'] ?? 0} de 405.
          </p>
          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            Cada componente es la suma de 15 ítems puntuados de 1 a 9 (rango 15-135). La escala no
            dispone de baremos: la etiqueta de cada componente corresponde al ancla más cercana a su
            media por ítem (1 en absoluto, 3 algo, 5 moderadamente, 7 bastante, 9 extremadamente).
            Sternberg (1997), adaptación.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
