import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, User, Calendar, FileText, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAssessmentDetail } from '@/hooks/useAssessmentDetail';
import { AssessmentResultsChart } from '@/components/assessments/AssessmentResultsChart';
import {
  FACTOR_LABELS,
  FACTOR_ORDER,
  INTERPRETATION_TEXTS,
  THRESHOLD_HIGH,
  computeLevel,
  isAlert,
  getHighFactors,
} from '@/lib/assessment-utils';

export default function AssessmentResults() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();
  const { data: assessment, isLoading, error } = useAssessmentDetail(assessmentId);

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
  const highFactors = getHighFactors(factorScores);
  const hasResults = Object.keys(factorScores).length > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header con navegación */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/evaluaciones')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Resultados de Evaluación</h1>
          <p className="text-muted-foreground">{template.name}</p>
        </div>
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
              <Calendar className="h-4 w-4" />
              Fecha completado
            </div>
            <p className="font-medium">
              {completed_at 
                ? format(new Date(completed_at), 'dd MMM yyyy, HH:mm', { locale: es })
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

      {!hasResults ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Esta evaluación aún no tiene resultados registrados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tabla de factores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Puntuaciones por Factor</CardTitle>
              <CardDescription>
                Umbral de alerta: &gt; {THRESHOLD_HIGH.toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factor</TableHead>
                    <TableHead className="text-right">Puntuación</TableHead>
                    <TableHead className="text-center">Nivel</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {FACTOR_ORDER.filter(code => factorScores[code] !== undefined).map(code => {
                    const score = factorScores[code];
                    const level = computeLevel(score);
                    const alert = isAlert(score);

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
              />
            </CardContent>
          </Card>

          {/* Interpretación dinámica - Solo factores altos */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Interpretación y Sugerencias de Intervención
            </h2>

            {highFactors.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                  No hay factores por encima del umbral de alerta (&gt;{THRESHOLD_HIGH.toFixed(2)}). 
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
                      <CardHeader>
                        <CardTitle className="text-base">
                          {code} — {label}
                          <Badge variant="destructive" className="ml-2">
                            Alto: {score.toFixed(2)}
                          </Badge>
                        </CardTitle>
                        <CardDescription>Qué puede estar indicando</CardDescription>
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
