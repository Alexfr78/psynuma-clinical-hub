import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Activity, Brain, Sparkles, MessageSquareText, Lightbulb } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ItemAnalysis {
  example: string;
  frequency: number;
  category: string;
  categoryLabel: string;
  interpretation: string;
  clinicalRelevance: 'high' | 'moderate' | 'low';
  patterns?: string[];
  suggestedExploration?: string[];
}

interface AIAnalysis {
  itemAnalysis: Record<string, ItemAnalysis>;
  overallPatterns: string[];
  clinicalSummary: string;
  analyzedAt: string;
}

interface DESResultsViewProps {
  totalScore: number;
  amnesiaScore: number;
  depersonScore: number;
  absorptionScore: number;
  taxonScore: number;
  flags?: Record<string, boolean> | null;
  aiAnalysis?: AIAnalysis | null;
}

const DES_CUTOFFS = {
  clinical: 30,
  elevated: 20,
  taxon: 20,
};

const CATEGORY_ORDER = ['amnesia', 'depersonalization', 'absorption', 'taxon', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  amnesia: 'Amnesia Disociativa',
  depersonalization: 'Despersonalización/Desrealización',
  absorption: 'Absorción/Imaginación',
  taxon: 'Síntomas Disociativos Patológicos',
  other: 'Otras Experiencias',
};

function getLevel(score: number) {
  if (score >= DES_CUTOFFS.clinical) return { label: 'Clínico', color: 'text-destructive', bgColor: 'bg-destructive/10', borderColor: 'border-destructive' };
  if (score >= DES_CUTOFFS.elevated) return { label: 'Elevado', color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-500' };
  return { label: 'Normal', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-500' };
}

function getRelevanceBadge(relevance: string) {
  switch (relevance) {
    case 'high':
      return <Badge variant="destructive" className="text-xs">Alta relevancia</Badge>;
    case 'moderate':
      return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">Moderada</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">Baja</Badge>;
  }
}

export function DESResultsView({
  totalScore,
  amnesiaScore,
  depersonScore,
  absorptionScore,
  taxonScore,
  flags,
  aiAnalysis,
}: DESResultsViewProps) {
  const level = getLevel(totalScore);
  const isClinical = flags?.clinical || totalScore >= DES_CUTOFFS.clinical;
  const isElevated = flags?.elevated || (totalScore >= DES_CUTOFFS.elevated && totalScore < DES_CUTOFFS.clinical);
  const isTaxonPositive = flags?.taxon_positive || taxonScore >= DES_CUTOFFS.taxon;

  const subscales = [
    { code: 'DES_A', label: 'Amnesia Disociativa', score: amnesiaScore, description: 'Pérdida de memoria y lagunas temporales' },
    { code: 'DES_D', label: 'Despersonalización/Desrealización', score: depersonScore, description: 'Sensación de irrealidad' },
    { code: 'DES_I', label: 'Absorción/Imaginación', score: absorptionScore, description: 'Absorción en experiencias internas' },
    { code: 'DES_T', label: 'Taxón Disociativo', score: taxonScore, description: 'Indicador de disociación patológica' },
  ];

  // Group AI analysis by category
  const analysisByCategory: Record<string, ItemAnalysis[]> = {};
  if (aiAnalysis?.itemAnalysis) {
    Object.entries(aiAnalysis.itemAnalysis).forEach(([index, analysis]) => {
      const category = analysis.category || 'other';
      if (!analysisByCategory[category]) {
        analysisByCategory[category] = [];
      }
      analysisByCategory[category].push({ ...analysis, index } as any);
    });
  }

  const hasAIAnalysis = aiAnalysis && Object.keys(aiAnalysis.itemAnalysis || {}).length > 0;

  return (
    <div className="space-y-6">
      {/* Alerta de taxón positivo */}
      {isTaxonPositive && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Taxón Disociativo Positivo</p>
              <p className="text-sm text-muted-foreground">
                La puntuación DES-T ≥ 20 sugiere experiencias disociativas de tipo patológico.
                Se recomienda evaluación clínica más exhaustiva para descartar trastorno disociativo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Puntuación total */}
      <Card className={`${level.bgColor} ${level.borderColor} border-l-4`}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Puntuación Total DES
            </span>
            <Badge variant={isClinical ? 'destructive' : isElevated ? 'secondary' : 'default'}>
              {level.label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-bold ${level.color}`}>
              {totalScore.toFixed(1)}
            </span>
            <span className="text-muted-foreground">/ 100</span>
          </div>
          <Progress value={totalScore} max={100} className="h-3 mt-3" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2">
            <span>0% - Nunca</span>
            <span className="text-amber-600">20 (Elevado)</span>
            <span className="text-destructive">30 (Clínico)</span>
            <span>100% - Siempre</span>
          </div>
        </CardContent>
      </Card>

      {/* Subescalas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Subescalas DES
          </CardTitle>
          <CardDescription>
            Puntuaciones medias por tipo de experiencia disociativa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscales.map(({ code, label, score, description }) => {
            const isHighTaxon = code === 'DES_T' && score >= DES_CUTOFFS.taxon;
            const subscaleLevel = getLevel(score);
            
            return (
              <div key={code} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{label}</span>
                      {isHighTaxon && (
                        <Badge variant="destructive" className="text-xs">
                          Patológico
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                  <span className={`font-mono font-bold ${subscaleLevel.color}`}>
                    {score.toFixed(1)}%
                  </span>
                </div>
                <Progress 
                  value={score} 
                  max={100} 
                  className={`h-2 ${isHighTaxon ? '[&>div]:bg-destructive' : ''}`}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* AI Analysis Section */}
      {hasAIAnalysis && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Análisis Profundo de Experiencias
            </CardTitle>
            <CardDescription>
              Análisis clínico de los ejemplos proporcionados por el paciente
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Clinical Summary */}
            {aiAnalysis.clinicalSummary && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm">{aiAnalysis.clinicalSummary}</p>
              </div>
            )}

            {/* Overall Patterns */}
            {aiAnalysis.overallPatterns && aiAnalysis.overallPatterns.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Patrones Identificados
                </h4>
                <ul className="space-y-1">
                  {aiAnalysis.overallPatterns.map((pattern, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary">•</span>
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Detailed Analysis by Category */}
            <Accordion type="multiple" className="w-full">
              {CATEGORY_ORDER.filter(cat => analysisByCategory[cat]?.length > 0).map(category => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4" />
                      {CATEGORY_LABELS[category] || category}
                      <Badge variant="outline" className="ml-2">
                        {analysisByCategory[category].length} ejemplo{analysisByCategory[category].length > 1 ? 's' : ''}
                      </Badge>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2">
                      {analysisByCategory[category].map((item, idx) => (
                        <div key={idx} className="border-l-2 border-muted pl-4 space-y-2">
                          {/* Patient example */}
                          <div className="bg-muted/30 rounded p-3">
                            <p className="text-xs text-muted-foreground mb-1">
                              Frecuencia: {item.frequency}%
                            </p>
                            <p className="text-sm italic">"{item.example}"</p>
                          </div>
                          
                          {/* AI interpretation */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm">{item.interpretation}</p>
                            {getRelevanceBadge(item.clinicalRelevance)}
                          </div>

                          {/* Suggested exploration */}
                          {item.suggestedExploration && item.suggestedExploration.length > 0 && (
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium">Explorar:</span>{' '}
                              {item.suggestedExploration.join(' • ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <p className="text-xs text-muted-foreground mt-4">
              Análisis generado el {new Date(aiAnalysis.analyzedAt).toLocaleDateString('es-ES', { 
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' 
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Interpretación clínica */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Interpretación Clínica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isClinical ? (
            <div className="border-l-4 border-destructive pl-4 py-2">
              <p className="font-semibold text-destructive mb-2">Nivel Clínico (≥30)</p>
              <p className="text-sm text-muted-foreground">
                La puntuación total indica una probabilidad significativa de trastorno disociativo.
                Se recomienda evaluación clínica estructurada (ej. SCID-D, DDIS) para confirmar diagnóstico.
                Estas experiencias pueden estar asociadas a historia de trauma.
              </p>
            </div>
          ) : isElevated ? (
            <div className="border-l-4 border-amber-500 pl-4 py-2">
              <p className="font-semibold text-amber-600 mb-2">Nivel Elevado (≥20)</p>
              <p className="text-sm text-muted-foreground">
                La puntuación indica experiencias disociativas por encima de la media poblacional.
                Puede justificar exploración más detallada, especialmente si hay síntomas clínicos asociados
                o historia de trauma.
              </p>
            </div>
          ) : (
            <div className="border-l-4 border-green-500 pl-4 py-2 flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-600 mb-2">Rango Normal (&lt;20)</p>
                <p className="text-sm text-muted-foreground">
                  La puntuación no indica niveles clínicamente significativos de experiencias disociativas.
                  Las puntuaciones en este rango son comunes en la población general.
                </p>
              </div>
            </div>
          )}

          {isTaxonPositive && !isClinical && (
            <div className="border-l-4 border-destructive pl-4 py-2 mt-4">
              <p className="font-semibold text-destructive mb-2">Nota sobre DES-Taxón</p>
              <p className="text-sm text-muted-foreground">
                Aunque la puntuación total está dentro del rango normal, el DES-T elevado (≥20) 
                sugiere presencia de síntomas disociativos de tipo patológico (amnesia, 
                despersonalización, desrealización severa). Se recomienda valoración adicional.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referencias */}
      <p className="text-xs text-muted-foreground">
        DES (Dissociative Experiences Scale) - Bernstein Carlson & Putnam. 
        Puntos de corte basados en Carlson & Putnam (1993): ≥30 indica probable trastorno disociativo, 
        ≥20 experiencias elevadas. DES-T ≥20 indica taxón disociativo (Waller et al., 1996).
      </p>
    </div>
  );
}
