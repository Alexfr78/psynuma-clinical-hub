import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Sparkles, AlertTriangle, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import { useMMPI2RFInterpretation, MMPI2RFInterpretation } from '@/hooks/useMMPI2RFInterpretation';
import { MMPI2RFInterpretationPanel } from './MMPI2RFInterpretationPanel';
import { 
  MMPI2RF_SCALE_LABELS, 
  MMPI2RF_SCALE_ORDER, 
  MMPI2RF_CATEGORY_LABELS 
} from '@/data/mmpi2rf-template';

interface MMPI2RFResultsViewProps {
  assessmentId: string;
  answers: Record<string, number>;
  storedInterpretation?: MMPI2RFInterpretation;
  patientAge?: number;
  patientGender?: string;
}

export function MMPI2RFResultsView({
  assessmentId,
  answers,
  storedInterpretation,
  patientAge,
  patientGender,
}: MMPI2RFResultsViewProps) {
  const { generateInterpretation, isGenerating } = useMMPI2RFInterpretation();
  const [activeTab, setActiveTab] = useState('resumen');

  // Convert string keys to number keys for the edge function
  const responses: Record<number, number> = {};
  Object.entries(answers).forEach(([key, val]) => {
    responses[parseInt(key)] = val;
  });

  const totalItems = Object.keys(answers).length;
  const trueCount = Object.values(answers).filter(v => v === 1).length;
  const falseCount = totalItems - trueCount;
  const truePercent = ((trueCount / totalItems) * 100).toFixed(1);

  const handleGenerateInterpretation = () => {
    generateInterpretation.mutate({
      assessmentId,
      responses,
      patientAge,
      patientGender,
    });
  };

  // Response pattern indicator for validity
  const getResponsePatternStatus = () => {
    const trueRatio = trueCount / totalItems;
    if (trueRatio > 0.8 || trueRatio < 0.2) {
      return { status: 'warning', message: 'Patrón de respuesta sesgado' };
    }
    if (trueRatio > 0.7 || trueRatio < 0.3) {
      return { status: 'caution', message: 'Revisar patrón de respuesta' };
    }
    return { status: 'ok', message: 'Patrón de respuesta normal' };
  };

  const patternStatus = getResponsePatternStatus();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold">{totalItems}</p>
            <p className="text-sm text-muted-foreground">Ítems respondidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold text-green-600">{trueCount}</p>
            <p className="text-sm text-muted-foreground">Verdadero ({truePercent}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{falseCount}</p>
            <p className="text-sm text-muted-foreground">Falso ({(100 - parseFloat(truePercent)).toFixed(1)}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              {patternStatus.status === 'ok' && <CheckCircle className="h-5 w-5 text-green-600" />}
              {patternStatus.status === 'caution' && <AlertTriangle className="h-5 w-5 text-yellow-600" />}
              {patternStatus.status === 'warning' && <XCircle className="h-5 w-5 text-destructive" />}
            </div>
            <p className="text-sm text-muted-foreground">{patternStatus.message}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="escalas">Escalas</TabsTrigger>
          <TabsTrigger value="respuestas">Respuestas</TabsTrigger>
          <TabsTrigger value="interpretacion" className="hidden md:inline-flex">
            Interpretación
          </TabsTrigger>
          <TabsTrigger value="interpretacion" className="md:hidden">
            IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Resumen del MMPI-2-RF
              </CardTitle>
              <CardDescription>
                Inventario Multifásico de Personalidad de Minnesota-2 Reestructurado (3ª edición)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Estructura del Test</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 338 ítems Verdadero/Falso</li>
                    <li>• 51 escalas en 9 categorías</li>
                    <li>• 9 escalas de validez (incluye RBS)</li>
                    <li>• 9 escalas clínicas reestructuradas (RC)</li>
                  </ul>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="font-medium mb-2">Umbrales de Interpretación</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• T &lt; 39: Bajo</li>
                    <li>• T 39-64: Normal</li>
                    <li>• T 65-79: Elevación clínica</li>
                    <li>• T ≥ 80: Elevación marcada</li>
                  </ul>
                </div>
              </div>
              <p className="text-sm text-muted-foreground italic">
                Nota: La interpretación por IA analiza los patrones de respuesta directamente, 
                ya que no se dispone de las claves de corrección oficiales para el cálculo de puntuaciones T.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="escalas" className="space-y-4">
          {Object.entries(MMPI2RF_SCALE_ORDER).map(([category, scales]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {MMPI2RF_CATEGORY_LABELS[category] || category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {scales.map(code => {
                    const scale = MMPI2RF_SCALE_LABELS[code];
                    return (
                      <div key={code} className="p-2 rounded border text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">
                            {code}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-xs mt-1">
                          {scale?.label}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="respuestas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respuestas Detalladas</CardTitle>
              <CardDescription>
                V = Verdadero, F = Falso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-15 gap-1 text-xs">
                {Object.entries(answers)
                  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([idx, val]) => (
                    <div
                      key={idx}
                      className={`p-1 rounded text-center ${
                        val === 1 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}
                    >
                      <span className="font-mono">{idx}</span>
                      <span className="ml-0.5">{val === 1 ? 'V' : 'F'}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interpretacion" className="space-y-4">
          {storedInterpretation ? (
            <MMPI2RFInterpretationPanel
              interpretation={storedInterpretation}
              onRegenerate={handleGenerateInterpretation}
              isRegenerating={isGenerating}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Interpretación IA del MMPI-2-RF</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Genera una interpretación clínica detallada basada en los patrones de respuesta 
                  del paciente utilizando inteligencia artificial.
                </p>
                <Button
                  onClick={handleGenerateInterpretation}
                  disabled={isGenerating}
                  size="lg"
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analizando MMPI-2-RF...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generar Interpretación IA
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
