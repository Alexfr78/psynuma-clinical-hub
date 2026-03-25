import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  Save,
  MessageCircle,
  Mail,
  Mic,
  AlertCircle,
  Upload,
  Brain,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranscriptionAnalysis } from '@/hooks/useTranscriptionAnalysis';
import { useCenter } from '@/hooks/useCenter';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TranscriptionAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  sessionDate?: string;
}

export function TranscriptionAnalysisDialog({
  open,
  onOpenChange,
  sessionId,
  patientName,
  patientPhone,
  patientEmail,
  sessionDate,
}: TranscriptionAnalysisDialogProps) {
  const [transcription, setTranscription] = useState('');
  const [editedClinical, setEditedClinical] = useState('');
  const [editedPatient, setEditedPatient] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [generateClinical, setGenerateClinical] = useState(true);
  const [generatePatient, setGeneratePatient] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { centerId, center } = useCenter();
  const isOpenAI = (center as any)?.ai_provider !== 'gemini';

  const {
    baseAnalysis,
    clinicalReport,
    patientReport,
    isAnalyzing,
    isSaving,
    isSending,
    currentLayer,
    analyze,
    saveClinicalReport,
    savePatientReport,
    sendPatientReport,
    downloadTxt,
    reset,
  } = useTranscriptionAnalysis({ sessionId, patientPhone, patientEmail });

  useEffect(() => {
    if (clinicalReport) setEditedClinical(clinicalReport);
  }, [clinicalReport]);

  useEffect(() => {
    if (patientReport) setEditedPatient(patientReport);
  }, [patientReport]);

  const handleReset = () => {
    setTranscription('');
    setEditedClinical('');
    setEditedPatient('');
    setAudioFileName(null);
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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = '';
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [open]);

  const handleAudioUpload = async (file: File) => {
    if (!centerId) {
      toast.error('No se pudo determinar el centro');
      return;
    }

    setIsTranscribing(true);
    setAudioFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('centerId', centerId);

      const { data, error } = await supabase.functions.invoke('transcribe-session-audio', {
        body: formData,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Error al transcribir');

      setTranscription(data.transcription);
      toast.success(`Audio transcrito — ${data.wordCount} palabras`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al transcribir el audio';
      toast.error(message);
      setAudioFileName(null);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAudioUpload(file);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => handleClose(false)}
        onWheel={(e) => e.preventDefault()}
      />

      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transcription-analysis-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border bg-background shadow-lg"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
        <div className="flex items-start justify-between gap-4 border-b px-6 py-4 shrink-0">
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {/* Step indicators */}
          <div className="flex items-center gap-2 text-sm">
            <StepBadge n={1} done={!!baseAnalysis} active={currentLayer === 1} label="Extracción base" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepBadge n={2} done={!!clinicalReport} active={currentLayer === 2} label="Informe clínico" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepBadge n={3} done={!!patientReport} active={currentLayer === 3} label="Informe paciente" />
          </div>

          <Separator />

          {/* Audio upload section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              <span className="text-sm font-medium">Transcripción automática de audio</span>
              {!isOpenAI && (
                <Badge variant="outline" className="text-xs">Requiere OpenAI</Badge>
              )}
            </div>

            {isOpenAI ? (
              <div
                className={cn(
                  'relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors',
                  isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
                  isTranscribing && 'pointer-events-none opacity-70',
                )}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                onDragLeave={(e) => { e.stopPropagation(); setIsDragOver(false); }}
                onDrop={handleFileDrop}
                onClick={(e) => { e.stopPropagation(); if (!isTranscribing) fileInputRef.current?.click(); }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioUpload(file);
                    e.target.value = '';
                  }}
                />

                {isTranscribing ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Transcribiendo con Whisper...</p>
                    <p className="text-xs text-muted-foreground">{audioFileName}</p>
                    <p className="text-xs text-muted-foreground">Puede tardar 1-2 minutos para sesiones largas</p>
                  </div>
                ) : audioFileName && transcription ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                    <p className="text-sm font-medium">Audio transcrito correctamente</p>
                    <p className="text-xs text-muted-foreground">{audioFileName}</p>
                    <p className="text-xs text-muted-foreground">Haz clic para cambiar el archivo</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Arrastra el audio aquí o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground">MP3, M4A, WAV, MP4, OGG · Hasta 200MB · archivos grandes se dividen automáticamente</p>
                    <p className="text-xs text-muted-foreground">~0.006$/min · Una sesión de 1h ≈ 0.36$</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-4">
                <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  La transcripción de audio requiere OpenAI como proveedor activo. Cámbialo en Ajustes → Inteligencia Artificial.
                </p>
              </div>
            )}
          </div>

          {/* Divider between audio and manual text */}
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground shrink-0">o pega la transcripción manualmente</span>
            <Separator className="flex-1" />
          </div>

          {/* Textarea — siempre visible */}
          <div className="space-y-2">
            <label htmlFor="transcription-input" className="text-sm font-medium">
              Transcripción de la sesión
            </label>
            <Textarea
              ref={textareaRef}
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
              onKeyDown={(e) => e.stopPropagation()}
              disabled={isAnalyzing || isTranscribing}
            />
            <p className="text-xs text-muted-foreground">
              {transcription.length > 0
                ? `${transcription.split(/\s+/).filter(Boolean).length} palabras`
                : 'Pega la transcripción para comenzar el análisis'}
            </p>
          </div>

          {/* Botón Paso 1 */}
          {!baseAnalysis && (
            <Button
              onClick={() => analyze(transcription, 1)}
              disabled={isAnalyzing || isTranscribing || transcription.trim().length < 50}
              className="w-full"
            >
              {isAnalyzing && currentLayer === 1 ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analizando transcripción...</>
              ) : (
                <><Stethoscope className="mr-2 h-4 w-4" />Paso 1: Extracción clínica base</>
              )}
            </Button>
          )}

          {/* Resultado Capa 1 + botones Capa 2 y 3 */}
          {baseAnalysis && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  Extracción clínica base
                </h3>
                <Button variant="ghost" size="sm" onClick={() => downloadTxt(baseAnalysis, `${filePrefix}_base.txt`)}>
                  <Download className="mr-1 h-3 w-3" />
                  Descargar
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                {baseAnalysis}
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => analyze(transcription, 2)} disabled={isAnalyzing} variant={clinicalReport ? 'outline' : 'default'}>
                  {isAnalyzing && currentLayer === 2 ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando...</>
                  ) : (
                    <><Stethoscope className="mr-2 h-4 w-4" />{clinicalReport ? 'Regenerar' : 'Informe clínico'}</>
                  )}
                </Button>
                <Button onClick={() => analyze(transcription, 3)} disabled={isAnalyzing} variant={patientReport ? 'outline' : 'default'}>
                  {isAnalyzing && currentLayer === 3 ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generando...</>
                  ) : (
                    <><User className="mr-2 h-4 w-4" />{patientReport ? 'Regenerar' : 'Informe paciente'}</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Informe clínico */}
          {clinicalReport && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Informe clínico para profesionales
                  {sessionId && <Badge variant="outline" className="text-xs text-green-600">Guardado en sesión</Badge>}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => downloadTxt(editedClinical || clinicalReport, `${filePrefix}_informe_clinico.txt`)}>
                  <Download className="mr-1 h-3 w-3" />
                  Descargar .txt
                </Button>
              </div>
              <Textarea
                value={editedClinical}
                onChange={(e) => setEditedClinical(e.target.value)}
                className="min-h-[200px] text-sm font-mono"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
              {sessionId && editedClinical !== clinicalReport && (
                <Button size="sm" onClick={() => saveClinicalReport(editedClinical)} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Guardar cambios
                </Button>
              )}
            </div>
          )}

          {/* Informe paciente */}
          {patientReport && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <User className="h-4 w-4 text-primary" />
                  Informe de sesión para el contacto
                  {sessionId && <Badge variant="outline" className="text-xs text-green-600">Guardado en sesión</Badge>}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => downloadTxt(editedPatient || patientReport, `${filePrefix}_informe_paciente.txt`)}>
                  <Download className="mr-1 h-3 w-3" />
                  Descargar .txt
                </Button>
              </div>
              <Textarea
                value={editedPatient}
                onChange={(e) => setEditedPatient(e.target.value)}
                className="min-h-[200px] text-sm"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="flex flex-wrap gap-2">
                {sessionId && editedPatient !== patientReport && (
                  <Button size="sm" onClick={() => savePatientReport(editedPatient)} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar cambios
                  </Button>
                )}
                {patientPhone && (
                  <Button size="sm" variant="outline" onClick={() => sendPatientReport('whatsapp')} disabled={isSending}>
                    {isSending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />}
                    Enviar por WhatsApp
                  </Button>
                )}
                {patientEmail && (
                  <Button size="sm" variant="outline" onClick={() => sendPatientReport('email')} disabled={isSending}>
                    {isSending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Mail className="h-4 w-4 mr-1" />}
                    Enviar por email
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Botón nuevo análisis */}
          {baseAnalysis && (
            <Button variant="outline" onClick={handleReset} className="w-full">
              <RotateCcw className="mr-2 h-3 w-3" />
              Nuevo análisis
            </Button>
          )}
        </div>
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
