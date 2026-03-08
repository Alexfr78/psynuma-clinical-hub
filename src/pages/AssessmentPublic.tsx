import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePublicAssessment } from '@/hooks/usePublicAssessment';
import { LikertScale } from '@/components/assessments/LikertScale';
import { TrueFalseButtons } from '@/components/assessments/TrueFalseButtons';
import { BDI2ItemRenderer } from '@/components/assessments/BDI2ItemRenderer';
import { AssessmentProgress } from '@/components/assessments/AssessmentProgress';
import { PercentageSlider } from '@/components/assessments/PercentageSlider';
import { ExampleInput } from '@/components/assessments/ExampleInput';
import EMOPublic from '@/pages/EMOPublic';

export default function AssessmentPublic() {
  const { token } = useParams<{ token: string }>();
  const { assessment, isLoading, error, isExpired, isCompleted, isRevoked, canSubmit, submitResponses } = usePublicAssessment(token);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [examples, setExamples] = useState<Record<number, string>>({});

  // Reset answers when assessment changes (different token/template)
  useEffect(() => {
    setAnswers({});
    setExamples({});
  }, [assessment?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
            <h2 className="text-xl font-semibold mb-2">Evaluación revocada</h2>
            <p className="text-muted-foreground">Esta evaluación ha sido cancelada.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const template = Array.isArray(assessment.template)
    ? (assessment.template as any)[0]
    : (assessment.template as any);

  // If this is an EMO assessment, render the specialized EMO interface
  if (template?.code === 'EMO') {
    return <EMOPublic />;
  }

  const items = template?.items || [];
  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === items.length;
  // Dynamic scale settings from template
  const responseMin = template?.response_min ?? 1;
  const responseMax = template?.response_max ?? 7;
  const minLabel = template?.min_label ?? 'Nada de acuerdo';
  const maxLabel = template?.max_label ?? 'Totalmente de acuerdo';
  // Detect if this is a True/False assessment (response_max = 1)
  const isTrueFalse = responseMax === 1 && responseMin === 0;
  // Detect if this is a BDI-II assessment
  const isBDI2 = template?.code === 'BDI2';
  const isYBOCS2 = template?.code === 'YBOCS2';
  // Detect if this is a DES (percentage scale 0-100)
  const isDES = template?.code === 'DES';
  // Get response step for slider-based scales (DES uses 10% increments)
  const responseStep = (template as any)?.response_step ?? 1;

  const handleSubmit = async () => {
    if (!isComplete) return;
    // Filter examples to only include non-empty ones
    const filteredExamples = Object.fromEntries(
      Object.entries(examples).filter(([_, text]) => text && text.trim().length > 0)
    );
    await submitResponses.mutateAsync({ answers, examples: filteredExamples });
  };

  return (
    <div className="min-h-screen bg-background py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{template?.name}</CardTitle>
            {template?.instructions && (
              <CardDescription className="whitespace-pre-line">{template.instructions}</CardDescription>
            )}
          </CardHeader>
        </Card>

        <div className="sticky top-0 z-10 bg-background py-3">
          <AssessmentProgress answered={answeredCount} total={items.length} />
        </div>

        <div className="space-y-6">
          {items.map((item, idx) => (
            <Card key={item.index} className={answers[item.index] !== undefined ? 'border-primary/30' : ''}>
              <CardContent className="pt-6">
                {(isBDI2 || isYBOCS2) ? (
                  <BDI2ItemRenderer
                    item={{
                      index: item.index,
                      label: item.label || item.text,
                      options: item.options || [],
                    }}
                    value={answers[item.index]}
                    onChange={(value) => setAnswers(prev => ({ ...prev, [item.index]: value }))}
                    disabled={submitResponses.isPending}
                  />
                ) : isDES ? (
                  // DES: Use percentage slider with example input
                  <>
                    <p className="font-medium mb-6">
                      <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                      {item.text}
                    </p>
                    <PercentageSlider
                      value={answers[item.index]}
                      onChange={(value) => setAnswers(prev => ({ ...prev, [item.index]: value }))}
                      disabled={submitResponses.isPending}
                      minLabel={minLabel}
                      maxLabel={maxLabel}
                    />
                    {/* Show example input when value > 0 */}
                    {answers[item.index] !== undefined && answers[item.index] > 0 && (
                      <ExampleInput
                        value={examples[item.index] || ''}
                        onChange={(text) => setExamples(prev => ({ ...prev, [item.index]: text }))}
                        disabled={submitResponses.isPending}
                        itemIndex={item.index}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-4">
                      <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                      {item.text}
                    </p>
                    {isTrueFalse ? (
                      <TrueFalseButtons
                        value={answers[item.index]}
                        onChange={(value) => setAnswers(prev => ({ ...prev, [item.index]: value }))}
                        disabled={submitResponses.isPending}
                        trueLabel={maxLabel}
                        falseLabel={minLabel}
                      />
                    ) : (
                      <LikertScale
                        value={answers[item.index]}
                        onChange={(value) => setAnswers(prev => ({ ...prev, [item.index]: value }))}
                        min={responseMin}
                        max={responseMax}
                        minLabel={minLabel}
                        maxLabel={maxLabel}
                        disabled={submitResponses.isPending}
                        step={responseStep}
                        showPercentage={false}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky bottom-0 bg-background py-4 border-t">
          <Button
            onClick={handleSubmit}
            disabled={!isComplete || submitResponses.isPending}
            className="w-full"
            size="lg"
          >
            {submitResponses.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              `Enviar respuestas (${answeredCount}/${items.length})`
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
