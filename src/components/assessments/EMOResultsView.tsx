import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { 
  REGULATION_INDICATORS,
  RELATIONAL_INDICATORS,
  FIGURE_FEELINGS_POSITIVE,
  FIGURE_FEELINGS_NEGATIVE,
  PROBLEMATIC_EMOTIONS,
  calculateEMOIndicators,
  type EMOFigureData,
  type EMOAnswers,
  type EMOIndicators,
} from '@/data/emo-template';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Icon } from '@/components/ui/icon';

export interface EMOInterpretation {
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
  answers: Record<string, unknown>;
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

  // Prepare answers in the new format
  const emoAnswers = {
    emo_reg_general: answers['emo_reg_general'] || answers['s1_description'] || answers['1'],
    emo_dificultad_sentir: answers['emo_dificultad_sentir'],
    emo_dificultad_sentir_explicacion: answers['emo_dificultad_sentir_explicacion'],
    emo_emociones_problematicas: answers['emo_emociones_problematicas'] || answers['s1_difficult_emotions'] || answers['3'] || [],
    emo_emociones_problematicas_otro: answers['emo_emociones_problematicas_otro'],
    emo_emociones_problematicas_por_que: answers['emo_emociones_problematicas_por_que'],
    emo_patrones_1: answers['emo_patrones_1'] || [],
    emo_patrones_2: answers['emo_patrones_2'] || [],
    emo_desde_cuando: answers['emo_desde_cuando'] || answers['s1_since_when'] || answers['6'],
    emo_empeoro: answers['emo_empeoro'],
    emo_empeoro_cuando: answers['emo_empeoro_cuando'] || answers['s1_worsening_periods'] || answers['7'],
    emo_quienes_crianza: answers['emo_quienes_crianza'],
    emo_cambio_convivencia: answers['emo_cambio_convivencia'],
    emo_figuras_positivas: answers['emo_figuras_positivas'],
    emo_figuras_negativas: answers['emo_figuras_negativas'],
    emo_figuras_ausentes: answers['emo_figuras_ausentes'],
    emo_momentos_coregulacion: answers['emo_momentos_coregulacion'] || [],
    figures: figures.length > 0 ? figures : (answers['figures'] || []),
  } as unknown as EMOAnswers;

  // Calculate indicators
  const indicators = calculateEMOIndicators(emoAnswers);

  // Legacy pattern support
  const legacyPatterns = answers['s1_patterns'] as string[] || [];
  const tendencies1 = answers['4'] as string[] || [];
  const tendencies2 = answers['5'] as string[] || [];
  const allPatterns = [
    ...(emoAnswers.emo_patrones_1 || []),
    ...(emoAnswers.emo_patrones_2 || []),
    ...legacyPatterns,
    ...tendencies1,
    ...tendencies2,
  ];
  const uniquePatterns = [...new Set(allPatterns)];

  // Problematic emotions
  const problematicEmotions = emoAnswers.emo_emociones_problematicas || [];
  const emotionsCount = problematicEmotions.length;

  // Figures data
  const figuresData = emoAnswers.figures || [];

  // Detected regulation indicators
  const detectedRegulation = indicators.regulation.filter(r => r.detected);

  // Determine predominant pattern
  const hasHipo = detectedRegulation.some(r => r.id === 'supresion_evitacion');
  const hasHiper = detectedRegulation.some(r => r.id === 'hiperactivacion_desborde');
  const getPatternLabel = () => {
    if (hasHipo && hasHiper) return { label: 'Mixto', color: 'text-purple-600' };
    if (hasHipo) return { label: 'Hipoactivación', color: 'text-blue-600' };
    if (hasHiper) return { label: 'Hiperactivación', color: 'text-orange-600' };
    return { label: 'No definido', color: 'text-muted-foreground' };
  };
  const pattern = getPatternLabel();

  // Generate AI interpretation
  const handleGenerateInterpretation = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('interpret-emo-results', {
        body: { 
          assessmentId,
          factorScores,
          answers: emoAnswers,
          figures: figuresData,
          indicators,
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
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Icon name="favorite" className="h-4 w-4" />
              Emociones Problemáticas
            </div>
            <p className="text-2xl font-bold">{emotionsCount}</p>
            <p className="text-xs text-muted-foreground">de {PROBLEMATIC_EMOTIONS.length} posibles</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Icon name="monitor_heart" className="h-4 w-4" />
              Indicadores
            </div>
            <p className="text-2xl font-bold">{detectedRegulation.length}</p>
            <p className="text-xs text-muted-foreground">patrones detectados</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Icon name="psychology" className="h-4 w-4" />
              Patrón
            </div>
            <p className={`text-lg font-semibold ${pattern.color}`}>{pattern.label}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Icon name="group" className="h-4 w-4" />
              Figuras Evaluadas
            </div>
            <p className="text-2xl font-bold">{figuresData.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical alerts */}
      {detectedRegulation.length >= 4 && (
        <Alert variant="destructive">
          <Icon name="warning" className="h-4 w-4" />
          <AlertTitle>Patrón de disregulación significativo</AlertTitle>
          <AlertDescription>
            Se han identificado múltiples indicadores de dificultades en la regulación emocional.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="indicators" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="indicators">Indicadores</TabsTrigger>
          <TabsTrigger value="emotions">Emociones</TabsTrigger>
          <TabsTrigger value="figures">Figuras</TabsTrigger>
          <TabsTrigger value="responses">Respuestas</TabsTrigger>
        </TabsList>

        <TabsContent value="indicators" className="space-y-4">
          {/* Regulation indicators */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Indicadores de Regulación</CardTitle>
              <CardDescription>
                Patrones de regulación emocional detectados en las respuestas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {indicators.regulation.map(indicator => (
                <div 
                  key={indicator.id} 
                  className={`p-3 rounded-lg border ${indicator.detected ? 'bg-amber-50 border-amber-200' : 'bg-muted/30'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${indicator.detected ? 'text-amber-800' : 'text-muted-foreground'}`}>
                      {indicator.label}
                    </span>
                    {indicator.detected && (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                        Detectado
                      </Badge>
                    )}
                  </div>
                  {indicator.detected && indicator.matchedPatterns.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {indicator.matchedPatterns.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* All selected patterns */}
          {uniquePatterns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Todas las afirmaciones seleccionadas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {uniquePatterns.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="emotions" className="space-y-4">
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

          {emoAnswers.emo_emociones_problematicas_por_que && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Explicación del paciente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                  {emoAnswers.emo_emociones_problematicas_por_que}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="figures" className="space-y-4">
          {figuresData.length > 0 ? (
            figuresData.map((figure, index) => {
              const figureIndicators = indicators.relational.find(r => r.figureId === figure.id);
              const detectedRelational = figureIndicators?.indicators.filter(i => i.detected) || [];
              
              return (
                <Card key={figure.id || index}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Icon name="group" className="h-5 w-5" />
                      {figure.figure_name || `Figura ${index + 1}`}
                    </CardTitle>
                    <CardDescription>{figure.figure_relation}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Relational indicators */}
                    {detectedRelational.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                          <Icon name="warning" className="h-4 w-4" />
                          Indicadores relacionales
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {detectedRelational.map((ind, i) => (
                            <Badge key={i} variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                              {ind.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Feelings balance */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-green-700 mb-2 flex items-center gap-1">
                          <Icon name="trending_up" className="h-4 w-4" />
                          Sentimientos positivos ({figureIndicators?.positiveCount || 0})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(figure.figure_feelings_words || [])
                            .filter(f => FIGURE_FEELINGS_POSITIVE.includes(f))
                            .map((f, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                {f}
                              </Badge>
                            ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
                          <Icon name="trending_down" className="h-4 w-4" />
                          Sentimientos negativos ({figureIndicators?.negativeCount || 0})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(figure.figure_feelings_words || [])
                            .filter(f => FIGURE_FEELINGS_NEGATIVE.includes(f))
                            .map((f, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                                {f}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* Reactions */}
                    {figure.figure_reactions_to_your_emotion && figure.figure_reactions_to_your_emotion.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Reacciones típicas de la figura</p>
                        <div className="flex flex-wrap gap-1">
                          {figure.figure_reactions_to_your_emotion.map((r, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {r}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Adjectives */}
                    {figure.figure_adjectives && figure.figure_adjectives.some(a => a.adjective) && (
                      <div>
                        <p className="text-sm font-medium mb-2">Adjetivos descriptivos</p>
                        <div className="space-y-1">
                          {figure.figure_adjectives
                            .filter(adj => adj.adjective)
                            .map((adj, i) => (
                              <div key={i} className="text-sm text-muted-foreground">
                                <span className="font-medium">{adj.adjective}</span>
                                {adj.example && <span>: "{adj.example}"</span>}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Most important word */}
                    {figure.figure_most_important_word && (
                      <div>
                        <p className="text-sm font-medium mb-1">Palabra más significativa</p>
                        <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                          {figure.figure_most_important_word}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Icon name="group" className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>No se han evaluado figuras reguladoras</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="responses" className="space-y-4">
          <Accordion type="multiple" className="w-full">
            {/* Section 1: Current regulation */}
            <AccordionItem value="section1">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Icon name="psychology" className="h-4 w-4" />
                  Sección 1: Regulación Emocional Actual
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <div className="border-b pb-3">
                  <p className="text-sm font-medium mb-1">¿Cómo describes tu forma de gestionar emociones?</p>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {emoAnswers.emo_reg_general || <em>Sin respuesta</em>}
                  </p>
                </div>
                {emoAnswers.emo_dificultad_sentir && (
                  <div className="border-b pb-3">
                    <p className="text-sm font-medium mb-1">¿Te cuesta sentir emociones como otras personas?</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_dificultad_sentir === 'si' ? 'Sí' : 'No'}
                      {emoAnswers.emo_dificultad_sentir_explicacion && ` - ${emoAnswers.emo_dificultad_sentir_explicacion}`}
                    </p>
                  </div>
                )}
                <div className="border-b pb-3">
                  <p className="text-sm font-medium mb-1">¿Desde cuándo?</p>
                  <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {emoAnswers.emo_desde_cuando || <em>Sin respuesta</em>}
                  </p>
                </div>
                {emoAnswers.emo_empeoro === 'si' && emoAnswers.emo_empeoro_cuando && (
                  <div className="pb-3">
                    <p className="text-sm font-medium mb-1">¿Cuándo empeoró?</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_empeoro_cuando}
                    </p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Section 2: Upbringing history */}
            <AccordionItem value="section2">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Icon name="group" className="h-4 w-4" />
                  Sección 2: Historia de Crianza
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                {emoAnswers.emo_quienes_crianza && (
                  <div className="border-b pb-3">
                    <p className="text-sm font-medium mb-1">Personas con las que te criaste</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_quienes_crianza}
                    </p>
                  </div>
                )}
                {emoAnswers.emo_figuras_positivas && (
                  <div className="border-b pb-3">
                    <p className="text-sm font-medium mb-1">Figuras con influencia positiva</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_figuras_positivas}
                    </p>
                  </div>
                )}
                {emoAnswers.emo_figuras_negativas && (
                  <div className="border-b pb-3">
                    <p className="text-sm font-medium mb-1">Figuras con influencia negativa</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_figuras_negativas}
                    </p>
                  </div>
                )}
                {emoAnswers.emo_figuras_ausentes && (
                  <div className="pb-3">
                    <p className="text-sm font-medium mb-1">Figuras que deberían haber estado</p>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                      {emoAnswers.emo_figuras_ausentes}
                    </p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Section 3: Per-figure responses */}
            {figuresData.map((figure, index) => (
              <AccordionItem key={figure.id || index} value={`figure-${index}`}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    <Icon name="group" className="h-4 w-4" />
                    {figure.figure_name || `Figura ${index + 1}`}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {figure.figure_first_memory && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Primer recuerdo</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_first_memory}</p>
                    </div>
                  )}
                  {figure.figure_when_bad && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Reacción cuando te sentías mal</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_when_bad}</p>
                    </div>
                  )}
                  {figure.figure_success_failure && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Reacción ante éxitos/fracasos</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_success_failure}</p>
                    </div>
                  )}
                  {figure.figure_help_emotional && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Apoyo emocional</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_help_emotional}</p>
                    </div>
                  )}
                  {figure.figure_worst_emotion_you && (
                    <div className="border-b pb-3">
                      <p className="text-sm font-medium mb-1">Emoción que llevaba peor que sintieras</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_worst_emotion_you}</p>
                    </div>
                  )}
                  {figure.figure_more_comments && (
                    <div className="pb-3">
                      <p className="text-sm font-medium mb-1">Comentarios adicionales</p>
                      <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{figure.figure_more_comments}</p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </TabsContent>
      </Tabs>

      {/* AI Interpretation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="auto_awesome" className="h-5 w-5" />
            Interpretación Clínica (IA)
          </CardTitle>
          <CardDescription>
            Análisis automático basado en los indicadores detectados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {interpretation ? (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-1">Perfil de regulación</h4>
                <p className="text-sm text-muted-foreground">{interpretation.perfil_regulacion}</p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Calidad de apego</h4>
                <p className="text-sm text-muted-foreground">{interpretation.calidad_apego}</p>
              </div>
              {interpretation.recursos_regulacion && interpretation.recursos_regulacion.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Recursos de regulación</h4>
                  <div className="flex flex-wrap gap-1">
                    {interpretation.recursos_regulacion.map((r, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-green-50 text-green-700">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {interpretation.areas_intervencion && interpretation.areas_intervencion.length > 0 && (
                <div>
                  <h4 className="font-medium mb-1">Áreas de intervención</h4>
                  <div className="flex flex-wrap gap-1">
                    {interpretation.areas_intervencion.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-xs bg-amber-50 text-amber-700">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="font-medium mb-1">Hipótesis de origen</h4>
                <p className="text-sm text-muted-foreground">{interpretation.hipotesis_origen}</p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Resumen clínico</h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                  {interpretation.resumen_clinico}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Icon name="forum" className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                No se ha generado interpretación todavía
              </p>
              <Button onClick={handleGenerateInterpretation} disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Icon name="auto_awesome" className="h-4 w-4 mr-2" />
                    Generar interpretación
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
