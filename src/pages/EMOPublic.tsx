import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Loader2, ChevronDown, ChevronUp, Plus, Trash2, Save, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { usePublicAssessment } from '@/hooks/usePublicAssessment';
import {
  SECTION_1_QUESTIONS,
  SECTION_2_QUESTIONS,
  FIGURE_FIELDS,
  EMOTION_MATRIX_EMOTIONS,
  EMOTION_MATRIX_COLUMNS,
  EMOAnswers,
  EMOFigureData,
  EMOCoregulationMoment,
  EMOAdjective,
  EMOQuestion,
} from '@/data/emo-template';

const STORAGE_KEY_PREFIX = 'emo_draft_';

const createEmptyFigure = (): EMOFigureData => ({
  id: crypto.randomUUID(),
  figure_name: '',
  figure_relation: '',
});

const createEmptyAdjective = (): EMOAdjective => ({
  adjective: '',
  example: '',
});

const createEmptyCoregulation = (): EMOCoregulationMoment => ({
  who: '',
  emotion: '',
  whatHelped: '',
});

export default function EMOPublic() {
  const { token } = useParams<{ token: string }>();
  const { assessment, isLoading, error, isExpired, isCompleted, isRevoked, canSubmit, submitResponses } = usePublicAssessment(token);

  const [currentSection, setCurrentSection] = useState(1);
  const [answers, setAnswers] = useState<EMOAnswers>({});
  const [figures, setFigures] = useState<EMOFigureData[]>([]);
  const [coregulationMoments, setCoregulationMoments] = useState<EMOCoregulationMoment[]>([]);
  const [expandedFigures, setExpandedFigures] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load draft from localStorage
  useEffect(() => {
    if (!token) return;
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + token);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.answers) setAnswers(parsed.answers);
        if (parsed.figures) setFigures(parsed.figures);
        if (parsed.coregulationMoments) setCoregulationMoments(parsed.coregulationMoments);
        if (parsed.currentSection) setCurrentSection(parsed.currentSection);
        toast.info('Se han recuperado tus respuestas guardadas');
      } catch (e) {
        console.error('Error loading draft:', e);
      }
    }
  }, [token]);

  // Auto-save to localStorage
  const saveDraft = useCallback(() => {
    if (!token) return;
    const data = { answers, figures, coregulationMoments, currentSection };
    localStorage.setItem(STORAGE_KEY_PREFIX + token, JSON.stringify(data));
    setLastSaved(new Date());
  }, [token, answers, figures, coregulationMoments, currentSection]);

  useEffect(() => {
    const timer = setTimeout(saveDraft, 2000);
    return () => clearTimeout(timer);
  }, [answers, figures, coregulationMoments, saveDraft]);

  // Update answer
  const updateAnswer = (questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  // Toggle checkbox in array
  const toggleCheckbox = (questionId: string, option: string) => {
    setAnswers(prev => {
      const current = (prev[questionId as keyof EMOAnswers] as string[]) || [];
      const newValue = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option];
      return { ...prev, [questionId]: newValue };
    });
  };

  // Figure management
  const addFigure = () => {
    const newFigure = createEmptyFigure();
    setFigures(prev => [...prev, newFigure]);
    setExpandedFigures(prev => new Set([...prev, newFigure.id]));
  };

  const removeFigure = (id: string) => {
    setFigures(prev => prev.filter(f => f.id !== id));
    setExpandedFigures(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateFigure = (id: string, field: keyof EMOFigureData, value: any) => {
    setFigures(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
  };

  const toggleFigureCheckbox = (figureId: string, field: keyof EMOFigureData, option: string) => {
    setFigures(prev => prev.map(f => {
      if (f.id !== figureId) return f;
      const current = (f[field] as string[]) || [];
      const newValue = current.includes(option)
        ? current.filter(v => v !== option)
        : [...current, option];
      return { ...f, [field]: newValue };
    }));
  };

  const updateFigureEmotionMatrix = (figureId: string, emotion: string, column: string, checked: boolean) => {
    setFigures(prev => prev.map(f => {
      if (f.id !== figureId) return f;
      const matrix = { ...(f.figure_emotion_matrix || {}) };
      const current = matrix[emotion] || [];
      matrix[emotion] = checked
        ? [...current, column]
        : current.filter(c => c !== column);
      return { ...f, figure_emotion_matrix: matrix };
    }));
  };

  const updateFigureAdjective = (figureId: string, index: number, field: 'adjective' | 'example', value: string) => {
    setFigures(prev => prev.map(f => {
      if (f.id !== figureId) return f;
      const adjectives = [...(f.figure_adjectives || Array(5).fill(null).map(() => createEmptyAdjective()))];
      if (!adjectives[index]) adjectives[index] = createEmptyAdjective();
      adjectives[index] = { ...adjectives[index], [field]: value };
      return { ...f, figure_adjectives: adjectives };
    }));
  };

  // Co-regulation management
  const addCoregulation = () => {
    if (coregulationMoments.length < 10) {
      setCoregulationMoments(prev => [...prev, createEmptyCoregulation()]);
    }
  };

  const removeCoregulation = (index: number) => {
    setCoregulationMoments(prev => prev.filter((_, i) => i !== index));
  };

  const updateCoregulation = (index: number, field: keyof EMOCoregulationMoment, value: string) => {
    setCoregulationMoments(prev => prev.map((m, i) => i === index ? { ...m, [field]: value } : m));
  };

  // Check if conditional should show
  const shouldShowQuestion = (question: EMOQuestion, figureData?: EMOFigureData): boolean => {
    if (!question.conditionalOn) return true;
    
    const { questionId, value } = question.conditionalOn;
    
    if (question.isFigureField && figureData) {
      const figureValue = figureData[questionId as keyof EMOFigureData];
      if (Array.isArray(value)) {
        return Array.isArray(figureValue) && value.some(v => (figureValue as string[]).includes(v));
      }
      return figureValue === value;
    }
    
    const answerValue = answers[questionId as keyof EMOAnswers];
    if (Array.isArray(value)) {
      return Array.isArray(answerValue) && value.some(v => (answerValue as string[]).includes(v));
    }
    return answerValue === value;
  };

  // Calculate progress
  const calculateProgress = (): number => {
    let total = 0;
    let filled = 0;

    // Section 1
    SECTION_1_QUESTIONS.forEach(q => {
      if (shouldShowQuestion(q)) {
        total++;
        const val = answers[q.id as keyof EMOAnswers];
        if (val && (typeof val === 'string' ? val.trim() : (val as any[]).length > 0)) filled++;
      }
    });

    // Section 2
    SECTION_2_QUESTIONS.forEach(q => {
      if (q.type !== 'coregulation_repeater' && shouldShowQuestion(q)) {
        total++;
        const val = answers[q.id as keyof EMOAnswers];
        if (val && (typeof val === 'string' ? val.trim() : (val as any[]).length > 0)) filled++;
      }
    });

    // Figures
    figures.forEach(f => {
      total += 3; // Required fields
      if (f.figure_name) filled++;
      if (f.figure_relation) filled++;
      if (f.figure_first_memory) filled++;
    });

    return total > 0 ? Math.round((filled / total) * 100) : 0;
  };

  // Submit
  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const finalAnswers: EMOAnswers = {
        ...answers,
        figures,
        emo_momentos_coregulacion: coregulationMoments.filter(m => m.who || m.emotion || m.whatHelped),
      };

      await submitResponses.mutateAsync({ 
        answers: finalAnswers as any,
      });

      localStorage.removeItem(STORAGE_KEY_PREFIX + token);
      toast.success('Entrevista enviada correctamente');
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render question based on type
  const renderQuestion = (question: EMOQuestion, figureData?: EMOFigureData, figureId?: string) => {
    if (!shouldShowQuestion(question, figureData)) return null;

    const questionId = question.id;
    const value = figureData 
      ? figureData[questionId as keyof EMOFigureData]
      : answers[questionId as keyof EMOAnswers];

    switch (question.type) {
      case 'textarea':
        return (
          <div key={questionId} className="space-y-2">
            <Label className="text-base font-medium">{question.label}</Label>
            {question.description && (
              <p className="text-sm text-muted-foreground">{question.description}</p>
            )}
            <Textarea
              value={(value as string) || ''}
              onChange={(e) => figureData && figureId
                ? updateFigure(figureId, questionId as keyof EMOFigureData, e.target.value)
                : updateAnswer(questionId, e.target.value)
              }
              className="min-h-[100px]"
              placeholder="Escribe tu respuesta aquí..."
            />
          </div>
        );

      case 'text_field':
        return (
          <div key={questionId} className="space-y-2">
            <Label className="text-base font-medium">{question.label}</Label>
            {question.description && (
              <p className="text-sm text-muted-foreground">{question.description}</p>
            )}
            <Input
              value={(value as string) || ''}
              onChange={(e) => figureData && figureId
                ? updateFigure(figureId, questionId as keyof EMOFigureData, e.target.value)
                : updateAnswer(questionId, e.target.value)
              }
              placeholder="Escribe aquí..."
            />
          </div>
        );

      case 'yes_no':
        return (
          <div key={questionId} className="space-y-3">
            <Label className="text-base font-medium">{question.label}</Label>
            <RadioGroup
              value={(value as string) || ''}
              onValueChange={(val) => figureData && figureId
                ? updateFigure(figureId, questionId as keyof EMOFigureData, val)
                : updateAnswer(questionId, val)
              }
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="si" id={`${figureId || 'main'}-${questionId}-si`} />
                <Label htmlFor={`${figureId || 'main'}-${questionId}-si`}>Sí</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="no" id={`${figureId || 'main'}-${questionId}-no`} />
                <Label htmlFor={`${figureId || 'main'}-${questionId}-no`}>No</Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 'checkbox_group':
        const selectedOptions = (value as string[]) || [];
        return (
          <div key={questionId} className="space-y-3">
            <Label className="text-base font-medium">{question.label}</Label>
            {question.description && (
              <p className="text-sm text-muted-foreground">{question.description}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {question.options?.map(option => (
                <div key={option} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${figureId || 'main'}-${questionId}-${option}`}
                    checked={selectedOptions.includes(option)}
                    onCheckedChange={() => figureData && figureId
                      ? toggleFigureCheckbox(figureId, questionId as keyof EMOFigureData, option)
                      : toggleCheckbox(questionId, option)
                    }
                  />
                  <Label 
                    htmlFor={`${figureId || 'main'}-${questionId}-${option}`}
                    className="text-sm cursor-pointer"
                  >
                    {option}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        );

      case 'emotion_matrix':
        const matrix = (value as Record<string, string[]>) || {};
        return (
          <div key={questionId} className="space-y-3">
            <Label className="text-base font-medium">{question.label}</Label>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left p-2 border-b font-medium">Emoción</th>
                    {EMOTION_MATRIX_COLUMNS.map(col => (
                      <th key={col} className="p-2 border-b text-center font-medium text-xs">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EMOTION_MATRIX_EMOTIONS.map(emotion => (
                    <tr key={emotion} className="border-b">
                      <td className="p-2 font-medium">{emotion}</td>
                      {EMOTION_MATRIX_COLUMNS.map(col => (
                        <td key={col} className="p-2 text-center">
                          <Checkbox
                            checked={(matrix[emotion] || []).includes(col)}
                            onCheckedChange={(checked) => figureId && 
                              updateFigureEmotionMatrix(figureId, emotion, col, !!checked)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'adjectives_repeater':
        const adjectives = (value as EMOAdjective[]) || Array(5).fill(null).map(() => createEmptyAdjective());
        return (
          <div key={questionId} className="space-y-3">
            <Label className="text-base font-medium">{question.label}</Label>
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map(index => (
                <div key={index} className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={`Adjetivo ${index + 1}`}
                    value={adjectives[index]?.adjective || ''}
                    onChange={(e) => figureId && updateFigureAdjective(figureId, index, 'adjective', e.target.value)}
                  />
                  <Input
                    placeholder="Ejemplo"
                    value={adjectives[index]?.example || ''}
                    onChange={(e) => figureId && updateFigureAdjective(figureId, index, 'example', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        );

      case 'coregulation_repeater':
        return (
          <div key={questionId} className="space-y-3">
            <Label className="text-base font-medium">{question.label}</Label>
            <div className="space-y-4">
              {coregulationMoments.map((moment, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Momento {index + 1}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCoregulation(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    placeholder="¿Quién fue?"
                    value={moment.who}
                    onChange={(e) => updateCoregulation(index, 'who', e.target.value)}
                  />
                  <Input
                    placeholder="¿Qué emoción/situación?"
                    value={moment.emotion}
                    onChange={(e) => updateCoregulation(index, 'emotion', e.target.value)}
                  />
                  <Textarea
                    placeholder="¿Qué hizo que te ayudó?"
                    value={moment.whatHelped}
                    onChange={(e) => updateCoregulation(index, 'whatHelped', e.target.value)}
                    className="min-h-[60px]"
                  />
                </div>
              ))}
              {coregulationMoments.length < 10 && (
                <Button variant="outline" onClick={addCoregulation} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir momento
                </Button>
              )}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Render figure
  const renderFigure = (figure: EMOFigureData, index: number) => {
    const isExpanded = expandedFigures.has(figure.id);
    const figureName = figure.figure_name || figure.figure_relation || `Figura ${index + 1}`;

    return (
      <Collapsible
        key={figure.id}
        open={isExpanded}
        onOpenChange={(open) => {
          setExpandedFigures(prev => {
            const next = new Set(prev);
            open ? next.add(figure.id) : next.delete(figure.id);
            return next;
          });
        }}
      >
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Figura: {figureName}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFigure(figure.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
              {FIGURE_FIELDS.map(field => renderQuestion(field, figure, figure.id))}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  };

  // Loading and status states
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium text-destructive">Enlace no válido</p>
            <p className="text-muted-foreground mt-2">
              Este enlace de evaluación no existe o ha sido eliminado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">Enlace expirado</p>
            <p className="text-muted-foreground mt-2">
              Este enlace ha expirado. Contacta con tu terapeuta para obtener uno nuevo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Entrevista completada</p>
            <p className="text-muted-foreground mt-2">
              Has completado esta entrevista. Gracias por tu tiempo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRevoked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-lg font-medium text-destructive">Acceso revocado</p>
            <p className="text-muted-foreground mt-2">
              El acceso a esta evaluación ha sido revocado.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = calculateProgress();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">EMO – Entrevista de Regulación Emocional</CardTitle>
            <CardDescription className="text-base leading-relaxed">
              Esta entrevista semi-estructurada explora tu historia de regulación emocional. 
              No hay respuestas correctas o incorrectas. Responde con la mayor honestidad posible, 
              describiendo tu experiencia tal como la recuerdas. Tómate el tiempo que necesites.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              {lastSaved && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Save className="h-3 w-3" />
                  Guardado automáticamente a las {lastSaved.toLocaleTimeString()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section Navigation */}
        <div className="flex gap-2">
          {[1, 2, 3].map(section => (
            <Button
              key={section}
              variant={currentSection === section ? 'default' : 'outline'}
              onClick={() => setCurrentSection(section)}
              className="flex-1"
            >
              {section === 1 && 'Tu regulación actual'}
              {section === 2 && 'Historia de crianza'}
              {section === 3 && 'Figuras relevantes'}
            </Button>
          ))}
        </div>

        {/* Section 1 */}
        {currentSection === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Sección 1: Tu regulación emocional actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {SECTION_1_QUESTIONS.map(q => renderQuestion(q))}
            </CardContent>
          </Card>
        )}

        {/* Section 2 */}
        {currentSection === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Sección 2: Figuras reguladoras (historia)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {SECTION_2_QUESTIONS.map(q => renderQuestion(q))}
            </CardContent>
          </Card>
        )}

        {/* Section 3 */}
        {currentSection === 3 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sección 3: Evaluación detallada por figura relevante</CardTitle>
                <CardDescription>
                  Añade tantas figuras como consideres importante evaluar (madre, padre, abuelos, cuidadores, parejas significativas, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={addFigure} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir figura relevante
                </Button>
              </CardContent>
            </Card>

            {figures.map((figure, index) => renderFigure(figure, index))}

            {figures.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <p>No has añadido ninguna figura todavía.</p>
                  <p className="text-sm mt-1">
                    Pulsa el botón de arriba para añadir personas relevantes en tu historia emocional.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Navigation and Submit */}
        <div className="flex justify-between gap-4">
          <Button
            variant="outline"
            onClick={() => setCurrentSection(prev => Math.max(1, prev - 1))}
            disabled={currentSection === 1}
          >
            Anterior
          </Button>
          
          {currentSection < 3 ? (
            <Button onClick={() => setCurrentSection(prev => Math.min(3, prev + 1))}>
              Siguiente
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !canSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar entrevista'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
