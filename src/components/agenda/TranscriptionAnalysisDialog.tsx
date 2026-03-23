import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  X,
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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => handleClose(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcription-analysis-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
          <div className="space-y-1">
            <h2 id="transcription-analysis-title" className="flex items-center gap-2 text-lg font-semibold">
              <FileText className="h-5 w-5" />
              Análisis de transcripción de sesión
            </h2>
            {patientName && (
              <p className="text-sm text-muted-foreground">
                {patientName} — {sessionDate}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleClose(false)}
            className="shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4 px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <StepBadge n={1} done={!!baseAnalysis} active={currentLayer === 1} label="Extracción base" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepBadge n={2} done={!!clinicalReport} active={currentLayer === 2} label="Informe clínico" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepBadge n={3} done={!!patientReport} active={currentLayer === 3} label="Informe paciente" />
          </div>

          <Separator />

          <div className="space-y-2">
            <label htmlFor="transcription-input" className="text-sm font-medium">
              Transcripción de la sesión
            </label>
            <Textarea
              id="transcription-input"
              placeholder="Pega aquí la transcripción completa de la sesión..."
              className="min-h-[160px] max-h-[250px] font-mono text-sm"
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              onPaste={(e) => {
                e.stopPropagation();
                const text = e.clipboardData.getData('text/plain');
                if (text) {
                  e.preventDefault();
                  setTranscription((prev) => prev + text);
                }
              }}
              onFocus={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              disabled={isAnalyzing}
              autoFocus={false}
            />
            <p className="text-xs text-muted-foreground">
              {transcription.length > 0
                ? `${transcription.split(/\s+/).filter(Boolean).length} palabras`
                : 'Pega la transcripción para comenzar el análisis'}
            </p>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-6 pb-6">
          <div className="space-y-4 pb-2">
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

            {baseAnalysis && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Extracción clínica base
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(baseAnalysis, `${filePrefix}_base.txt`)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Descargar
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {baseAnalysis}
                </div>

                <Separator />

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

            {clinicalReport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Stethoscope className="h-4 w-4 text-primary" />
                    Informe clínico para profesionales
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(clinicalReport, `${filePrefix}_informe_clinico.txt`)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Descargar .txt
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {clinicalReport}
                </div>
              </div>
            )}

            {patientReport && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <User className="h-4 w-4 text-primary" />
                    Informe de sesión para el paciente
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(patientReport, `${filePrefix}_informe_paciente.txt`)}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Descargar .txt
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                  {patientReport}
                </div>
              </div>
            )}

            {baseAnalysis && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="w-full">
                <RotateCcw className="mr-2 h-3 w-3" />
                Nuevo análisis
              </Button>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>,
    document.body,
  );
}

function StepBadge({ n, done, active, label }: { n: number; done: boolean; active: boolean; label: string }) {
  return (
    <Badge
      variant={done ? 'default' : active ? 'secondary' : 'outline'}
      className={`text-xs ${active ? 'animate-pulse' : ''}`}
    >
      {done ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
      {n}. {label}
    </Badge>
  );
}
