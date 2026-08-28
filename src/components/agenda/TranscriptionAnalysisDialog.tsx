import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { Checkbox } from "@/components/ui/checkbox";
import { useTranscriptionAnalysis } from "@/hooks/useTranscriptionAnalysis";
import { useCenter } from "@/hooks/useCenter";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Icon } from '@/components/ui/icon';

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
  const [transcription, setTranscription] = useState("");
  const [editedClinical, setEditedClinical] = useState("");
  const [editedPatient, setEditedPatient] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [generateClinical, setGenerateClinical] = useState(true);
  const [generatePatient, setGeneratePatient] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { centerId, center } = useCenter();
  const isOpenAI = center?.ai_provider !== "gemini";
  const analysisMode = center?.ai_analysis_mode || "layered";
  const isSingleMode = analysisMode === "single";

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
  } = useTranscriptionAnalysis({ sessionId, patientPhone, patientEmail, isOpen: open });

  useEffect(() => {
    if (clinicalReport) setEditedClinical(clinicalReport);
  }, [clinicalReport]);

  useEffect(() => {
    if (patientReport) setEditedPatient(patientReport);
  }, [patientReport]);

  const handleReset = () => {
    setTranscription("");
    setEditedClinical("");
    setEditedPatient("");
    setAudioFileName(null);
    setGenerateClinical(true);
    setGeneratePatient(true);
    reset();
  };

  const handleFullAnalysis = async (text: string) => {
    if (isSingleMode) {
      // Single mode: one call generates both reports
      await analyze(text, 1);
    } else {
      // Layered mode: 3 sequential calls
      const base = await analyze(text, 1);
      if (!base) return;
      if (generateClinical) {
        await analyze(text, 2, base);
      }
      if (generatePatient) {
        await analyze(text, 3, base);
      }
    }
  };

  const handleClose = (val: boolean) => {
    if (!val) handleReset();
    onOpenChange(val);
  };

  const filePrefix = [
    patientName?.replace(/\s+/g, "_") || "sesion",
    sessionDate || new Date().toISOString().split("T")[0],
  ].join("_");

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timer);
        document.body.style.overflow = "";
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [open]);

  const handleAudioUpload = async (file: File) => {
    if (!centerId) {
      toast.error("No se pudo determinar el centro");
      return;
    }

    setIsTranscribing(true);
    setAudioFileName(file.name);

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("centerId", centerId);

      const { data, error } = await supabase.functions.invoke("transcribe-session-audio", {
        body: formData,
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Error al transcribir");

      setTranscription(data.transcription);
      toast.success(`Audio transcrito — ${data.wordCount} palabras`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al transcribir el audio";
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
              <Icon name="description" className="h-5 w-5" />
              Análisis de transcripción de sesión
            </h2>
            {patientName && (
              <p className="text-sm text-muted-foreground">
                {patientName} — {sessionDate}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => handleClose(false)} className="shrink-0">
            <Icon name="close" className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
          {/* Step indicators */}
          {isSingleMode ? (
            isAnalyzing ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                <Icon name="progress_activity" className="h-3 w-3 animate-spin" />
                Generando ambos informes en una sola pasada...
              </div>
            ) : clinicalReport || patientReport ? (
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded px-3 py-2">
                <Icon name="check_circle" className="h-3 w-3 text-primary" />
                Informes generados con análisis directo
              </div>
            ) : null
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <StepBadge n={1} done={!!baseAnalysis} active={currentLayer === 1} label="Extracción base" />
                <Icon name="chevron_right" className="h-4 w-4 text-muted-foreground" />
                <StepBadge n={2} done={!!clinicalReport} active={currentLayer === 2} label="Informe clínico" />
                <Icon name="chevron_right" className="h-4 w-4 text-muted-foreground" />
                <StepBadge n={3} done={!!patientReport} active={currentLayer === 3} label="Informe paciente" />
              </div>

              {isAnalyzing && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  <Icon name="progress_activity" className="h-3 w-3 animate-spin" />
                  {currentLayer === 1 && "Paso 1 — Extrayendo base clínica..."}
                  {currentLayer === 2 && `Paso 2${generatePatient ? "/3" : "/2"} — Generando informe clínico...`}
                  {currentLayer === 3 &&
                    `Paso ${generateClinical ? "3/3" : "2/2"} — Generando informe para el paciente...`}
                </div>
              )}
            </>
          )}

          <Separator />

          {/* Audio upload section */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon name="mic" className="h-4 w-4" />
              <span className="text-sm font-medium">Transcripción automática de audio</span>
              {!isOpenAI && (
                <Badge variant="outline" className="text-xs">
                  Requiere OpenAI
                </Badge>
              )}
            </div>

            {isOpenAI ? (
              <div
                className={cn(
                  "relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors",
                  isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  isTranscribing && "pointer-events-none opacity-70",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.stopPropagation();
                  setIsDragOver(false);
                }}
                onDrop={handleFileDrop}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isTranscribing) fileInputRef.current?.click();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioUpload(file);
                    e.target.value = "";
                  }}
                />

                {isTranscribing ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon name="progress_activity" className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium">Transcribiendo con Whisper...</p>
                    <p className="text-xs text-muted-foreground">{audioFileName}</p>
                    <p className="text-xs text-muted-foreground">Puede tardar 1-2 minutos para sesiones largas</p>
                  </div>
                ) : audioFileName && transcription ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon name="check_circle" className="h-8 w-8 text-primary" />
                    <p className="text-sm font-medium">Audio transcrito correctamente</p>
                    <p className="text-xs text-muted-foreground">{audioFileName}</p>
                    <p className="text-xs text-muted-foreground">Haz clic para cambiar el archivo</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Icon name="upload" className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Arrastra el audio aquí o haz clic para seleccionar</p>
                    <p className="text-xs text-muted-foreground">
                      MP3, M4A, WAV, MP4, OGG · Hasta 200MB · archivos grandes se dividen automáticamente
                    </p>
                    <p className="text-xs text-muted-foreground">~0.006$/min · Una sesión de 1h ≈ 0.36$</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-4">
                <Icon name="error" className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  La transcripción de audio requiere OpenAI como proveedor activo. Cámbialo en Ajustes → Inteligencia
                  Artificial.
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
                const text = e.clipboardData.getData("text/plain");
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
                : "Pega la transcripción para comenzar el análisis"}
            </p>
          </div>

          {/* Selección de informes y botón de inicio */}
          {!isAnalyzing && !baseAnalysis && !clinicalReport && !patientReport && (
            <div className="space-y-3">
              {!isSingleMode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Informes a generar</label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={generateClinical}
                        onCheckedChange={(v) => setGenerateClinical(!!v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <span className="text-sm font-medium">Informe clínico</span>
                        <span className="text-xs text-muted-foreground ml-2">Para el profesional</span>
                      </div>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <Checkbox
                        checked={generatePatient}
                        onCheckedChange={(v) => setGeneratePatient(!!v)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div>
                        <span className="text-sm font-medium">Informe para el paciente</span>
                        <span className="text-xs text-muted-foreground ml-2">En lenguaje accesible</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <Button
                onClick={() => handleFullAnalysis(transcription)}
                disabled={
                  isAnalyzing ||
                  isTranscribing ||
                  transcription.trim().length < 50 ||
                  (!isSingleMode && !generateClinical && !generatePatient)
                }
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                    {isSingleMode
                      ? "Generando informes..."
                      : currentLayer === 1
                        ? "Extrayendo base clínica..."
                        : currentLayer === 2
                          ? "Generando informe clínico..."
                          : "Generando informe paciente..."}
                  </>
                ) : (
                  <>
                    <Icon name="psychology" className="h-4 w-4 mr-2" />
                    Generar informes
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Resultado Capa 1 + botones regenerar */}
          {/* Resultado Capa 1 — solo en modo layered */}
          {baseAnalysis && !isSingleMode && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="check_circle" className="h-4 w-4 text-primary" />
                  Extracción clínica base
                </h3>
                <Button variant="ghost" size="sm" onClick={() => downloadTxt(baseAnalysis, `${filePrefix}_base.txt`)}>
                  <Icon name="download" className="mr-1 h-3 w-3" />
                  Descargar
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
                {baseAnalysis}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => analyze(transcription, 2)} disabled={isAnalyzing}>
                  <Icon name="restart_alt" className="h-3 w-3 mr-1" />
                  Regenerar clínico
                </Button>
                <Button size="sm" variant="outline" onClick={() => analyze(transcription, 3)} disabled={isAnalyzing}>
                  <Icon name="restart_alt" className="h-3 w-3 mr-1" />
                  Regenerar paciente
                </Button>
              </div>
            </div>
          )}

          {/* Informe clínico */}
          {clinicalReport && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="stethoscope" className="h-4 w-4 text-primary" />
                  Informe clínico para profesionales
                  {sessionId && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      Guardado en sesión
                    </Badge>
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadTxt(editedClinical || clinicalReport, `${filePrefix}_informe_clinico.txt`)}
                >
                  <Icon name="download" className="mr-1 h-3 w-3" />
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
                  {isSaving ? <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" /> : <Icon name="save" className="h-4 w-4 mr-1" />}
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
                  <Icon name="person" className="h-4 w-4 text-primary" />
                  Informe de sesión para el contacto
                  {sessionId && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      Guardado en sesión
                    </Badge>
                  )}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadTxt(editedPatient || patientReport, `${filePrefix}_informe_paciente.txt`)}
                >
                  <Icon name="download" className="mr-1 h-3 w-3" />
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
                    {isSaving ? <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" /> : <Icon name="save" className="h-4 w-4 mr-1" />}
                    Guardar cambios
                  </Button>
                )}
                {patientPhone && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendPatientReport("whatsapp", editedPatient)}
                    disabled={isSending}
                  >
                    {isSending ? (
                      <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Icon name="chat" className="h-4 w-4 mr-1" />
                    )}
                    Enviar por WhatsApp
                  </Button>
                )}
                {patientEmail && (
                  <Button size="sm" variant="outline" onClick={() => sendPatientReport("email", editedPatient)} disabled={isSending}>
                    {isSending ? <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" /> : <Icon name="mail" className="h-4 w-4 mr-1" />}
                    Enviar por email
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Botón nuevo análisis */}
          {(baseAnalysis || clinicalReport || patientReport) && (
            <Button variant="outline" onClick={handleReset} className="w-full">
              <Icon name="restart_alt" className="mr-2 h-3 w-3" />
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
      variant={done ? "default" : active ? "secondary" : "outline"}
      className={`text-xs ${active ? "animate-pulse" : ""}`}
    >
      {done ? <Icon name="check_circle" className="mr-1 h-3 w-3" /> : null}
      {n}. {label}
    </Badge>
  );
}
