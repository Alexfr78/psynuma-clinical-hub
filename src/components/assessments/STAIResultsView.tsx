import { AlertTriangle, Brain, Heart, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  getSTAILevel, 
  getSTAIPercentile,
  getSTAITemplateData,
} from '@/data/stai-template';

interface STAIResultsViewProps {
  aeScore: number;
  arScore: number;
  patientGender?: string;
}

export function STAIResultsView({
  aeScore,
  arScore,
  patientGender,
}: STAIResultsViewProps) {
  const gender = patientGender === 'male' ? 'male' : 'female';
  
  const aeLevel = getSTAILevel(aeScore, 'A_E');
  const arLevel = getSTAILevel(arScore, 'A_R');
  
  const aePercentile = getSTAIPercentile(aeScore, 'A_E', gender);
  const arPercentile = getSTAIPercentile(arScore, 'A_R', gender);
  
  const templateData = getSTAITemplateData();
  
  // Determine profile interpretation key
  const getProfileKey = (): string => {
    const aeHigh = aeScore > 30;
    const arHigh = arScore > 30;
    
    if (aeHigh && arHigh) return 'A_E_high_A_R_high';
    if (aeHigh && !arHigh) return 'A_E_high_A_R_low';
    if (!aeHigh && arHigh) return 'A_E_low_A_R_high';
    return 'A_E_low_A_R_low';
  };
  
  const profileKey = getProfileKey();
  const profileInterpretation = templateData.interpretations[profileKey];
  
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
      case 'blue':
        return {
          bg: 'bg-blue-100 dark:bg-blue-900/30',
          text: 'text-blue-700 dark:text-blue-400',
          border: 'border-blue-500',
          badge: 'bg-blue-500',
          progress: 'bg-blue-500',
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
  
  const aeColors = getColorClasses(aeLevel.color);
  const arColors = getColorClasses(arLevel.color);
  
  const isHighAnxiety = aeScore > 40 || arScore > 40;
  
  return (
    <div className="space-y-6">
      {/* Alert for high anxiety */}
      {isHighAnxiety && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">Niveles Elevados de Ansiedad</AlertTitle>
          <AlertDescription className="text-sm mt-2">
            <p className="font-medium mb-2">
              Se detectan niveles significativamente elevados de ansiedad que requieren atención clínica.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {aeScore > 40 && <li>Ansiedad Estado muy elevada: estado de activación actual significativo</li>}
              {arScore > 40 && <li>Ansiedad Rasgo muy elevada: predisposición ansiosa marcada</li>}
              <li>Considerar intervención terapéutica estructurada</li>
              <li>Valorar derivación psiquiátrica si procede</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Main Scores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Ansiedad Estado Card */}
        <Card className={`${aeColors.bg} ${aeColors.border} border-l-4`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Heart className="h-5 w-5" />
                Ansiedad Estado (A/E)
              </CardTitle>
              <Badge className={`${aeColors.badge} text-white text-lg px-4 py-1`}>
                {aeScore} / 60
              </Badge>
            </div>
            <CardDescription>Cómo se siente AHORA MISMO</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">0</span>
                <span className={`text-sm font-bold ${aeColors.text}`}>{aeLevel.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">60</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${aeColors.progress}`}
                  style={{ width: `${(aeScore / 60) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Percentil</span>
              <Badge variant="outline" className="font-mono">P{aePercentile}</Badge>
            </div>
            
            <p className="text-xs text-muted-foreground">{aeLevel.description}</p>
          </CardContent>
        </Card>
        
        {/* Ansiedad Rasgo Card */}
        <Card className={`${arColors.bg} ${arColors.border} border-l-4`}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Ansiedad Rasgo (A/R)
              </CardTitle>
              <Badge className={`${arColors.badge} text-white text-lg px-4 py-1`}>
                {arScore} / 60
              </Badge>
            </div>
            <CardDescription>Cómo se siente EN GENERAL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative pt-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">0</span>
                <span className={`text-sm font-bold ${arColors.text}`}>{arLevel.label}</span>
                <span className="text-xs font-semibold text-muted-foreground">60</span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${arColors.progress}`}
                  style={{ width: `${(arScore / 60) * 100}%` }}
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Percentil</span>
              <Badge variant="outline" className="font-mono">P{arPercentile}</Badge>
            </div>
            
            <p className="text-xs text-muted-foreground">{arLevel.description}</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Profile Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Comparación Estado vs Rasgo
          </CardTitle>
          <CardDescription>
            Análisis diferencial entre ansiedad situacional y predisposición ansiosa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Estado (A/E)</span>
                <div className="flex items-center gap-2">
                  {aeScore > arScore ? (
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                  ) : aeScore < arScore ? (
                    <TrendingDown className="h-4 w-4 text-blue-500" />
                  ) : null}
                  <Badge variant="outline">{aeScore}</Badge>
                </div>
              </div>
              <Progress value={(aeScore / 60) * 100} className="h-2" />
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Rasgo (A/R)</span>
                <div className="flex items-center gap-2">
                  {arScore > aeScore ? (
                    <TrendingUp className="h-4 w-4 text-orange-500" />
                  ) : arScore < aeScore ? (
                    <TrendingDown className="h-4 w-4 text-blue-500" />
                  ) : null}
                  <Badge variant="outline">{arScore}</Badge>
                </div>
              </div>
              <Progress value={(arScore / 60) * 100} className="h-2" />
            </div>
          </div>
          
          {/* Difference indicator */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Diferencia Estado - Rasgo:</span>
              <Badge variant={Math.abs(aeScore - arScore) > 10 ? 'default' : 'secondary'}>
                {aeScore - arScore > 0 ? '+' : ''}{aeScore - arScore} puntos
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {aeScore - arScore > 10 
                ? 'La ansiedad actual es significativamente mayor que la habitual, sugiriendo una reacción situacional.'
                : aeScore - arScore < -10
                ? 'La ansiedad actual es menor que la habitual, lo que puede indicar un momento de baja demanda.'
                : 'La ansiedad estado y rasgo son similares, lo que indica consistencia entre el estado actual y la predisposición general.'}
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Clinical Interpretation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interpretación Clínica del Perfil</CardTitle>
          <CardDescription>
            Análisis basado en la combinación de puntuaciones Estado-Rasgo
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted/30">
            <h4 className="font-semibold mb-2">Perfil Identificado:</h4>
            <p className="text-sm">{profileInterpretation?.interpretation}</p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Recomendaciones de Intervención:</h4>
            <p className="text-sm text-muted-foreground">{profileInterpretation?.intervention}</p>
          </div>
          
          {/* Reference ranges */}
          <div className="pt-4 border-t">
            <h4 className="font-semibold text-sm mb-3">Rangos de Referencia:</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-green-100 dark:bg-green-900/30">
                <div className="font-semibold">0-19</div>
                <div className="text-muted-foreground">Baja</div>
              </div>
              <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30">
                <div className="font-semibold">20-30</div>
                <div className="text-muted-foreground">Normal</div>
              </div>
              <div className="p-2 rounded bg-orange-100 dark:bg-orange-900/30">
                <div className="font-semibold">31-40</div>
                <div className="text-muted-foreground">Moderada</div>
              </div>
              <div className="p-2 rounded bg-red-100 dark:bg-red-900/30">
                <div className="font-semibold">41-60</div>
                <div className="text-muted-foreground">Alta</div>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground italic pt-2 border-t">
            Los baremos utilizados corresponden a la adaptación española del STAI (TEA Ediciones).
            Esta interpretación es orientativa y no sustituye el juicio clínico profesional.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
