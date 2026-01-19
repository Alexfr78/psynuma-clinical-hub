import { AlertTriangle, Brain, Heart, Activity, TrendingUp, TrendingDown, FileText, Scale } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  STAI_BAREMOS,
  getSTAIPercentileOfficial,
  getAgeGroup,
  generateMethodologicalNote,
  type AgeGroup,
  type Gender,
} from '@/data/stai-baremos';
import { getSTAITemplateData } from '@/data/stai-template';

interface STAIResultsViewProps {
  aeScore: number;
  arScore: number;
  patientGender?: string;
  patientAge?: number;
  isUniversityStudent?: boolean;
  administrationDate?: Date;
}

export function STAIResultsView({
  aeScore,
  arScore,
  patientGender,
  patientAge,
  isUniversityStudent,
  administrationDate = new Date(),
}: STAIResultsViewProps) {
  const gender: Gender = patientGender === 'male' ? 'male' : 'female';
  const ageGroup: AgeGroup = patientAge ? getAgeGroup(patientAge, isUniversityStudent) : 'adult';
  
  // Obtener percentiles y decatipos oficiales
  const aeData = getSTAIPercentileOfficial(aeScore, 'A_E', gender, ageGroup);
  const arData = getSTAIPercentileOfficial(arScore, 'A_R', gender, ageGroup);
  
  const templateData = getSTAITemplateData();
  const normative = STAI_BAREMOS[ageGroup].normative;
  
  // Determinar nivel según percentil
  const getLevel = (percentile: number): { label: string; color: string; description: string } => {
    if (percentile <= 25) return { label: 'Bajo', color: 'green', description: 'Por debajo del percentil 25' };
    if (percentile <= 50) return { label: 'Normal-Bajo', color: 'blue', description: 'Entre percentil 25-50' };
    if (percentile <= 75) return { label: 'Normal-Alto', color: 'blue', description: 'Entre percentil 50-75' };
    if (percentile <= 90) return { label: 'Elevado', color: 'orange', description: 'Entre percentil 75-90' };
    return { label: 'Muy Elevado', color: 'red', description: 'Por encima del percentil 90' };
  };
  
  const aeLevel = getLevel(aeData.percentile);
  const arLevel = getLevel(arData.percentile);
  
  // Determine profile interpretation key
  const getProfileKey = (): string => {
    const aeHigh = aeData.percentile > 75;
    const arHigh = arData.percentile > 75;
    
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
  
  const isHighAnxiety = aeData.percentile > 90 || arData.percentile > 90;
  
  const ageGroupLabels: Record<AgeGroup, string> = {
    adolescent: 'Adolescentes',
    university: 'Universitarios',
    adult: 'Adultos',
  };
  
  return (
    <div className="space-y-6">
      {/* Nota metodológica pericial */}
      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Información Metodológica (Uso Pericial)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-muted-foreground">Baremo:</span>
              <p className="font-medium">{ageGroupLabels[ageGroup]} - {gender === 'male' ? 'Varones' : 'Mujeres'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">N (A/E):</span>
              <p className="font-medium">{normative.n[gender].A_E}</p>
            </div>
            <div>
              <span className="text-muted-foreground">N (A/R):</span>
              <p className="font-medium">{normative.n[gender].A_R}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Edición:</span>
              <p className="font-medium">TEA 9ª ed. (2015)</p>
            </div>
          </div>
          <Alert className="mt-2">
            <FileText className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Puntuaciones transformadas según Tabla 10 del manual oficial (pág. 38). 
              Los resultados no constituyen diagnóstico y deben integrarse con entrevista clínica.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      
      {/* Alert for high anxiety */}
      {isHighAnxiety && (
        <Alert variant="destructive" className="border-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-lg font-bold">Niveles Clínicamente Significativos</AlertTitle>
          <AlertDescription className="text-sm mt-2">
            <p className="font-medium mb-2">
              Se detectan puntuaciones por encima del percentil 90 que requieren atención clínica.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {aeData.percentile > 90 && <li>Ansiedad Estado: P{aeData.percentile} (muy elevada)</li>}
              {arData.percentile > 90 && <li>Ansiedad Rasgo: P{arData.percentile} (muy elevada)</li>}
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
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Percentil</span>
                <Badge variant="outline" className="font-mono font-bold">P{aeData.percentile}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Decatipo</span>
                <Badge variant="outline" className="font-mono font-bold">D{aeData.decatipo}</Badge>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground border-t pt-2">
              <p>Media normativa: {normative.mean[gender].A_E.toFixed(2)} (DT: {normative.sd[gender].A_E.toFixed(2)})</p>
            </div>
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
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Percentil</span>
                <Badge variant="outline" className="font-mono font-bold">P{arData.percentile}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Decatipo</span>
                <Badge variant="outline" className="font-mono font-bold">D{arData.decatipo}</Badge>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground border-t pt-2">
              <p>Media normativa: {normative.mean[gender].A_R.toFixed(2)} (DT: {normative.sd[gender].A_R.toFixed(2)})</p>
            </div>
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
                  <Badge variant="outline">{aeScore} (P{aeData.percentile})</Badge>
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
                  <Badge variant="outline">{arScore} (P{arData.percentile})</Badge>
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
          <CardTitle className="text-lg">Orientación Clínica del Perfil</CardTitle>
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
            <h4 className="font-semibold text-sm">Orientaciones de Intervención:</h4>
            <p className="text-sm text-muted-foreground">{profileInterpretation?.intervention}</p>
          </div>
          
          {/* Reference ranges - percentile based */}
          <div className="pt-4 border-t">
            <h4 className="font-semibold text-sm mb-3">Rangos de Referencia (Percentiles):</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
              <div className="p-2 rounded bg-green-100 dark:bg-green-900/30">
                <div className="font-semibold">P1-25</div>
                <div className="text-muted-foreground">Bajo</div>
              </div>
              <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30">
                <div className="font-semibold">P26-50</div>
                <div className="text-muted-foreground">Normal-Bajo</div>
              </div>
              <div className="p-2 rounded bg-blue-100 dark:bg-blue-900/30">
                <div className="font-semibold">P51-75</div>
                <div className="text-muted-foreground">Normal-Alto</div>
              </div>
              <div className="p-2 rounded bg-orange-100 dark:bg-orange-900/30">
                <div className="font-semibold">P76-90</div>
                <div className="text-muted-foreground">Elevado</div>
              </div>
              <div className="p-2 rounded bg-red-100 dark:bg-red-900/30">
                <div className="font-semibold">P91-99</div>
                <div className="text-muted-foreground">Muy Elevado</div>
              </div>
            </div>
          </div>
          
          <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
              <strong>ADVERTENCIA PERICIAL:</strong> Esta interpretación es orientativa y no sustituye 
              el juicio clínico profesional. Los resultados del STAI reflejan el autoinforme del 
              evaluado y deben integrarse con entrevista clínica, observación conductual y otros 
              instrumentos de evaluación. No se deben extraer conclusiones diagnósticas exclusivamente 
              de estas puntuaciones.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
