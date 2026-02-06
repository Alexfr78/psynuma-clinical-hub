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
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from 'recharts';
import { 
  PATTERN_CATEGORIES, 
  PROBLEMATIC_EMOTIONS, 
  FIGURE_FEELINGS, 
  TYPICAL_RESPONSES,
  EMO_FACTOR_LABELS,
  EMO_FACTOR_ORDER,
  type EMOFigureData,
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

interface EMOResultsViewProps {
  assessmentId: string;
  factorScores: Record<string, number>;
  answers: Record<string, any>;
  aiInterpretation?: EMOInterpretation;
  figures?: EMOFigureData[];
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

  // Preparar datos para el gráfico radar de patrones
  const radarData = EMO_FACTOR_ORDER.map(key => ({
    factor: EMO_FACTOR_LABELS[key]?.label || key,
    value: factorScores[key] || 0,
    fullMark: PATTERN_CATEGORIES[key as keyof typeof PATTERN_CATEGORIES]?.patterns?.length || 3,
  }));

  // Emociones problemáticas seleccionadas
  const problematicEmotions = answers['s1_difficult_emotions'] as string[] || answers['3'] as string[] || [];
  const emotionsCount = problematicEmotions.length;

  // Patrones seleccionados
  const selectedPatterns = answers['s1_patterns'] as string[] || [];
  // Also check legacy format
  const tendencies1 = answers['4'] as string[] || [];
  const tendencies2 = answers['5'] as string[] || [];
  const allPatterns = selectedPatterns.length > 0 ? selectedPatterns : [...tendencies1, ...tendencies2];
  const patternsCount = allPatterns.length;

  // Determinar patrón predominante
  const supresionScore = (factorScores['supresion'] || 0) + (factorScores['hipoactivacion'] || 0);
  const hiperScore = (factorScores['hiperactivacion'] || 0) + (factorScores['contagio'] || 0);
  const getPatternLabel = () => {
    if (supresionScore > hiperScore + 1) return { label: 'Hipoactivación', color: 'text-blue-600' };
    if (hiperScore > supresionScore + 1) return { label: 'Hiperactivación', color: 'text-orange-600' };
    if (supresionScore >= 2 && hiperScore >= 2) return { label: 'Mixto', color: 'text-purple-600' };
    return { label: 'Adaptativo', color: 'text-green-600' };
  };
  const pattern = getPatternLabel();

  // Figuras - support both new format and legacy
  const figuresData = figures.length > 0 ? figures : (answers['figures'] as EMOFigureData[] || []);

  // Generar interpretación con IA
  const handleGenerateInterpretation = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('interpret-emo-results', {
        body: { 
          assessmentId,
          factorScores,
          answers,
          figures: figuresData,
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
              Patrones
            </div>
            <p className="text-2xl font-bold">{patternsCount}</p>
            <p className="text-xs text-muted-foreground">de 15 posibles</p>
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
              Figuras Evaluadas
            </div>
            <p className="text-2xl font-bold">{figuresData.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alertas críticas */}
      {patternsCount >= 10 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Patrón de disregulación significativo</AlertTitle>
          <AlertDescription>
            Se han identificado {patternsCount} patrones disfuncionales, lo que sugiere dificultades importantes en la regulación emocional.
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
          {/* Gráfico radar de categorías de patrones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Perfil de Regulación Emocional</CardTitle>
              <CardDescription>
                Distribución de patrones por categoría (basado en la ventana de tolerancia)
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

          {/* Patrones seleccionados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Patrones Identificados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {allPatterns.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {p}
                  </Badge>
                ))}
                {allPatterns.length === 0 && (
                  <p className="text-muted-foreground text-sm">No se seleccionaron patrones</p>
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
        </TabsContent>

        <TabsContent value="figures" className="space-y-4">
          {figuresData.length > 0 ? (
            figuresData.map((figure, index) => (
              <Card key={figure.id || index}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {figure.name || `Figura ${index + 1}`}
                  </CardTitle>
                  <CardDescription>{figure.current_relation}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Balance de sentimientos */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        Sentimientos positivos
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(figure.feelings || [])
                          .filter(f => FIGURE_FEELINGS.positive.includes(f))
                          .map((f, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                              {f}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                        <TrendingDown className="h-4 w-4" />
                        Sentimientos negativos
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(figure.feelings || [])
                          .filter(f => FIGURE_FEELINGS.negative.includes(f))
                          .map((f, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                              {f}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  </div>

                  {/* Respuestas típicas */}
                  {figure.typical_responses && figure.typical_responses.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        Respuestas desadaptativas ({figure.typical_responses.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {figure.typical_responses.map((r, i) => (
                          <Badge key={i} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Adjetivos */}
                  {figure.adjectives && figure.adjectives.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Adjetivos descriptivos</p>
                      <div className="space-y-1">
                        {figure.adjectives.map((adj, i) => (
                          <div key={i} className="text-sm text-muted-foreground">
                            <span className="font-medium">{adj.adjective}</span>
                            {adj.example && <span>: "{adj.example}"</span>}
                          </div>
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
                <div className="border-b pb-3">
                  <p className="text-sm font-medium mb-1">¿Cómo describes tu forma de gestionar emociones?</p>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {answers['s1_description'] || answers['1'] || <em>Sin respuesta</em>}
                  </p>
                </div>
                <div className="border-b pb-3">
                  <p className="text-sm font-medium mb-1">¿Desde cuándo recuerdas estas dificultades?</p>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {answers['s1_since_when'] || answers['6'] || <em>Sin respuesta</em>}
                  </p>
                </div>
                <div className="pb-3">
                  <p className="text-sm font-medium mb-1">¿Ha habido periodos de empeoramiento?</p>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {answers['s1_worsening_periods'] || answers['7'] || <em>Sin respuesta</em>}
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Sección 2: Por cada figura */}
            {figuresData.map((figure, index) => (
              <AccordionItem key={figure.id || index} value={`figure-${index}`}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {figure.name || `Figura ${index + 1}`}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {figure.first_memory && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Primer recuerdo</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.first_memory}</p>
                    </div>
                  )}
                  {figure.reaction_distress && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Reacción cuando te sentías mal</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.reaction_distress}</p>
                    </div>
                  )}
                  {figure.reaction_success_failure && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Reacción ante éxitos/fracasos</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.reaction_success_failure}</p>
                    </div>
                  )}
                  {figure.physical_support && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Apoyo físico</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.physical_support}</p>
                    </div>
                  )}
                  {figure.emotional_support && (
                    <div className="pb-3">
                      <p className="text-sm font-medium mb-1">Apoyo emocional</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.emotional_support}</p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
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
