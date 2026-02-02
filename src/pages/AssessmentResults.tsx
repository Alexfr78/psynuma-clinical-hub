import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, User, Calendar, FileText, CheckCircle2, AlertTriangle, Loader2, Activity, Sparkles, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAssessmentDetail } from '@/hooks/useAssessmentDetail';
import { AssessmentResultsChart } from '@/components/assessments/AssessmentResultsChart';
import { PAIInterpretationPanel } from '@/components/assessments/PAIInterpretationPanel';
import { MMPI2RFResultsView } from '@/components/assessments/MMPI2RFResultsView';
import { BDI2ResultsView } from '@/components/assessments/BDI2ResultsView';
import { DCIResultsView } from '@/components/assessments/DCIResultsView';
import { DESResultsView } from '@/components/assessments/DESResultsView';
import { STAIResultsView } from '@/components/assessments/STAIResultsView';
import { MMPI2RFInterpretation } from '@/hooks/useMMPI2RFInterpretation';
import { usePAIInterpretation, PAIInterpretation } from '@/hooks/usePAIInterpretation';
import {
  FACTOR_LABELS,
  INTERPRETATION_TEXTS,
  SCL90_FACTOR_ORDER,
  SCL90_GLOBAL_ORDER,
  getFactorOrder,
  computeLevel,
  isAlert,
  getHighFactors,
} from '@/lib/assessment-utils';

export default function AssessmentResults() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, error } = useAssessmentDetail(assessmentId);
  const { generateInterpretation, isGenerating } = usePAIInterpretation();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!assessmentId) return;
    
    setIsDownloading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-assessment-pdf', {
        body: { assessment_id: assessmentId },
      });

      if (error) throw error;
      if (!data?.html) throw new Error('No se pudo generar el PDF');

      // Open new window with HTML and trigger print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(data.html);
        printWindow.document.close();
        // Wait for content to fully render before printing
        // Use longer delay and also wait for document ready state
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 1500);
        };
        // Fallback if onload doesn't fire
        setTimeout(() => {
          if (printWindow.document.readyState === 'complete') {
            printWindow.print();
          }
        }, 2000);
      }
      
      toast.success('PDF generado correctamente');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate('/evaluaciones')} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver a evaluaciones
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {error ? 'Error al cargar la evaluación' : 'Evaluación no encontrada'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { patient, template, response, completed_at, status } = assessment;
  const factorScores = response?.factor_scores || {};
  const answers = response?.answers || {};
  const templateCode = template.code;
  const isSCL90 = templateCode === 'SCL90_V1';
  const isPAI = templateCode === 'PAI_V1';
  const isMMPI2RF = templateCode === 'MMPI2RF';
  const isBDI2 = templateCode === 'BDI2';
  const isDCI = templateCode === 'DCI';
  const isDES = templateCode === 'DES';
  const isSTAI = templateCode === 'STAI';
  const flagThreshold = template.flag_threshold;
  const chartFullMark = template.chart_full_mark;
  
  const factorOrder = getFactorOrder(templateCode);
  const highFactors = getHighFactors(factorScores, templateCode, flagThreshold);
  const hasResults = Object.keys(factorScores).length > 0;

  // Get stored interpretations from metadata
  const storedInterpretation = response?.metadata?.paiInterpretation as PAIInterpretation | undefined;
  const storedMMPI2RFInterpretation = response?.metadata?.mmpi2rfInterpretation as MMPI2RFInterpretation | undefined;

  const handleGeneratePAIInterpretation = () => {
    if (!assessmentId) return;
    
    generateInterpretation.mutate({
      assessmentId,
      tScores: factorScores,
      patientAge: patient.date_of_birth 
        ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() 
        : undefined,
      patientGender: patient.gender || undefined,
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header con navegación */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/evaluaciones')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Resultados de Evaluación</h1>
            <p className="text-muted-foreground">{template.name}</p>
          </div>
        </div>
        {status === 'completed' && (
          <Button 
            onClick={handleDownloadPDF} 
            disabled={isDownloading}
            variant="outline"
            className="gap-2"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Descargar PDF</span>
          </Button>
        )}
      </div>

      {/* Cards de resumen superior */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <User className="h-4 w-4" />
              Paciente
            </div>
            <p className="font-medium truncate">
              {patient.first_name} {patient.last_name}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Calendar className="h-4 w-4 shrink-0" />
              <span className="truncate">Fecha completado</span>
            </div>
            <p className="font-medium text-sm sm:text-base">
              {completed_at 
                ? format(new Date(completed_at), 'dd MMM yy', { locale: es })
                : 'No completada'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <FileText className="h-4 w-4" />
              Plantilla
            </div>
            <p className="font-medium truncate">{template.name}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <CheckCircle2 className="h-4 w-4" />
              Estado
            </div>
            <Badge variant={status === 'completed' ? 'default' : 'secondary'} className="capitalize">
              {status === 'completed' ? 'Completada' : status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* MMPI-2-RF: Use specialized view */}
      {isMMPI2RF && Object.keys(answers).length > 0 ? (
        <MMPI2RFResultsView
          assessmentId={assessmentId!}
          answers={answers}
          storedInterpretation={storedMMPI2RFInterpretation}
          patientAge={patient.date_of_birth 
            ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() 
            : undefined}
          patientGender={patient.gender || undefined}
        />
      ) : isBDI2 && hasResults ? (
        /* BDI-II: Use specialized view */
        <>
          <BDI2ResultsView
            totalScore={factorScores['TOTAL'] ?? 0}
            cogAffectScore={factorScores['COG_AFECT']}
            somVegScore={factorScores['SOM_VEG']}
            suicideAlert={response?.flags?.['SUICIDIO_alerta']}
            item9Score={factorScores['ITEM9']}
          />
          {/* Detailed answers accordion */}
          <Accordion type="single" collapsible>
            <AccordionItem value="answers">
              <AccordionTrigger className="text-lg font-semibold">
                Ver respuestas detalladas ({Object.keys(answers).length} ítems)
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-2 pt-2">
                  {template.items
                    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
                    .map((item: { index: number; text: string; options?: Array<{ value: number; text: string }> }) => {
                      const answer = answers[item.index.toString()];
                      const options = item.options as Array<{ value: number; text: string }> | undefined;
                      const selectedOption = options?.find(opt => opt.value === answer);
                      return (
                        <div 
                          key={item.index} 
                          className="flex justify-between items-start py-2 border-b last:border-b-0 gap-4"
                        >
                          <span className="text-sm flex-1">
                            <span className="font-medium mr-2">{item.index}.</span>
                            {item.text}
                          </span>
                          <div className="shrink-0 text-right">
                            <Badge variant="outline" className="font-mono">
                              {answer !== undefined ? answer : '—'}
                            </Badge>
                            {selectedOption && (
                              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                                {selectedOption.text}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : isDCI && hasResults ? (
        /* DCI: Use specialized view */
        <>
          <DCIResultsView
            detScore={factorScores['DET'] ?? 0}
            comScore={factorScores['COM'] ?? 0}
            valScore={factorScores['VAL'] ?? 0}
          />
          {/* Detailed answers accordion */}
          <Accordion type="single" collapsible>
            <AccordionItem value="answers">
              <AccordionTrigger className="text-lg font-semibold">
                Ver respuestas detalladas ({Object.keys(answers).length} ítems)
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-2 pt-2">
                  {template.items
                    .sort((a, b) => a.index - b.index)
                    .map(item => {
                      const answer = answers[item.index.toString()];
                      return (
                        <div 
                          key={item.index} 
                          className="flex justify-between items-start py-2 border-b last:border-b-0 gap-4"
                        >
                          <span className="text-sm flex-1">
                            <span className="font-medium mr-2">{item.index}.</span>
                            {item.text}
                          </span>
                          <Badge variant="outline" className="shrink-0 font-mono">
                            {answer !== undefined ? answer : '—'}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : isDES && hasResults ? (
        /* DES: Use specialized view with AI analysis */
        <>
          <DESResultsView
            totalScore={factorScores['TOTAL'] ?? 0}
            amnesiaScore={factorScores['DES_A'] ?? 0}
            depersonScore={factorScores['DES_D'] ?? 0}
            absorptionScore={factorScores['DES_I'] ?? 0}
            taxonScore={factorScores['DES_T'] ?? 0}
            flags={response?.flags}
            aiAnalysis={response?.metadata?.aiAnalysis as any}
          />
          {/* Detailed answers accordion */}
          <Accordion type="single" collapsible>
            <AccordionItem value="answers">
              <AccordionTrigger className="text-lg font-semibold">
                Ver respuestas detalladas ({Object.keys(answers).length} ítems)
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-2 pt-2">
                  {template.items
                    .sort((a, b) => a.index - b.index)
                    .map(item => {
                      const answer = answers[item.index.toString()];
                      const aiAnalysis = response?.metadata?.aiAnalysis as any;
                      const itemAnalysis = aiAnalysis?.itemAnalysis?.[item.index.toString()];
                      const example = itemAnalysis?.example;
                      const hasExample = answer !== undefined && answer > 0 && example;
                      
                      return (
                        <div 
                          key={item.index} 
                          className="py-2 border-b last:border-b-0"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <span className="text-sm flex-1">
                              <span className="font-medium mr-2">{item.index}.</span>
                              {item.text}
                            </span>
                            <Badge variant="outline" className="shrink-0 font-mono">
                              {answer !== undefined ? `${answer}%` : '—'}
                            </Badge>
                          </div>
                          {hasExample && (
                            <div className="mt-2 ml-6 p-2 bg-muted/50 rounded-md border-l-2 border-primary/30">
                              <p className="text-xs text-muted-foreground mb-1">Ejemplo proporcionado:</p>
                              <p className="text-sm italic">"{example}"</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : isSTAI && hasResults ? (
        /* STAI: Use specialized view for State-Trait Anxiety */
        <>
          <STAIResultsView
            aeScore={factorScores['A_E'] ?? 0}
            arScore={factorScores['A_R'] ?? 0}
            patientGender={patient.gender || undefined}
          />
          {/* Detailed answers accordion */}
          <Accordion type="single" collapsible>
            <AccordionItem value="answers">
              <AccordionTrigger className="text-lg font-semibold">
                Ver respuestas detalladas ({Object.keys(answers).length} ítems)
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4 pt-2">
                  {/* Estado */}
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Parte 1: Ansiedad Estado (A/E)</h4>
                    <div className="grid gap-1">
                      {template.items
                        .filter((item: any) => item.index >= 1 && item.index <= 20)
                        .sort((a: any, b: any) => a.index - b.index)
                        .map((item: any) => {
                          const answer = answers[item.index.toString()];
                          const labels = ['Nada', 'Algo', 'Bastante', 'Mucho'];
                          return (
                            <div 
                              key={item.index} 
                              className="flex justify-between items-start py-1 border-b last:border-b-0 gap-4"
                            >
                              <span className="text-xs flex-1">
                                <span className="font-medium mr-2">{item.index}.</span>
                                {item.text}
                              </span>
                              <Badge variant="outline" className="shrink-0 font-mono text-xs">
                                {answer !== undefined ? `${answer} - ${labels[answer] || answer}` : '—'}
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                  {/* Rasgo */}
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Parte 2: Ansiedad Rasgo (A/R)</h4>
                    <div className="grid gap-1">
                      {template.items
                        .filter((item: any) => item.index >= 21 && item.index <= 40)
                        .sort((a: any, b: any) => a.index - b.index)
                        .map((item: any) => {
                          const answer = answers[item.index.toString()];
                          const labels = ['Casi nunca', 'A veces', 'A menudo', 'Casi siempre'];
                          return (
                            <div 
                              key={item.index} 
                              className="flex justify-between items-start py-1 border-b last:border-b-0 gap-4"
                            >
                              <span className="text-xs flex-1">
                                <span className="font-medium mr-2">{item.index}.</span>
                                {item.text}
                              </span>
                              <Badge variant="outline" className="shrink-0 font-mono text-xs">
                                {answer !== undefined ? `${answer} - ${labels[answer] || answer}` : '—'}
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      ) : !hasResults ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Esta evaluación aún no tiene resultados registrados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Índices globales para SCL-90-R */}
          {isSCL90 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Índices Globales
                </CardTitle>
                <CardDescription>
                  Indicadores generales del SCL-90-R
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {SCL90_GLOBAL_ORDER.map(code => {
                    const score = factorScores[code];
                    if (score === undefined) return null;
                    const label = FACTOR_LABELS[code];
                    const isPST = code === 'PST';
                    
                    return (
                      <div key={code} className="border rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground mb-1">{label?.label || code}</p>
                        <p className="text-3xl font-bold">
                          {isPST ? Math.round(score) : score.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {label?.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabla de factores - versión responsive */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Puntuaciones por {isSCL90 ? 'Dimensión' : 'Factor'}</CardTitle>
              <CardDescription>
                Umbral de alerta: &gt; {flagThreshold.toFixed(2)} | Escala: 0-{chartFullMark}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              {/* Vista móvil: Cards apiladas */}
              <div className="space-y-3 md:hidden">
                {factorOrder.filter(code => factorScores[code] !== undefined).map(code => {
                  const score = factorScores[code];
                  const level = computeLevel(score, flagThreshold);
                  const alert = isAlert(score, flagThreshold);

                  return (
                    <div key={code} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-sm">{code}</span>
                          <p className="text-xs text-muted-foreground truncate">
                            {FACTOR_LABELS[code]?.label || code}
                          </p>
                        </div>
                        <span className="font-mono text-lg font-semibold shrink-0">
                          {score.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={
                            level === 'alto' 
                              ? 'border-destructive text-destructive' 
                              : level === 'moderado'
                                ? 'border-yellow-500 text-yellow-600'
                                : 'border-green-500 text-green-600'
                          }
                        >
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </Badge>
                        {alert ? (
                          <Badge variant="destructive">Alerta</Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vista desktop: Tabla */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isSCL90 ? 'Dimensión' : 'Factor'}</TableHead>
                      <TableHead className="text-right">Puntuación</TableHead>
                      <TableHead className="text-center">Nivel</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {factorOrder.filter(code => factorScores[code] !== undefined).map(code => {
                      const score = factorScores[code];
                      const level = computeLevel(score, flagThreshold);
                      const alert = isAlert(score, flagThreshold);

                      return (
                        <TableRow key={code}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{code}</span>
                              <span className="text-muted-foreground ml-2 text-sm">
                                {FACTOR_LABELS[code]?.label || code}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {score.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant="outline" 
                              className={
                                level === 'alto' 
                                  ? 'border-destructive text-destructive' 
                                  : level === 'moderado'
                                    ? 'border-yellow-500 text-yellow-600'
                                    : 'border-green-500 text-green-600'
                              }
                            >
                              {level.charAt(0).toUpperCase() + level.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {alert ? (
                              <Badge variant="destructive">Alerta</Badge>
                            ) : (
                              <Badge variant="secondary">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-4 italic text-center">
                Interpretación automática orientativa. Usar juicio clínico.
              </p>
            </CardContent>
          </Card>

          {/* Gráfico */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Visualización Gráfica</CardTitle>
            </CardHeader>
            <CardContent>
              <AssessmentResultsChart
                factorScores={factorScores}
                scoring={template.scoring}
                fullMark={chartFullMark}
              />
            </CardContent>
          </Card>

          {/* Interpretación dinámica */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Interpretación y Sugerencias de Intervención
              </h2>
              {isPAI && !storedInterpretation && (
                <Button 
                  onClick={handleGeneratePAIInterpretation}
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
                      <Sparkles className="h-4 w-4" />
                      Generar Interpretación IA
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* PAI: Mostrar interpretación IA */}
            {isPAI && (
              <>
                {storedInterpretation ? (
                  <PAIInterpretationPanel 
                    interpretation={storedInterpretation}
                    onRegenerate={handleGeneratePAIInterpretation}
                    isRegenerating={isGenerating}
                  />
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-muted-foreground mb-4">
                        Genera una interpretación clínica detallada del PAI usando inteligencia artificial.
                      </p>
                      <Button 
                        onClick={handleGeneratePAIInterpretation}
                        disabled={isGenerating}
                        className="gap-2"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analizando perfil...
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
              </>
            )}

            {/* Otros tests: Interpretación basada en factores altos */}
            {!isPAI && (
              <>
                {highFactors.length === 0 ? (
                  <Card>
                    <CardContent className="py-6 text-center text-muted-foreground">
                      No hay {isSCL90 ? 'dimensiones' : 'factores'} por encima del umbral de alerta (&gt;{flagThreshold.toFixed(2)}). 
                      Revisa tendencias y contexto clínico.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {highFactors.map(({ code, score }) => {
                      const texts = INTERPRETATION_TEXTS[code];
                      const label = FACTOR_LABELS[code]?.label || code;

                      if (!texts) return null;

                      return (
                        <Card key={code} className="border-l-4 border-l-yellow-500">
                          <CardHeader className="pb-2 sm:pb-4">
                            <CardTitle className="text-sm sm:text-base flex flex-wrap items-center gap-2">
                              <span>{code} — {label}</span>
                              <Badge variant="destructive" className="text-xs">
                                Alto: {score.toFixed(2)}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="text-xs sm:text-sm">Qué puede estar indicando</CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <p className="text-sm">{texts.interpretation}</p>

                            <div>
                              <h4 className="font-semibold text-sm mb-2">
                                Líneas de intervención sugeridas
                              </h4>
                              <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                {texts.interventions.map((intervention, idx) => (
                                  <li key={idx}>{intervention}</li>
                                ))}
                              </ul>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Acordeón de respuestas detalladas */}
          <Accordion type="single" collapsible>
            <AccordionItem value="answers">
              <AccordionTrigger className="text-lg font-semibold">
                Ver respuestas detalladas ({Object.keys(answers).length} ítems)
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-2 pt-2">
                  {template.items
                    .sort((a, b) => a.index - b.index)
                    .map(item => {
                      const answer = answers[item.index.toString()];
                      return (
                        <div 
                          key={item.index} 
                          className="flex justify-between items-start py-2 border-b last:border-b-0 gap-4"
                        >
                          <span className="text-sm flex-1">
                            <span className="font-medium mr-2">{item.index}.</span>
                            {item.text}
                          </span>
                          <Badge variant="outline" className="shrink-0 font-mono">
                            {answer !== undefined ? answer : '—'}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  );
}