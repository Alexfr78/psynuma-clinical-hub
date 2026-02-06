import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Clock, Plus, Trash2, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { usePublicAssessment } from '@/hooks/usePublicAssessment';
import { toast } from 'sonner';
import { 
  PROBLEMATIC_EMOTIONS,
  REGULATORY_PATTERNS,
  ALL_FIGURE_FEELINGS,
  TOLERANCE_EMOTIONS,
  TOLERANCE_OPTIONS,
  TYPICAL_RESPONSES,
  type EMOFigureData,
  type EMOAnswers,
} from '@/data/emo-template';

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Empty figure template
const createEmptyFigure = (): EMOFigureData => ({
  id: generateId(),
  name: '',
  current_relation: '',
  first_memory: '',
  adjectives: [
    { adjective: '', example: '' },
    { adjective: '', example: '' },
    { adjective: '', example: '' },
    { adjective: '', example: '' },
    { adjective: '', example: '' },
  ],
  reaction_distress: '',
  reaction_success_failure: '',
  feelings: [],
  significant_emotion: '',
  emotion_tolerance: {},
  worst_tolerated: '',
  typical_responses: [],
  physical_support: '',
  emotional_support: '',
});

export default function EMOPublic() {
  const { token } = useParams<{ token: string }>();
  const { assessment, isLoading, error, isExpired, isCompleted, isRevoked, submitResponses } = usePublicAssessment(token);
  
  // Section 1 state
  const [description, setDescription] = useState('');
  const [difficultEmotions, setDifficultEmotions] = useState<string[]>([]);
  const [otherEmotion, setOtherEmotion] = useState('');
  const [patterns, setPatterns] = useState<string[]>([]);
  const [sinceWhen, setSinceWhen] = useState('');
  const [worseningPeriods, setWorseningPeriods] = useState('');
  
  // Section 2 state - Dynamic figures
  const [figures, setFigures] = useState<EMOFigureData[]>([createEmptyFigure()]);
  const [expandedFigures, setExpandedFigures] = useState<string[]>([]);
  
  // Auto-save indicator
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved data from localStorage
  useEffect(() => {
    if (!token) return;
    const saved = localStorage.getItem(`emo_draft_${token}`);
    if (saved) {
      try {
        const data = JSON.parse(saved) as EMOAnswers;
        if (data.s1_description) setDescription(data.s1_description);
        if (data.s1_difficult_emotions) setDifficultEmotions(data.s1_difficult_emotions);
        if (data.s1_patterns) setPatterns(data.s1_patterns);
        if (data.s1_since_when) setSinceWhen(data.s1_since_when);
        if (data.s1_worsening_periods) setWorseningPeriods(data.s1_worsening_periods);
        if (data.figures && data.figures.length > 0) {
          setFigures(data.figures);
          setExpandedFigures([data.figures[0].id]);
        }
        toast.info('Se han recuperado tus respuestas guardadas');
      } catch (e) {
        console.error('Error loading saved data:', e);
      }
    }
  }, [token]);

  // Auto-save to localStorage
  const saveToLocal = useCallback(() => {
    if (!token) return;
    const data: EMOAnswers = {
      s1_description: description,
      s1_difficult_emotions: difficultEmotions,
      s1_patterns: patterns,
      s1_since_when: sinceWhen,
      s1_worsening_periods: worseningPeriods,
      figures,
    };
    localStorage.setItem(`emo_draft_${token}`, JSON.stringify(data));
    setLastSaved(new Date());
  }, [token, description, difficultEmotions, patterns, sinceWhen, worseningPeriods, figures]);

  // Debounced auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      saveToLocal();
    }, 2000);
    return () => clearTimeout(timer);
  }, [saveToLocal]);

  // Figure management
  const addFigure = () => {
    const newFigure = createEmptyFigure();
    setFigures(prev => [...prev, newFigure]);
    setExpandedFigures(prev => [...prev, newFigure.id]);
  };

  const removeFigure = (id: string) => {
    if (figures.length <= 1) {
      toast.error('Debes tener al menos una figura');
      return;
    }
    setFigures(prev => prev.filter(f => f.id !== id));
    setExpandedFigures(prev => prev.filter(fid => fid !== id));
  };

  const updateFigure = (id: string, updates: Partial<EMOFigureData>) => {
    setFigures(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const toggleFigureExpanded = (id: string) => {
    setExpandedFigures(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  // Emotion toggle helpers
  const toggleEmotion = (emotion: string) => {
    setDifficultEmotions(prev => 
      prev.includes(emotion) ? prev.filter(e => e !== emotion) : [...prev, emotion]
    );
  };

  const togglePattern = (pattern: string) => {
    setPatterns(prev => 
      prev.includes(pattern) ? prev.filter(p => p !== pattern) : [...prev, pattern]
    );
  };

  // Handle submission
  const handleSubmit = async () => {
    // Validate required fields
    if (!description.trim()) {
      toast.error('Por favor, describe tu forma de gestionar las emociones');
      return;
    }

    const validFigures = figures.filter(f => f.name.trim());
    if (validFigures.length === 0) {
      toast.error('Por favor, añade al menos una figura con nombre');
      return;
    }

    setIsSaving(true);
    try {
      // Build answers in the format expected by submit-assessment-response
      const answersFormatted: Record<string, any> = {
        s1_description: description,
        s1_difficult_emotions: [...difficultEmotions, ...(otherEmotion ? [otherEmotion] : [])],
        s1_patterns: patterns,
        s1_since_when: sinceWhen,
        s1_worsening_periods: worseningPeriods,
        figures: validFigures,
        // Legacy format compatibility
        '1': description,
        '3': [...difficultEmotions, ...(otherEmotion ? [otherEmotion] : [])],
        '4': patterns.slice(0, 11),
        '5': patterns.slice(11),
        '6': sinceWhen,
        '7': worseningPeriods,
      };

      await submitResponses.mutateAsync({ 
        answers: answersFormatted as any,
      });

      // Clear local storage on success
      localStorage.removeItem(`emo_draft_${token}`);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error states
  if (error || !assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Enlace no válido</h2>
            <p className="text-muted-foreground">Este enlace no existe o ya no está disponible.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Enlace caducado</h2>
            <p className="text-muted-foreground">Este enlace ha expirado. Por favor, contacta con tu terapeuta.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Evaluación completada</h2>
            <p className="text-muted-foreground">Ya has enviado tus respuestas. Gracias por participar.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isRevoked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Evaluación cancelada</h2>
            <p className="text-muted-foreground">Esta evaluación ha sido cancelada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <CardTitle>EMO - Entrevista de Gestión Emocional</CardTitle>
            <CardDescription className="whitespace-pre-line">
              Esta entrevista te ayudará a reflexionar sobre cómo gestionas tus emociones y qué personas fueron importantes en tu desarrollo emocional.
              
              No hay respuestas correctas o incorrectas. Tus respuestas se guardan automáticamente.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Auto-save indicator */}
        {lastSaved && (
          <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <Save className="h-3 w-3" />
            Guardado a las {lastSaved.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {/* SECTION 1: Regulación Emocional General */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sección 1: Tu Regulación Emocional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 1.1 Descripción libre */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-medium">
                ¿Cómo definirías en general tu forma de gestionar tus emociones? *
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe cómo sueles manejar lo que sientes en tu día a día..."
                rows={4}
              />
            </div>

            <Separator />

            {/* 1.2 Emociones problemáticas */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Selecciona las emociones que te resultan difíciles de manejar
              </Label>
              <div className="flex flex-wrap gap-2">
                {PROBLEMATIC_EMOTIONS.map(emotion => (
                  <Badge
                    key={emotion}
                    variant={difficultEmotions.includes(emotion) ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleEmotion(emotion)}
                  >
                    {emotion}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Otra emoción..."
                  value={otherEmotion}
                  onChange={(e) => setOtherEmotion(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            </div>

            <Separator />

            {/* 1.3 Patrones de regulación */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Indica cuáles de estas afirmaciones se aplican a ti
              </Label>
              <div className="grid gap-2">
                {REGULATORY_PATTERNS.map(pattern => (
                  <div key={pattern.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={pattern.id}
                      checked={patterns.includes(pattern.text)}
                      onCheckedChange={() => togglePattern(pattern.text)}
                    />
                    <Label htmlFor={pattern.id} className="text-sm cursor-pointer">
                      {pattern.text}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* 1.4 Línea temporal */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sinceWhen" className="text-base font-medium">
                  ¿Te ocurre desde siempre o empezó en una etapa concreta?
                </Label>
                <Textarea
                  id="sinceWhen"
                  value={sinceWhen}
                  onChange={(e) => setSinceWhen(e.target.value)}
                  placeholder="Intenta situar temporalmente el origen de estos patrones..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="worsening" className="text-base font-medium">
                  ¿Hubo periodos donde empeoró?
                </Label>
                <Textarea
                  id="worsening"
                  value={worseningPeriods}
                  onChange={(e) => setWorseningPeriods(e.target.value)}
                  placeholder="Describe si hubo momentos donde las dificultades aumentaron..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 2: Figuras Reguladoras */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Sección 2: Figuras Relevantes</CardTitle>
              <CardDescription>
                Añade las personas que fueron importantes en tu desarrollo emocional
              </CardDescription>
            </div>
            <Button onClick={addFigure} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Añadir figura
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {figures.map((figure, index) => (
              <FigureCard
                key={figure.id}
                figure={figure}
                index={index}
                isExpanded={expandedFigures.includes(figure.id)}
                onToggle={() => toggleFigureExpanded(figure.id)}
                onUpdate={(updates) => updateFigure(figure.id, updates)}
                onRemove={() => removeFigure(figure.id)}
                canRemove={figures.length > 1}
              />
            ))}
          </CardContent>
        </Card>

        {/* Submit button */}
        <div className="sticky bottom-0 bg-background py-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={isSaving || submitResponses.isPending}
            className="w-full"
            size="lg"
          >
            {(isSaving || submitResponses.isPending) ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar respuestas'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Figure Card Component
interface FigureCardProps {
  figure: EMOFigureData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<EMOFigureData>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function FigureCard({ figure, index, isExpanded, onToggle, onUpdate, onRemove, canRemove }: FigureCardProps) {
  const toggleFeeling = (feeling: string) => {
    const current = figure.feelings || [];
    const updated = current.includes(feeling) 
      ? current.filter(f => f !== feeling) 
      : [...current, feeling];
    onUpdate({ feelings: updated });
  };

  const toggleTypicalResponse = (response: string) => {
    const current = figure.typical_responses || [];
    const updated = current.includes(response) 
      ? current.filter(r => r !== response) 
      : [...current, response];
    onUpdate({ typical_responses: updated });
  };

  const updateAdjective = (adjIndex: number, field: 'adjective' | 'example', value: string) => {
    const adjectives = [...(figure.adjectives || [])];
    while (adjectives.length <= adjIndex) {
      adjectives.push({ adjective: '', example: '' });
    }
    adjectives[adjIndex] = { ...adjectives[adjIndex], [field]: value };
    onUpdate({ adjectives });
  };

  const toggleTolerance = (emotion: string, option: string) => {
    const tolerance = { ...(figure.emotion_tolerance || {}) };
    const current = tolerance[emotion] || [];
    tolerance[emotion] = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option];
    onUpdate({ emotion_tolerance: tolerance });
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="border-2">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{index + 1}</Badge>
                <CardTitle className="text-base">
                  {figure.name || 'Nueva figura'}
                </CardTitle>
                {figure.current_relation && (
                  <span className="text-sm text-muted-foreground">({figure.current_relation})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre o rol *</Label>
                <Input
                  value={figure.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  placeholder="Ej: madre, padre, abuela..."
                />
              </div>
              <div className="space-y-2">
                <Label>Relación actual</Label>
                <Input
                  value={figure.current_relation || ''}
                  onChange={(e) => onUpdate({ current_relation: e.target.value })}
                  placeholder="Ej: buena, distante, fallecido/a..."
                />
              </div>
            </div>

            <Separator />

            {/* First memory */}
            <div className="space-y-2">
              <Label>Describe el primer recuerdo que tengas con esta persona</Label>
              <Textarea
                value={figure.first_memory || ''}
                onChange={(e) => onUpdate({ first_memory: e.target.value })}
                placeholder="Describe el recuerdo más antiguo..."
                rows={3}
              />
            </div>

            <Separator />

            {/* Adjectives */}
            <div className="space-y-3">
              <Label className="text-base font-medium">5 adjetivos que describan a esta persona</Label>
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <Input
                      value={figure.adjectives?.[i]?.adjective || ''}
                      onChange={(e) => updateAdjective(i, 'adjective', e.target.value)}
                      placeholder={`Adjetivo ${i + 1}`}
                    />
                    <Input
                      value={figure.adjectives?.[i]?.example || ''}
                      onChange={(e) => updateAdjective(i, 'example', e.target.value)}
                      placeholder="Ejemplo..."
                    />
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Reactions */}
            <div className="space-y-2">
              <Label>¿Cómo reaccionaba cuando te sentías mal?</Label>
              <Textarea
                value={figure.reaction_distress || ''}
                onChange={(e) => onUpdate({ reaction_distress: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>¿Cómo reaccionaba ante tus éxitos? ¿Y ante tus fracasos?</Label>
              <Textarea
                value={figure.reaction_success_failure || ''}
                onChange={(e) => onUpdate({ reaction_success_failure: e.target.value })}
                rows={2}
              />
            </div>

            <Separator />

            {/* Feelings generated */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Sentimientos que esta persona generaba en ti</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_FIGURE_FEELINGS.map(feeling => (
                  <Badge
                    key={feeling}
                    variant={(figure.feelings || []).includes(feeling) ? "default" : "outline"}
                    className="cursor-pointer select-none"
                    onClick={() => toggleFeeling(feeling)}
                  >
                    {feeling}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>¿Cuál fue la emoción más significativa que viviste con esta figura?</Label>
              <Input
                value={figure.significant_emotion || ''}
                onChange={(e) => onUpdate({ significant_emotion: e.target.value })}
                placeholder="Describe brevemente un ejemplo..."
              />
            </div>

            <Separator />

            {/* Emotion tolerance matrix */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Tolerancia emocional de esta figura</Label>
              <p className="text-sm text-muted-foreground">Para cada emoción, indica cómo la manejaba</p>
              <div className="space-y-4">
                {TOLERANCE_EMOTIONS.map(emotion => (
                  <div key={emotion} className="space-y-2">
                    <Label className="font-medium">{emotion}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {TOLERANCE_OPTIONS.map(option => (
                        <div key={option} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${figure.id}-${emotion}-${option}`}
                            checked={(figure.emotion_tolerance?.[emotion] || []).includes(option)}
                            onCheckedChange={() => toggleTolerance(emotion, option)}
                          />
                          <Label 
                            htmlFor={`${figure.id}-${emotion}-${option}`}
                            className="text-xs cursor-pointer"
                          >
                            {option}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>¿Qué emoción tuya llevaba peor ver o manejar?</Label>
              <Input
                value={figure.worst_tolerated || ''}
                onChange={(e) => onUpdate({ worst_tolerated: e.target.value })}
                placeholder="Describe un ejemplo si es posible..."
              />
            </div>

            <Separator />

            {/* Typical responses */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Respuestas típicas cuando mostrabas emociones</Label>
              <div className="grid gap-2">
                {TYPICAL_RESPONSES.map(response => (
                  <div key={response} className="flex items-center space-x-2">
                    <Checkbox
                      id={`${figure.id}-resp-${response}`}
                      checked={(figure.typical_responses || []).includes(response)}
                      onCheckedChange={() => toggleTypicalResponse(response)}
                    />
                    <Label htmlFor={`${figure.id}-resp-${response}`} className="text-sm cursor-pointer">
                      {response}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Support */}
            <div className="space-y-2">
              <Label>¿Recibías apoyo físico cuando estabas mal? (abrazos, contacto, cuidados...)</Label>
              <Textarea
                value={figure.physical_support || ''}
                onChange={(e) => onUpdate({ physical_support: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>¿Recibías apoyo emocional cuando estabas mal?</Label>
              <Textarea
                value={figure.emotional_support || ''}
                onChange={(e) => onUpdate({ emotional_support: e.target.value })}
                rows={2}
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
