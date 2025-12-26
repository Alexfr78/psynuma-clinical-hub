import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { Assessment } from '@/hooks/useAssessments';
import { useAssessmentTemplates } from '@/hooks/useAssessmentTemplates';
import { AssessmentResultsChart } from './AssessmentResultsChart';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AssessmentDetailDialogProps {
  assessment: Assessment | null;
  onClose: () => void;
}

export function AssessmentDetailDialog({ assessment, onClose }: AssessmentDetailDialogProps) {
  const { templates } = useAssessmentTemplates();
  
  if (!assessment || !assessment.response) return null;

  const template = templates.find(t => t.id === assessment.template_id);
  const factorScores = assessment.response.factor_scores;
  const flags = assessment.response.flags || {};
  const scoring = template?.scoring || {};
  const interpretations = template?.interpretations || {};

  const highFactors = Object.keys(flags).filter(k => k.endsWith('_high')).map(k => k.replace('_high', ''));

  return (
    <Dialog open={!!assessment} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            Resultados: {assessment.patient?.first_name} {assessment.patient?.last_name}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {template?.name} • Completada el {format(new Date(assessment.completed_at!), "d 'de' MMMM yyyy", { locale: es })}
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Scores Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Puntuaciones por factor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {Object.entries(factorScores).map(([code, score]) => (
                    <div key={code} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div>
                        <span className="font-medium">{code}</span>
                        <span className="text-muted-foreground ml-2 text-sm">
                          {scoring[code]?.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold">{score.toFixed(2)}</span>
                        {score > 4 && (
                          <Badge variant="destructive" className="text-xs">Alto</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visualización</CardTitle>
              </CardHeader>
              <CardContent>
                <AssessmentResultsChart factorScores={factorScores} scoring={scoring} />
              </CardContent>
            </Card>

            {/* Interpretations for high factors */}
            {highFactors.length > 0 && (
              <Card className="border-yellow-500/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    Áreas de atención (puntuación &gt; 4)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {highFactors.map(code => (
                    <div key={code} className="space-y-2">
                      <h4 className="font-semibold text-primary">
                        {code} - {scoring[code]?.label}
                        <span className="ml-2 text-muted-foreground font-normal">
                          ({factorScores[code]?.toFixed(2)})
                        </span>
                      </h4>
                      {interpretations[code] && (
                        <>
                          <div className="text-sm">
                            <strong>Interpretación:</strong>{' '}
                            {interpretations[code].interpretation}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <strong>Intervención sugerida:</strong>{' '}
                            {interpretations[code].intervention}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
