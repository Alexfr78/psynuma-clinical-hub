import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { usePublicAssessment } from '@/hooks/usePublicAssessment';
import { LikertScale } from '@/components/assessments/LikertScale';
import { AssessmentProgress } from '@/components/assessments/AssessmentProgress';

export default function AssessmentPublic() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { assessment, isLoading, error, isExpired, isCompleted, isRevoked, canSubmit, submitResponses } = usePublicAssessment(token);
  const [answers, setAnswers] = useState<Record<number, number>>({});

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

  const template = assessment.template;
  const items = template?.items || [];
  const answeredCount = Object.keys(answers).length;
  const isComplete = answeredCount === items.length;

  const handleSubmit = async () => {
    if (!isComplete) return;
    await submitResponses.mutateAsync(answers);
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
            <Card key={item.index} className={answers[item.index] ? 'border-primary/30' : ''}>
              <CardContent className="pt-6">
                <p className="font-medium mb-4">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                  {item.text}
                </p>
                <LikertScale
                  value={answers[item.index]}
                  onChange={(value) => setAnswers(prev => ({ ...prev, [item.index]: value }))}
                  disabled={submitResponses.isPending}
                />
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
