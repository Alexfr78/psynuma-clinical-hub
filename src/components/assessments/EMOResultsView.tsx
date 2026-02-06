import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Brain, Heart, Users, AlertTriangle, Sparkles, Loader2, 
  TrendingUp, TrendingDown, Activity, MessageSquare 
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { 
  TENDENCY_CATEGORIES, 
  PROBLEMATIC_EMOTIONS, 
  FIGURE_FEELINGS, 
  MALADAPTIVE_REACTIONS,
  EMO_FACTOR_LABELS,
  EMO_FACTOR_ORDER,
} from '@/data/emo-template';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EMOInterpretation {
  perfil_regulacion: string;
  patron_predominante: 'hipoactivacion' | 'hiperactivacion' | 'mixto' | 'adaptativo';
  calidad_apego: string;
  recursos_regulacion: string[];
  areas_intervencion: string[];
  hipotesis_origen: string;
  resumen_clinico: string;
}

interface FigureData {
  name: string;
  relationship: string;
  positive_feelings: string[];
  negative_feelings: string[];
  maladaptive_reactions: string[];
  responses: Record<string, string>;
}

interface EMOResultsViewProps {
  assessmentId: string;
  factorScores: Record<string, number>;
  answers: Record<string, any>;
  aiInterpretation?: EMOInterpretation;
  figures?: FigureData[];
}

export function EMOResultsView({ 
  assessmentId,
  factorScores, 
  answers, 
  aiInterpretation,
  figures = [],
}: EMOResultsViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [interpretation, setInterpretation] = useState<EMOInterpretation | undefined>(aiInterpretation);

  // Preparar datos para el gráfico radar de tendencias
  const radarData = EMO_FACTOR_ORDER.map(key => ({
    factor: EMO_FACTOR_LABELS[key]?.label || key,
    value: factorScores[key] || 0,
    fullMark: TENDENCY_CATEGORIES[key as keyof typeof TENDENCY_CATEGORIES]?.tendencies.length || 5,
  }));

  // Emociones problemáticas seleccionadas
  const problematicEmotions = answers['3'] as string[] || [];
  const emotionsCount = problematicEmotions.length;

  // Tendencias seleccionadas
  const tendencies1 = answers['4'] as string[] || [];
  const tendencies2 = answers['5'] as string[] || [];
  const allTendencies = [...tendencies1, ...tendencies2];
  const tendenciesCount = allTendencies.length;

  // Momentos positivos
  const positiveMoments = answers['18'] as string[] || [];
  const momentsCount = positiveMoments.filter(m => m && m.trim()).length;

  // Determinar patrón predominante
  const hypoScore = factorScores['hipoactivacion'] || 0;
  const hyperScore = factorScores['hiperactivacion'] || 0;
  const getPatternLabel = () => {
    if (hypoScore > hyperScore + 1) return { label: 'Hipoactivación', color: 'text-blue-600' };
    if (hyperScore > hypoScore + 1) return { label: 'Hiperactivación', color: 'text-orange-600' };
    if (hypoScore >= 2 && hyperScore >= 2) return { label: 'Mixto', color: 'text-purple-600' };
    return { label: 'Adaptativo', color: 'text-green-600' };
  };
  const pattern = getPatternLabel();

  // Generar interpretación con IA
  const handleGenerateInterpretation = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('interpret-emo-results', {
        body: { 
          assessmentId,
          factorScores,
          answers,
          figures,
        },
      });

      if (error) throw error;
      if (data?.interpretation) {
        setInterpretation(data.interpretation);
        toast.success('Interpretación generada correctamente');
      }
    } catch (err) {
      console.error('Error generating EMO interpretation:', err);
      toast.error('Error al generar la interpretación');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Resumen principal */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Heart className="h-4 w-4" />
              Emociones Problemáticas
            </div>
            <p className="text-2xl font-bold">{emotionsCount}</p>
            <p className="text-xs text-muted-foreground">de {PROBLEMATIC_EMOTIONS.length} posibles</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Activity className="h-4 w-4" />
              Tendencias
            </div>
            <p className="text-2xl font-bold">{tendenciesCount}</p>
            <p className="text-xs text-muted-foreground">de 17 posibles</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Brain className="h-4 w-4" />
              Patrón
            </div>
            <p className={`text-lg font-semibold ${pattern.color}`}>{pattern.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Users className="h-4 w-4" />
              Momentos Positivos
            </div>
            <p className="text-2xl font-bold">{momentsCount}</p>
            <p className="text-xs text-muted-foreground">de 10 posibles</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas críticas */}
      {tendenciesCount >= 10 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Patrón de disregulación significativo</AlertTitle>
          <AlertDescription>
            Se han identificado {tendenciesCount} tendencias disfuncionales, lo que sugiere dificultades importantes en la regulación emocional.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="patterns" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="patterns">Patrones</TabsTrigger>
          <TabsTrigger value="emotions">Emociones</TabsTrigger>
          <TabsTrigger value="figures">Figuras</TabsTrigger>
          <TabsTrigger value="responses">Respuestas</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-4">
          {/* Gráfico radar de categorías de tendencias */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Perfil de Regulación Emocional</CardTitle>
              <CardDescription>
                Distribución de tendencias por categoría (basado en la ventana de tolerancia)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="factor" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} />
                    <Radar
                      name="Puntuación"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.5}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Tendencias seleccionadas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Tendencias Identificadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allTendencies.map((tendency, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tendency}
                  </Badge>
                ))}
                {allTendencies.length === 0 && (
                  <p className="text-muted-foreground text-sm">No se seleccionaron tendencias</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="emotions" className="space-y-4">
          {/* Emociones problemáticas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Emociones Problemáticas</CardTitle>
              <CardDescription>
                Emociones que el paciente identifica como difíciles de manejar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {problematicEmotions.map((emotion, i) => (
                  <Badge key={i} variant="outline" className="text-sm">
                    {emotion}
                  </Badge>
                ))}
                {problematicEmotions.length === 0 && (
                  <p className="text-muted-foreground text-sm">No se identificaron emociones problemáticas</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Momentos de regulación positiva */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Momentos de Regulación Compartida
              </CardTitle>
              <CardDescription>
                Experiencias positivas de regulación emocional con otros
              </CardDescription>
            </CardHeader>
            <CardContent>
              {momentsCount > 0 ? (
                <ul className="space-y-2">
                  {positiveMoments.filter(m => m && m.trim()).map((moment, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-primary font-medium">{i + 1}.</span>
                      <span className="text-sm">{moment}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No se identificaron momentos de regulación compartida positiva
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="figures" className="space-y-4">
          {figures.length > 0 ? (
            figures.map((figure, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {figure.name || `Figura ${index + 1}`}
                  </CardTitle>
                  <CardDescription>{figure.relationship}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Balance de sentimientos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        Sentimientos positivos ({figure.positive_feelings.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {figure.positive_feelings.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                        <TrendingDown className="h-4 w-4" />
                        Sentimientos negativos ({figure.negative_feelings.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {figure.negative_feelings.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Reacciones desadaptativas */}
                  {figure.maladaptive_reactions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        Reacciones desadaptativas ({figure.maladaptive_reactions.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {figure.maladaptive_reactions.map((r, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No se han evaluado figuras reguladoras</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <Accordion type="multiple" className="w-full">
            {/* Sección 1: Regulación actual */}
            <AccordionItem value="section1">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Sección 1: Regulación Emocional Actual
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {[1, 2, 6, 7].map(index => (
                  <div key={index} className="border-b pb-3 last:border-b-0">
                    <p className="text-sm font-medium mb-1">
                      {index === 1 && '¿Cómo describes tu modo de regular emociones?'}
                      {index === 2 && '¿Tienes dificultad para sentir determinadas emociones?'}
                      {index === 6 && '¿Desde cuándo recuerdas estas dificultades?'}
                      {index === 7 && '¿Ha habido periodos de empeoramiento?'}
                    </p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {answers[index.toString()] || <em>Sin respuesta</em>}
                    </p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>

            {/* Sección 2: Figuras reguladoras */}
            <AccordionItem value="section2">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Sección 2: Historia de Figuras Reguladoras
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(index => (
                  <div key={index} className="border-b pb-3 last:border-b-0">
                    <p className="text-sm font-medium mb-1">
                      {index === 8 && '¿Con quién te criaste principalmente?'}
                      {index === 9 && '¿Hubo cambios significativos en la convivencia?'}
                      {index === 10 && '¿Figuras importantes fuera de la familia?'}
                      {index === 11 && '¿Cuidadores contratados?'}
                      {index === 12 && '¿Internados o instituciones?'}
                      {index === 13 && '¿Adopción o acogida?'}
                      {index === 14 && '¿Otras figuras relevantes?'}
                      {index === 15 && '¿Figuras con influencia positiva?'}
                      {index === 16 && '¿Figuras con influencia negativa?'}
                      {index === 17 && '¿Figuras ausentes emocionalmente?'}
                    </p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {answers[index.toString()] || <em>Sin respuesta</em>}
                    </p>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </TabsContent>
      </Tabs>

      {/* Panel de interpretación con IA */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Análisis Clínico con IA
          </CardTitle>
          <CardDescription>
            Interpretación automatizada basada en los patrones detectados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {interpretation ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-1">Perfil de Regulación Emocional</h4>
                <p className="text-sm text-muted-foreground">{interpretation.perfil_regulacion}</p>
              </div>
              
              <div>
                <h4 className="font-medium mb-1">Calidad del Apego Temprano</h4>
                <p className="text-sm text-muted-foreground">{interpretation.calidad_apego}</p>
              </div>

              <div>
                <h4 className="font-medium mb-1">Recursos de Regulación</h4>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {interpretation.recursos_regulacion.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-1">Áreas de Intervención Prioritarias</h4>
                <ul className="text-sm text-muted-foreground list-disc list-inside">
                  {interpretation.areas_intervencion.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-1">Hipótesis sobre Origen</h4>
                <p className="text-sm text-muted-foreground">{interpretation.hipotesis_origen}</p>
              </div>

              <div className="bg-muted/50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Resumen Clínico</h4>
                <p className="text-sm">{interpretation.resumen_clinico}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">
                Genera un análisis clínico automatizado basado en las respuestas del paciente
              </p>
              <Button onClick={handleGenerateInterpretation} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generando análisis...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generar Interpretación
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
