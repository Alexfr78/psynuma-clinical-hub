import { TrendingUp, Brain, Activity, Repeat } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { YBOCS2_CUTOFFS } from '@/data/ybocs2-template';

interface YBOCS2ResultsViewProps {
  totalScore: number;
  obsessionScore?: number;
  compulsionScore?: number;
}

export function YBOCS2ResultsView({
  totalScore,
  obsessionScore,
  compulsionScore,
}: YBOCS2ResultsViewProps) {
  const getLevel = (score: number) =>
    YBOCS2_CUTOFFS.find(c => score >= c.min && score <= c.max) || YBOCS2_CUTOFFS[0];

  const level = getLevel(totalScore);
  const progressPercent = (totalScore / 50) * 100;

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'green':
        return {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-400',
          border: 'border-green-500',
          badge: 'bg-green-500',
          progress: 'bg-green-500',
        };
      case 'yellow':
        return {
          bg: 'bg-yellow-100 dark:bg-yellow-900/30',
          text: 'text-yellow-700 dark:text-yellow-400',
          border: 'border-yellow-500',
          badge: 'bg-yellow-500',
          progress: 'bg-yellow-500',
        };
      case 'orange':
        return {
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-400',
          border: 'border-orange-500',
          badge: 'bg-orange-500',
          progress: 'bg-orange-500',
        };
      case 'red':
        return {
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-400',
          border: 'border-red-500',
          badge: 'bg-red-500',
          progress: 'bg-red-500',
        };
      default:
        return {
          bg: 'bg-muted',
          text: 'text-muted-foreground',
          border: 'border-muted',
          badge: 'bg-muted',
          progress: 'bg-muted',
        };
    }
  };

  const colors = getColorClasses(level.color);

  const getInterpretation = (levelName: string) => {
    switch (levelName) {
      case 'subclinico':
        return 'El paciente presenta un nivel subclínico de sintomatología obsesivo-compulsiva. No se evidencian indicadores clínicos significativos de TOC.';
      case 'leve':
        return 'El paciente presenta síntomas obsesivo-compulsivos leves. Los síntomas causan algo de malestar pero no interfieren significativamente en el funcionamiento diario.';
      case 'moderado':
        return 'El paciente presenta síntomas obsesivo-compulsivos moderados. Los síntomas causan malestar considerable e interfieren con el funcionamiento, aunque este sigue siendo manejable.';
      case 'grave':
        return 'El paciente presenta síntomas obsesivo-compulsivos graves. Los síntomas causan deterioro significativo en múltiples áreas de funcionamiento.';
      case 'extremo':
        return 'El paciente presenta síntomas obsesivo-compulsivos extremos. Los síntomas son incapacitantes y afectan gravemente todas las áreas de funcionamiento.';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Score Card */}
      <Card className={`${colors.bg} ${colors.border} border-l-4`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Puntuación Total Y-BOCS-II
            </CardTitle>
            <Badge className={`${colors.badge} text-white text-lg px-4 py-1`}>
              {totalScore} / 50
            </Badge>
          </div>
          <CardDescription>Índice de severidad obsesivo-compulsiva</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">0</span>
              <span className={`text-sm font-bold ${colors.text}`}>{level.label}</span>
              <span className="text-xs font-semibold text-muted-foreground">50</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${colors.progress}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Cutoff markers */}
            <div className="relative h-2 mt-1">
              <div className="absolute left-[16%] w-px h-2 bg-yellow-500" title="8 - Leve" />
              <div className="absolute left-[32%] w-px h-2 bg-orange-500" title="16 - Moderado" />
              <div className="absolute left-[48%] w-px h-2 bg-red-500" title="24 - Grave" />
              <div className="absolute left-[64%] w-px h-2 bg-red-700" title="32 - Extremo" />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1 text-center text-xs">
            {YBOCS2_CUTOFFS.map((cutoff) => (
              <div
                key={cutoff.level}
                className={`p-2 rounded ${level.level === cutoff.level ? colors.bg : 'bg-muted/50'} ${
                  level.level === cutoff.level ? 'ring-2 ring-offset-1' : ''
                }`}
              >
                <div className="font-semibold">{cutoff.min}-{cutoff.max}</div>
                <div className="text-muted-foreground text-[10px]">{cutoff.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscales Comparison */}
      {(obsessionScore !== undefined || compulsionScore !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Análisis por Subescalas
            </CardTitle>
            <CardDescription>
              Comparación entre gravedad de obsesiones y compulsiones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Obsessions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="font-medium">Obsesiones</span>
                  </div>
                  <Badge variant="outline">{obsessionScore ?? 0} / 25</Badge>
                </div>
                <Progress value={((obsessionScore ?? 0) / 25) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Ítems 1-5: tiempo, intervalos libres, control, angustia e interferencia de las obsesiones.
                </p>
              </div>

              {/* Compulsions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-primary" />
                    <span className="font-medium">Compulsiones</span>
                  </div>
                  <Badge variant="outline">{compulsionScore ?? 0} / 25</Badge>
                </div>
                <Progress value={((compulsionScore ?? 0) / 25) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Ítems 6-10: tiempo, resistencia, control, angustia e interferencia de las compulsiones.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clinical Interpretation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interpretación Clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{getInterpretation(level.level)}</p>

          {level.level !== 'subclinico' && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Recomendaciones:</h4>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                {level.level === 'leve' && (
                  <>
                    <li>Seguimiento periódico de la sintomatología</li>
                    <li>Psicoeducación sobre TOC y mecanismos de mantenimiento</li>
                    <li>Valorar inicio de TCC con exposición y prevención de respuesta (EPR)</li>
                    <li>Técnicas de manejo de ansiedad y mindfulness</li>
                  </>
                )}
                {level.level === 'moderado' && (
                  <>
                    <li>Intervención psicoterapéutica con TCC y EPR como primera línea</li>
                    <li>Valorar tratamiento farmacológico con ISRS si la respuesta a TCC es insuficiente</li>
                    <li>Establecer jerarquía de exposiciones graduadas</li>
                    <li>Monitorización frecuente del progreso</li>
                    <li>Trabajar la tolerancia a la incertidumbre</li>
                  </>
                )}
                {level.level === 'grave' && (
                  <>
                    <li>Tratamiento combinado: TCC intensiva + farmacología (ISRS a dosis altas)</li>
                    <li>Valorar derivación a unidad especializada en TOC</li>
                    <li>Considerar programa intensivo de EPR (diario o semi-intensivo)</li>
                    <li>Evaluar impacto funcional detallado y apoyo familiar</li>
                    <li>Monitorización estrecha de la evolución</li>
                  </>
                )}
                {level.level === 'extremo' && (
                  <>
                    <li>Derivación urgente a unidad especializada en TOC</li>
                    <li>Considerar programa de tratamiento intensivo/hospitalario</li>
                    <li>Tratamiento farmacológico agresivo: ISRS a dosis máximas, valorar potenciación</li>
                    <li>Valorar estrategias de potenciación (antipsicóticos atípicos, clomipramina)</li>
                    <li>Involucrar al entorno familiar en el plan terapéutico</li>
                    <li>Valorar estimulación cerebral profunda en casos refractarios</li>
                  </>
                )}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            Esta interpretación es orientativa y no sustituye el juicio clínico profesional.
            La Y-BOCS-II es una herramienta de evaluación que debe complementarse con una valoración clínica completa,
            incluyendo la Lista de Comprobación de Síntomas y la entrevista clínica estructurada.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
