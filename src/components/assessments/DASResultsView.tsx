import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

import { DAS_SCORING } from '@/data/das-template';
import { DAS_FACTOR_ORDER } from '@/lib/assessment-utils';
import { Icon } from '@/components/ui/icon';
import { DASProfileChart } from './DASProfileChart';

interface DASResultsViewProps {
  factorScores: Record<string, number>;
}

const SCALE_MAX: Record<string, number> = { CON: 65, SAT: 50, EXP: 12, COH: 24, TOTAL: 151 };

const SCALE_INFO: Record<string, { label: string; description: string }> = {
  ...DAS_SCORING,
  TOTAL: {
    label: 'Ajuste diádico',
    description: 'Puntuación global de la calidad de la relación (suma de las cuatro escalas)',
  },
};

// En el DAS, una T alta indica mejor ajuste de pareja
function getTLevel(t: number): { label: string; className: string } {
  if (t < 30) return { label: 'Muy bajo', className: 'text-destructive' };
  if (t < 40) return { label: 'Bajo', className: 'text-orange-600 dark:text-orange-400' };
  if (t < 60) return { label: 'Medio', className: 'text-muted-foreground' };
  if (t < 70) return { label: 'Alto', className: 'text-green-700 dark:text-green-400' };
  return { label: 'Muy alto', className: 'text-green-700 dark:text-green-400' };
}

export function DASResultsView({ factorScores }: DASResultsViewProps) {
  const lowScales = DAS_FACTOR_ORDER.filter(code => (factorScores[`${code}_T_GEN`] ?? 50) < 40);
  const totalTGen = factorScores['TOTAL_T_GEN'];
  const totalTClin = factorScores['TOTAL_T_CLIN'];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Perfil</CardTitle>
          <CardDescription>
            Puntuaciones T por escala. La franja sombreada marca el rango medio (T 40-60).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DASProfileChart factorScores={factorScores} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DAS_FACTOR_ORDER.map(code => {
          const raw = factorScores[code] ?? 0;
          const tGen = factorScores[`${code}_T_GEN`];
          const tClin = factorScores[`${code}_T_CLIN`];
          const isLow = tGen !== undefined && tGen < 40;
          const level = tGen !== undefined ? getTLevel(tGen) : null;
          const isTotal = code === 'TOTAL';

          return (
            <Card
              key={code}
              className={`${isTotal ? 'md:col-span-2' : ''} ${isLow ? 'border-destructive' : ''}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon name={isTotal ? 'favorite' : 'group'} className="h-5 w-5 text-primary" />
                    {SCALE_INFO[code].label}
                  </CardTitle>
                  {isLow && (
                    <Badge variant="destructive" className="gap-1">
                      <Icon name="warning" className="h-3 w-3" />
                      Bajo
                    </Badge>
                  )}
                </div>
                <CardDescription>{SCALE_INFO[code].description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between gap-4">
                    <div>
                      <span className="text-3xl font-bold">{tGen ?? '—'}</span>
                      <span className="text-muted-foreground text-sm ml-1">T general</span>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>PD {raw} / {SCALE_MAX[code]}</div>
                      <div>T clínico {tClin ?? '—'}</div>
                    </div>
                  </div>
                  {tGen !== undefined && (
                    <Progress
                      value={((tGen - 20) / 60) * 100}
                      className={`h-3 ${isLow ? '[&>div]:bg-destructive' : ''}`}
                    />
                  )}
                  {level && (
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Media 50 · DT 10</span>
                      <span className={level.className}>{level.label}</span>
                    </div>
                  )}
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
        <CardContent className="space-y-4">
          {lowScales.length > 0 ? (
            <div className="border-l-4 border-destructive pl-4">
              <p className="font-medium text-destructive">Áreas por debajo de lo esperado</p>
              <p className="text-sm text-muted-foreground mt-1">
                {lowScales.map(code => SCALE_INFO[code].label).join(', ')}: puntuación T general
                inferior a 40, más de una desviación típica por debajo de la media de la población general.
              </p>
            </div>
          ) : (
            <div className="border-l-4 border-green-500 pl-4">
              <p className="font-medium text-green-700 dark:text-green-400">
                Sin escalas por debajo de lo esperado
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Todas las escalas tienen una puntuación T general de 40 o más.
              </p>
            </div>
          )}

          {totalTGen !== undefined && totalTClin !== undefined && (
            <p className="text-sm">
              El ajuste diádico global está en T {totalTGen} respecto a la población general y en
              T {totalTClin} respecto a parejas en contexto clínico.
            </p>
          )}

          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            Puntuaciones T (media 50, DT 10) según la hoja de perfil de la adaptación española del DAS
            (TEA Ediciones, 2017). Puntuaciones más altas indican mejor ajuste de pareja. El baremo
            clínico compara con parejas en contexto clínico.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
