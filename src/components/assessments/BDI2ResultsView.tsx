import { AlertTriangle, TrendingUp, Brain, Activity } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BDI2_CUTOFFS } from '@/data/bdi2-template';

interface BDI2ResultsViewProps {
  totalScore: number;
  cogAffectScore?: number;
  somVegScore?: number;
  suicideAlert?: boolean;
  item9Score?: number;
}

export function BDI2ResultsView({
  totalScore,
  cogAffectScore,
  somVegScore,
  suicideAlert,
  item9Score,
}: BDI2ResultsViewProps) {
  // Determine depression level based on cutoffs
  const getLevel = (score: number) => {
    return BDI2_CUTOFFS.find(c => score >= c.min && score <= c.max) || BDI2_CUTOFFS[0];
  };

  const level = getLevel(totalScore);
  const progressPercent = (totalScore / 63) * 100;

  const getColorClasses = (levelColor: string) => {
    switch (levelColor) {
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

  // Interpretation text based on level
  const getInterpretation = (levelName: string) => {
    switch (levelName) {
      case 'minima':
        return 'El paciente presenta un nivel mínimo de sintomatología depresiva. No se evidencian indicadores clínicos significativos de depresión.';
      case 'leve':
        return 'El paciente presenta síntomas depresivos leves. Se recomienda seguimiento y valoración de posibles factores de riesgo o mantenimiento.';
      case 'moderada':
        return 'El paciente presenta síntomas depresivos moderados. Se recomienda intervención terapéutica y considerar valoración psiquiátrica.';
      case 'grave':
        return 'El paciente presenta síntomas depresivos graves. Se recomienda intervención inmediata, valoración de riesgo suicida y derivación psiquiátrica.';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Suicide Alert - Item 9 */}
      {(suicideAlert || (item9Score !== undefined && item9Score >= 2)) && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">⚠️ ALERTA DE RIESGO SUICIDA</AlertTitle>
          <AlertDescription className="text-sm mt-2">
            <p className="font-medium mb-2">
              El paciente ha indicado ideación suicida significativa (Ítem 9 = {item9Score}).
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Realizar valoración inmediata de riesgo suicida</li>
              <li>Explorar plan, acceso a medios, intentos previos</li>
              <li>Considerar derivación urgente si procede</li>
              <li>Establecer plan de seguridad con el paciente</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Score Card */}
      <Card className={`${colors.bg} ${colors.border} border-l-4`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Puntuación Total BDI-II
            </CardTitle>
            <Badge className={`${colors.badge} text-white text-lg px-4 py-1`}>
              {totalScore} / 63
            </Badge>
          </div>
          <CardDescription>Índice de severidad depresiva</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative pt-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">0</span>
              <span className={`text-sm font-bold ${colors.text}`}>{level.label}</span>
              <span className="text-xs font-semibold text-muted-foreground">63</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${colors.progress}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {/* Cutoff markers */}
            <div className="relative h-2 mt-1">
              <div className="absolute left-[20.6%] w-px h-2 bg-yellow-500" title="14 - Leve" />
              <div className="absolute left-[31.7%] w-px h-2 bg-orange-500" title="20 - Moderada" />
              <div className="absolute left-[46%] w-px h-2 bg-red-500" title="29 - Grave" />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {BDI2_CUTOFFS.map((cutoff) => (
              <div
                key={cutoff.level}
                className={`p-2 rounded ${level.level === cutoff.level ? colors.bg : 'bg-muted/50'} ${
                  level.level === cutoff.level ? 'ring-2 ring-offset-1' : ''
                }`}
              >
                <div className="font-semibold">{cutoff.min}-{cutoff.max}</div>
                <div className="text-muted-foreground">{cutoff.label.replace('Depresión ', '')}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Subscales Comparison */}
      {(cogAffectScore !== undefined || somVegScore !== undefined) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Análisis por Dimensiones
            </CardTitle>
            <CardDescription>
              Comparación entre factores cognitivo-afectivos y somático-vegetativos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cognitive-Affective */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" />
                    <span className="font-medium">Cognitivo-Afectivo</span>
                  </div>
                  <Badge variant="outline">{cogAffectScore ?? 0} / 42</Badge>
                </div>
                <Progress value={((cogAffectScore ?? 0) / 42) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Ítems 1-14: tristeza, pesimismo, culpa, pérdida de placer, autocrítica, etc.
                </p>
              </div>

              {/* Somatic-Vegetative */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <span className="font-medium">Somático-Vegetativo</span>
                  </div>
                  <Badge variant="outline">{somVegScore ?? 0} / 21</Badge>
                </div>
                <Progress value={((somVegScore ?? 0) / 21) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  Ítems 15-21: energía, sueño, irritabilidad, apetito, concentración, fatiga, sexo.
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

          {level.level !== 'minima' && (
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Recomendaciones:</h4>
              <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                {level.level === 'leve' && (
                  <>
                    <li>Seguimiento periódico de la sintomatología</li>
                    <li>Psicoeducación sobre depresión y factores de riesgo</li>
                    <li>Activación conductual y programación de actividades agradables</li>
                    <li>Valorar inicio de psicoterapia estructurada</li>
                  </>
                )}
                {level.level === 'moderada' && (
                  <>
                    <li>Intervención psicoterapéutica estructurada (TCC, EMDR, etc.)</li>
                    <li>Valoración por psiquiatría para considerar tratamiento farmacológico</li>
                    <li>Establecer objetivos terapéuticos claros</li>
                    <li>Monitorización frecuente del estado de ánimo</li>
                    <li>Explorar ideación autolítica y establecer plan de seguridad</li>
                  </>
                )}
                {level.level === 'grave' && (
                  <>
                    <li>Derivación urgente a psiquiatría</li>
                    <li>Valoración de riesgo autolítico exhaustiva</li>
                    <li>Considerar hospitalización si hay riesgo inminente</li>
                    <li>Tratamiento combinado: psicoterapia + farmacología</li>
                    <li>Contacto frecuente y seguimiento estrecho</li>
                    <li>Involucrar a familiares en el plan terapéutico</li>
                  </>
                )}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            Esta interpretación es orientativa y no sustituye el juicio clínico profesional.
            El BDI-II es una herramienta de cribado que debe complementarse con una evaluación clínica completa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
