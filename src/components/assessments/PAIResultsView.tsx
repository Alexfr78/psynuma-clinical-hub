import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Brain, CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react';
import { PAI_SCALE_ORDER, PAI_SCALE_LABELS, PAI_THRESHOLDS, PAI_CRITICAL_SCALES } from '@/data/pai-template';
import { usePAIInterpretation, PAIInterpretation } from '@/hooks/usePAIInterpretation';
import { PAIInterpretationPanel } from './PAIInterpretationPanel';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface PAIResultsViewProps {
  assessmentId: string;
  factorScores: Record<string, number>;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  existingInterpretation?: PAIInterpretation | null;
  consultationReason?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'hsl(var(--destructive))';
  if (score >= 70) return 'hsl(var(--warning, 38 92% 50%))';
  if (score >= 60) return 'hsl(var(--warning, 38 92% 50%) / 0.7)';
  return 'hsl(var(--primary))';
}

function getScoreLevel(score: number): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (score >= 80) return { label: 'Muy elevado', variant: 'destructive' };
  if (score >= 70) return { label: 'Elevado', variant: 'destructive' };
  if (score >= 60) return { label: 'Moderado', variant: 'secondary' };
  return { label: 'Normal', variant: 'outline' };
}

function ValidityIndicator({ code, score }: { code: string; score: number }) {
  const thresholds: Record<string, number> = {
    INC: 73,
    INF: 75,
    IMN: 73,
    IMP: 68,
  };
  
  const isElevated = score >= (thresholds[code] || 70);
  const label = PAI_SCALE_LABELS[code]?.label || code;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      isElevated ? 'border-destructive/50 bg-destructive/10' : 'border-border bg-muted/30'
    }`}>
      <div className="flex items-center gap-2">
        {isElevated ? (
          <XCircle className="h-5 w-5 text-destructive" />
        ) : (
          <CheckCircle className="h-5 w-5 text-green-600" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted-foreground">({code})</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold">T = {score}</span>
        {isElevated && <Badge variant="destructive">Elevado</Badge>}
      </div>
    </div>
  );
}

function ScaleChart({ 
  scales, 
  scores, 
  title 
}: { 
  scales: string[]; 
  scores: Record<string, number>; 
  title: string;
}) {
  const data = scales
    .filter(code => scores[code] !== undefined)
    .map(code => ({
      code,
      label: PAI_SCALE_LABELS[code]?.label || code,
      score: scores[code],
    }));

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 35)}>
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} ticks={[50, 60, 70, 80, 100]} />
            <YAxis 
              type="category" 
              dataKey="code" 
              width={70}
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              formatter={(value: number, name: string, props: any) => [
                `T = ${value}`,
                props.payload.label
              ]}
            />
            <ReferenceLine x={50} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
            <ReferenceLine x={65} stroke="hsl(var(--warning, 38 92% 50%))" strokeDasharray="5 5" />
            <ReferenceLine x={70} stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
            <Bar dataKey="score" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={getScoreColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function PAIResultsView({
  assessmentId,
  factorScores,
  patientName,
  patientAge,
  patientGender,
  existingInterpretation,
  consultationReason,
}: PAIResultsViewProps) {
  const [interpretation, setInterpretation] = useState<PAIInterpretation | null>(
    existingInterpretation || null
  );
  const { generateInterpretation, isGenerating } = usePAIInterpretation();

  const handleGenerateInterpretation = async () => {
    const result = await generateInterpretation.mutateAsync({
      assessmentId,
      tScores: factorScores,
      patientAge,
      patientGender,
      consultationReason,
    });
    setInterpretation(result);
  };

  // Check validity
  const validityScores = PAI_SCALE_ORDER.validity
    .filter(code => factorScores[code] !== undefined)
    .map(code => ({ code, score: factorScores[code] }));

  const isProtocolValid = validityScores.every(({ code, score }) => {
    const thresholds: Record<string, number> = { INC: 73, INF: 75, IMN: 73, IMP: 68 };
    return score < (thresholds[code] || 70);
  });

  // Get elevated clinical scales
  const elevatedClinicalScales = PAI_SCALE_ORDER.clinical
    .filter(code => factorScores[code] !== undefined && factorScores[code] >= 65)
    .map(code => ({ code, score: factorScores[code] }))
    .sort((a, b) => b.score - a.score);

  // Check for critical elevations
  const criticalElevations = PAI_CRITICAL_SCALES
    .filter(code => factorScores[code] !== undefined && factorScores[code] >= 70);

  return (
    <div className="space-y-6">
      {/* Critical alerts */}
      {criticalElevations.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2 bg-destructive/10">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Alertas Críticas
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-2">
              {criticalElevations.map(code => (
                <div key={code} className="flex items-center justify-between p-2 bg-destructive/5 rounded">
                  <span className="font-medium">{PAI_SCALE_LABELS[code]?.label || code}</span>
                  <Badge variant="destructive">T = {factorScores[code]}</Badge>
                </div>
              ))}
              <p className="text-sm text-destructive mt-2">
                Estas escalas requieren atención inmediata. Evalúe riesgo y seguridad del contacto.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="validity">Validez</TabsTrigger>
          <TabsTrigger value="clinical">Clínicas</TabsTrigger>
          <TabsTrigger value="interpretation">IA</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Protocol validity status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {isProtocolValid ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Protocolo Válido
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    Validez Cuestionable
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {isProtocolValid
                  ? 'Los indicadores de validez están dentro de rangos normales. El protocolo puede interpretarse con confianza.'
                  : 'Algunas escalas de validez están elevadas. Interprete los resultados con precaución.'
                }
              </p>
            </CardContent>
          </Card>

          {/* Elevated scales summary */}
          {elevatedClinicalScales.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  Escalas Clínicas Elevadas (T ≥ 65)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {elevatedClinicalScales.map(({ code, score }) => {
                    const level = getScoreLevel(score);
                    return (
                      <div key={code} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <span className="font-medium">{code}</span>
                          <span className="text-muted-foreground ml-2 text-sm">
                            {PAI_SCALE_LABELS[code]?.label || ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">T = {score}</span>
                          <Badge variant={level.variant}>{level.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generate interpretation button */}
          {!interpretation && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">Interpretación con IA</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Genera un informe clínico estructurado basado en el perfil PAI
                    </p>
                  </div>
                  <Button 
                    onClick={handleGenerateInterpretation}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4" />
                        Generar Interpretación
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="validity" className="space-y-4 mt-4">
          <div className="space-y-3">
            {PAI_SCALE_ORDER.validity.map(code => (
              factorScores[code] !== undefined && (
                <ValidityIndicator key={code} code={code} score={factorScores[code]} />
              )
            ))}
          </div>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-4 mt-4">
          <ScaleChart 
            scales={PAI_SCALE_ORDER.clinical} 
            scores={factorScores} 
            title="Escalas Clínicas"
          />
          <ScaleChart 
            scales={PAI_SCALE_ORDER.treatment} 
            scores={factorScores} 
            title="Escalas de Tratamiento"
          />
          <ScaleChart 
            scales={PAI_SCALE_ORDER.interpersonal} 
            scores={factorScores} 
            title="Escalas Interpersonales"
          />
        </TabsContent>

        <TabsContent value="interpretation" className="mt-4">
          {interpretation ? (
            <PAIInterpretationPanel 
              interpretation={interpretation}
              onRegenerate={handleGenerateInterpretation}
              isRegenerating={isGenerating}
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="font-semibold">Sin interpretación generada</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Haz clic en el botón para generar un informe clínico con IA
                    </p>
                  </div>
                  <Button 
                    onClick={handleGenerateInterpretation}
                    disabled={isGenerating}
                    className="gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4" />
                        Generar Interpretación
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
