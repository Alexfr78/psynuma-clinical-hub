import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  FileText,
  User,
  Stethoscope,
  Download,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useTranscriptionAnalysis } from '@/hooks/useTranscriptionAnalysis';

interface TranscriptionAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientName?: string;
  sessionDate?: string;
}

export function TranscriptionAnalysisDialog({
  open,
  onOpenChange,
  patientName,
  sessionDate,
}: TranscriptionAnalysisDialogProps) {
  const [transcription, setTranscription] = useState('');
  const {
    baseAnalysis,
    clinicalReport,
    patientReport,
    isAnalyzing,
    currentLayer,
    analyze,
    downloadTxt,
    reset,
  } = useTranscriptionAnalysis();

  const handleReset = () => {
    setTranscription('');
    reset();
  };

  const handleClose = (val: boolean) => {
    if (!val) handleReset();
    onOpenChange(val);
  };

  const filePrefix = [
    patientName?.replace(/\s+/g, '_') || 'sesion',
    sessionDate || new Date().toISOString().split('T')[0],
  ].join('_');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Análisis de transcripción de sesión
          </DialogTitle>
          {patientName && (
            <p className="text-sm text-muted-foreground">
              {patientName} — {sessionDate}
            </p>
          )}
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-sm">
          <StepBadge n={1} done={!!baseAnalysis} active={currentLayer === 1} label="Extracción base" />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <StepBadge n={2} done={!!clinicalReport} active={currentLayer === 2} label="Informe clínico" />
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <StepBadge n={3} done={!!patientReport} active={currentLayer === 3} label="Informe paciente" />
        </div>

        <Separator />

        {/* Transcription input - outside ScrollArea so paste works */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Transcripción de la sesión</label>
          <Textarea
            placeholder="Pega aquí la transcripción completa de la sesión..."
            className="min-h-[160px] max-h-[250px] font-mono text-sm"
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            disabled={isAnalyzing}
          />
          <p className="text-xs text-muted-foreground">
            {transcription.length > 0
              ? `${transcription.split(/\s+/).filter(Boolean).length} palabras`
              : 'Pega la transcripción para comenzar el análisis'}
          </p>
        </div>

        {/* Scrollable results area */}
        <ScrollArea className="flex-1 min-h-0 pr-2">
          <div className="space-y-4 pb-4">
            {/* Layer 1 button */}
            {!baseAnalysis && (
              <Button
                onClick={() => analyze(transcription, 1)}
                disabled={isAnalyzing || transcription.trim().length < 50}
                className="w-full"
              >
                {isAnalyzing && currentLayer === 1 ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analizando transcripción...
                  </>
                ) : (
                  <>
                    <Stethoscope className="mr-2 h-4 w-4" />
                    Paso 1: Extracción clínica base
                  </>
                )}
              </Button>
            )}

            {/* Base analysis result */}
            {baseAnalysis && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Extracción clínica base
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(baseAnalysis, `${filePrefix}_base.txt`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Descargar
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {baseAnalysis}
                </div>

                <Separator />

                {/* Layer 2 & 3 buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={() => analyze(transcription, 2)}
                    disabled={isAnalyzing}
                    variant={clinicalReport ? 'outline' : 'default'}
                  >
                    {isAnalyzing && currentLayer === 2 ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <Stethoscope className="mr-2 h-4 w-4" />
                        {clinicalReport ? 'Regenerar' : 'Informe clínico'}
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={() => analyze(transcription, 3)}
                    disabled={isAnalyzing}
                    variant={patientReport ? 'outline' : 'default'}
                  >
                    {isAnalyzing && currentLayer === 3 ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <User className="mr-2 h-4 w-4" />
                        {patientReport ? 'Regenerar' : 'Informe paciente'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Clinical report */}
            {clinicalReport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    Informe clínico para profesionales
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(clinicalReport, `${filePrefix}_informe_clinico.txt`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Descargar .txt
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                  {clinicalReport}
                </div>
              </div>
            )}

            {/* Patient report */}
            {patientReport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    Informe de sesión para el paciente
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(patientReport, `${filePrefix}_informe_paciente.txt`)}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Descargar .txt
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                  {patientReport}
                </div>
              </div>
            )}

            {/* Reset */}
            {baseAnalysis && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">
                <RotateCcw className="mr-2 h-3 w-3" />
                Nuevo análisis
              </Button>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function StepBadge({ n, done, active, label }: { n: number; done: boolean; active: boolean; label: string }) {
  return (
    <Badge
      variant={done ? 'default' : active ? 'secondary' : 'outline'}
      className={`text-xs ${active ? 'animate-pulse' : ''}`}
    >
      {done ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
      {n}. {label}
    </Badge>
  );
}
