import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranscriptionAnalysis } from "@/hooks/useTranscriptionAnalysis";
import { useAIDocuments, useSessionPlaudTranscriptAvailability } from "@/hooks/useAIDocuments";
import { useCenter } from "@/hooks/useCenter";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Icon } from '@/components/ui/icon';
import { parseSections, effectiveSections, effectiveMarkdown } from "@/lib/ai-documents";
import type { AiDocumentType, AiGeneratedDocumentWithType } from "@/types/ai-documents";

interface TranscriptionAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  sessionDate?: string;
}

// Mínimo de caracteres para considerar que hay una transcripción "real" pegada en el
// cuadro de texto, tanto para habilitar la primera generación como para decidir si un
// "Regenerar" debe forzar rehacer la cadena de dependencias (ver `genOpts` más abajo).
const MIN_TRANSCRIPTION_LENGTH = 50;

/** Formatea `transcript_expires_at` para el mensaje "disponible hasta el ...". */
function formatPlaudExpiry(expiresAt: string | null): string {
  if (!expiresAt) return "una fecha desconocida";
  return new Date(expiresAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [generateClinical, setGenerateClinical] = useState(true);
  const [generatePatient, setGeneratePatient] = useState(true);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { centerId, center } = useCenter();
  const isOpenAI = center?.ai_provider !== "gemini";

  const { consent, sendPatientReport, downloadTxt, isSending } = useTranscriptionAnalysis({
    sessionId,
    patientPhone,
    patientEmail,
    isOpen: open,
  });

  // Fuente de verdad de plantillas y documentos generados — sustituye a la orquestación de
  // "3 capas" que antes vivía aquí mismo. Ver `@/hooks/useAIDocuments`.
  const aiDocs = useAIDocuments({ sessionId, scope: "session", enabled: open });

  // Fallback de "Regenerar" cuando la caja de transcripción está vacía: si Plaud todavía
  // conserva el texto de la sesión (30 días, ver `sync-plaud-recordings`), el servidor lo
  // recupera solo — ver el fallback en `analyze-session-transcription/index.ts`, ejecutado
  // después de la puerta de consentimiento. Aquí solo hace falta saber si existe y hasta
  // cuándo, para decidir si el botón puede activarse y qué decirle al profesional.
  const plaudAvailability = useSessionPlaudTranscriptAvailability(open ? sessionId : undefined);
  const hasPlaudFallback = plaudAvailability.data?.available ?? false;
  const plaudExpiresAt = plaudAvailability.data?.expiresAt ?? null;

  const clinicalTemplate = aiDocs.templates.find((t) => t.key === "clinical_report");
  const patientTemplate = aiDocs.templates.find((t) => t.key === "patient_report");
  // El resto de plantillas de sesión (nota SOAP, anamnesis, tareas...) salvo las de uso
  // interno (p.ej. `base_extraction`, que el servidor genera solo como dependencia y nunca
  // se muestra directamente al profesional).
  const otherTemplates = aiDocs.templates.filter(
    (t) => t.audience !== "internal" && t.key !== "clinical_report" && t.key !== "patient_report"
  );

  const clinicalDoc = aiDocs.documentsByKey.get("clinical_report");
  const patientDoc = aiDocs.documentsByKey.get("patient_report");

  const hasTranscription = transcription.trim().length >= MIN_TRANSCRIPTION_LENGTH;

  /**
   * Todas las plantillas de ámbito "session" necesitan una transcripción para generar o
   * regenerar el documento. Hay dos formas de que la tengan sin que el profesional la pegue
   * en el cuadro de texto en este momento:
   *
   * 1. Está en el propio request (`hasTranscription`): lo de siempre.
   * 2. El servidor la recupera solo de `plaud_recordings.transcript_text` si la grabación
   *    de Plaud de esta sesión sigue vigente (retención de 30 días, ver
   *    `analyze-session-transcription/index.ts`, fallback tras la puerta de consentimiento).
   *    `hasPlaudFallback` refleja exactamente esa misma condición (`transcript_text` no
   *    nulo y `transcript_expires_at` en el futuro) para poder habilitar el botón y avisar
   *    de dónde saldrá el texto, sin tener que traer la transcripción entera al cliente.
   *
   * Si no se da ninguna de las dos, el botón se deshabilita con el motivo real: no hay nada
   * de dónde sacar la transcripción (ni pegada, ni Plaud vigente).
   */
  const canGenerateTemplate = (template: AiDocumentType | undefined): { can: boolean; reason?: string } => {
    if (!template) return { can: false, reason: "Plantilla no disponible." };
    if (hasTranscription) return { can: true };
    if (hasPlaudFallback) {
      return {
        can: true,
        reason: `Se usará la transcripción guardada de Plaud, disponible hasta el ${formatPlaudExpiry(plaudExpiresAt)}.`,
      };
    }
    return {
      can: false,
      reason: "Pega la transcripción de la sesión para generar o regenerar este documento.",
    };
  };

  const genOpts = (): { transcription: string; regenerate: true } => ({ transcription, regenerate: true });

  const handleGenerate = async (key: string, label: string) => {
    if (consent.generateBlockReason) {
      toast.error(consent.generateBlockReason);
      return;
    }
    setGeneratingKey(key);
    try {
      await aiDocs.generate(key, genOpts());
      toast.success(`${label} generado`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Error al generar: ${label.toLowerCase()}`;
      toast.error(message);
    } finally {
      setGeneratingKey(null);
    }
  };

  const handleFullAnalysis = async () => {
    if (consent.generateBlockReason) {
      toast.error(consent.generateBlockReason);
      return;
    }
    if (generateClinical) {
      await handleGenerate("clinical_report", "Informe clínico");
    }
    if (generatePatient) {
      await handleGenerate("patient_report", "Informe para el paciente");
    }
  };

  const handleReset = () => {
    setTranscription("");
    setAudioFileName(null);
    setGenerateClinical(true);
    setGeneratePatient(true);
    setGeneratingKey(null);
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

  const isAnalyzing = aiDocs.isGenerating && generatingKey !== null;

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
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <StepBadge n={1} done={!!clinicalDoc} active={generatingKey === "clinical_report"} label="Informe clínico" />
            <Icon name="chevron_right" className="h-4 w-4 text-muted-foreground" />
            <StepBadge n={2} done={!!patientDoc} active={generatingKey === "patient_report"} label="Informe paciente" />
          </div>

          {isAnalyzing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
              <Icon name="progress_activity" className="h-3 w-3 animate-spin" />
              {generatingKey === "clinical_report" && "Generando informe clínico..."}
              {generatingKey === "patient_report" && "Generando informe para el paciente..."}
              {generatingKey && generatingKey !== "clinical_report" && generatingKey !== "patient_report" &&
                `Generando ${aiDocs.templates.find((t) => t.key === generatingKey)?.label.toLowerCase() || "documento"}...`}
            </div>
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
                : hasPlaudFallback
                  ? `Se usará la transcripción guardada de Plaud, disponible hasta el ${formatPlaudExpiry(plaudExpiresAt)}.`
                  : (clinicalDoc || patientDoc)
                    ? "Necesaria también para regenerar: pégala de nuevo antes de generar o regenerar cualquier documento de esta sesión."
                    : "Pega la transcripción para comenzar el análisis"}
            </p>
          </div>

          {/* Selección de informes y botón de inicio */}
          {!isAnalyzing && !clinicalDoc && !patientDoc && (
            <div className="space-y-3">
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

              {consent.generateBlockReason && (
                <Alert variant="destructive">
                  <Icon name="lock" className="h-4 w-4" />
                  <AlertDescription>{consent.generateBlockReason}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleFullAnalysis}
                disabled={
                  isAnalyzing ||
                  isTranscribing ||
                  !hasTranscription ||
                  (!generateClinical && !generatePatient) ||
                  consent.isLoading ||
                  !!consent.generateBlockReason
                }
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                    {generatingKey === "clinical_report" ? "Generando informe clínico..." : "Generando informe paciente..."}
                  </>
                ) : consent.isLoading ? (
                  <>
                    <Icon name="progress_activity" className="h-4 w-4 mr-2 animate-spin" />
                    Comprobando consentimiento...
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

          {/* Informe clínico */}
          {clinicalDoc && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="stethoscope" className="h-4 w-4 text-primary" />
                  Informe clínico para profesionales
                  {sessionId && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      Guardado en sesión
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(effectiveMarkdown(clinicalDoc), `${filePrefix}_informe_clinico.txt`)}
                  >
                    <Icon name="download" className="mr-1 h-3 w-3" />
                    Descargar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGenerate("clinical_report", "Informe clínico")}
                    disabled={isAnalyzing || !canGenerateTemplate(clinicalTemplate).can}
                    title={canGenerateTemplate(clinicalTemplate).reason}
                  >
                    <Icon name="restart_alt" className="h-3 w-3 mr-1" />
                    Regenerar
                  </Button>
                </div>
              </div>
              <DocumentSectionsEditor
                doc={clinicalDoc}
                template={clinicalTemplate}
                isSaving={aiDocs.isSavingEdit}
                onSave={(sections) =>
                  aiDocs.saveEdit(clinicalDoc.id, sections, clinicalTemplate?.sections ?? clinicalDoc.document_type.sections)
                }
              />
            </div>
          )}

          {/* Informe paciente */}
          {patientDoc && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="person" className="h-4 w-4 text-primary" />
                  Informe de sesión para el contacto
                  {sessionId && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      Guardado en sesión
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadTxt(effectiveMarkdown(patientDoc), `${filePrefix}_informe_paciente.txt`)}
                  >
                    <Icon name="download" className="mr-1 h-3 w-3" />
                    Descargar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGenerate("patient_report", "Informe para el paciente")}
                    disabled={isAnalyzing || !canGenerateTemplate(patientTemplate).can}
                    title={canGenerateTemplate(patientTemplate).reason}
                  >
                    <Icon name="restart_alt" className="h-3 w-3 mr-1" />
                    Regenerar
                  </Button>
                </div>
              </div>
              <DocumentSectionsEditor
                doc={patientDoc}
                template={patientTemplate}
                isSaving={aiDocs.isSavingEdit}
                onSave={(sections) =>
                  aiDocs.saveEdit(patientDoc.id, sections, patientTemplate?.sections ?? patientDoc.document_type.sections)
                }
              />
              <div className="flex flex-wrap gap-2">
                {patientPhone && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendPatientReport("whatsapp", effectiveMarkdown(patientDoc))}
                    disabled={isSending || consent.isLoading || !!consent.whatsappBlockReason}
                    title={consent.whatsappBlockReason || undefined}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendPatientReport("email", effectiveMarkdown(patientDoc))}
                    disabled={isSending || consent.isLoading || !!consent.emailBlockReason}
                    title={consent.emailBlockReason || undefined}
                  >
                    {isSending ? <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" /> : <Icon name="mail" className="h-4 w-4 mr-1" />}
                    Enviar por email
                  </Button>
                )}
              </div>
              {(consent.whatsappBlockReason || consent.emailBlockReason) && (
                <div className="space-y-1">
                  {consent.whatsappBlockReason && (
                    <p className="text-xs text-muted-foreground">
                      <Icon name="lock" className="h-3 w-3 mr-1 inline align-text-bottom" />
                      {consent.whatsappBlockReason}
                    </p>
                  )}
                  {consent.emailBlockReason && (
                    <p className="text-xs text-muted-foreground">
                      <Icon name="lock" className="h-3 w-3 mr-1 inline align-text-bottom" />
                      {consent.emailBlockReason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Otros documentos disponibles (nota SOAP, anamnesis, tareas...) */}
          {otherTemplates.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Icon name="library_books" className="h-4 w-4 text-muted-foreground" />
                  Otros documentos
                </h3>
                {otherTemplates.map((template) => {
                  const doc = aiDocs.documentsByKey.get(template.key);
                  const gate = canGenerateTemplate(template);
                  return (
                    <Collapsible key={template.key}>
                      <div className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{template.label}</p>
                            {template.description && (
                              <p className="text-xs text-muted-foreground">{template.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {doc && (
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Icon name="expand_more" className="h-3 w-3 mr-1" />
                                  Ver
                                </Button>
                              </CollapsibleTrigger>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={generatingKey !== null || !gate.can || !!consent.generateBlockReason}
                              title={gate.reason}
                              onClick={() => handleGenerate(template.key, template.label)}
                            >
                              {generatingKey === template.key ? (
                                <Icon name="progress_activity" className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Icon name={doc ? "restart_alt" : "auto_awesome"} className="h-3 w-3 mr-1" />
                              )}
                              {doc ? "Regenerar" : "Generar"}
                            </Button>
                          </div>
                        </div>
                        {doc && (
                          <CollapsibleContent className="pt-1">
                            <DocumentSectionsEditor
                              doc={doc}
                              template={template}
                              isSaving={aiDocs.isSavingEdit}
                              onSave={(sections) => aiDocs.saveEdit(doc.id, sections, template.sections)}
                            />
                          </CollapsibleContent>
                        )}
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </>
          )}

          {/* Botón nuevo análisis */}
          {(clinicalDoc || patientDoc) && (
            <Button variant="outline" onClick={handleReset} className="w-full">
              <Icon name="restart_alt" className="mr-2 h-3 w-3" />
              Limpiar transcripción
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

/**
 * Editor por secciones de un documento generado. Si el documento no encaja con las
 * secciones declaradas por su plantilla (caso de los documentos heredados del backfill,
 * cuyo `content_sections` es `{"legacy": "..."}`), se muestra el markdown vigente en modo
 * lectura en vez de intentar repartirlo entre secciones que no existen — forzar ese reparto
 * perdería contenido en vez de solo mostrarlo distinto.
 */
function DocumentSectionsEditor({
  doc,
  template,
  onSave,
  isSaving,
}: {
  doc: AiGeneratedDocumentWithType;
  template: AiDocumentType | undefined;
  onSave: (sections: Record<string, string>) => void;
  isSaving: boolean;
}) {
  const templateSections = useMemo(
    () => parseSections(template?.sections ?? doc.document_type.sections),
    [template, doc.document_type.sections],
  );
  const initialValues = useMemo(() => effectiveSections(doc), [doc]);
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    setValues(effectiveSections(doc));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.edited_sections, doc.content_sections]);

  const hasKnownContent = templateSections.some((section) => (initialValues[section.key] ?? "").trim());

  if (templateSections.length === 0 || !hasKnownContent) {
    return (
      <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-4 text-sm whitespace-pre-wrap">
        {effectiveMarkdown(doc) || "Sin contenido."}
      </div>
    );
  }

  const dirty = templateSections.some((section) => (values[section.key] ?? "") !== (initialValues[section.key] ?? ""));

  return (
    <div className="space-y-3">
      {templateSections.map((section) => (
        <div key={section.key} className="space-y-1">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {section.label}
            {section.shareable && (
              <Badge variant="outline" className="text-[10px]">
                Compartible
              </Badge>
            )}
          </label>
          <Textarea
            value={values[section.key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [section.key]: e.target.value }))}
            className="min-h-[80px] text-sm"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      ))}
      {dirty && (
        <Button size="sm" onClick={() => onSave(values)} disabled={isSaving}>
          {isSaving ? (
            <Icon name="progress_activity" className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Icon name="save" className="h-4 w-4 mr-1" />
          )}
          Guardar cambios
        </Button>
      )}
    </div>
  );
}
