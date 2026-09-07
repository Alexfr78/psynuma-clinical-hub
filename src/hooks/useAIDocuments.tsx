/**
 * Hook unificado para el catálogo de plantillas de documentos clínicos con IA
 * (`ai_document_types`) y los documentos generados a partir de ellas
 * (`ai_generated_documents`).
 *
 * Sustituye a la orquestación de "3 capas" que antes vivía duplicada en
 * `TranscriptionAnalysisDialog.tsx` y `usePlaudRecordings.tsx` (una llamada por capa,
 * pasándose `baseAnalysis` de mano en mano entre componentes). Con el modelo nuevo:
 *
 * - El cliente pide UN documento por su `key` (`generate('clinical_report', ...)`).
 * - El servidor (`analyze-session-transcription`) resuelve por su cuenta las plantillas
 *   de las que depende (`requires`, p.ej. `clinical_report` depende de `base_extraction`),
 *   reutilizando las que ya existan para la sesión salvo que se pida `regenerate: true`.
 * - Para plantillas de ámbito `session` la transcripción se inyecta en el prompt de cada
 *   documento, no solo en el de `base_extraction`, así que hace falta en TODA generación,
 *   también al regenerar. Cuando el cliente no la manda, el servidor intenta recuperar la
 *   que Plaud guarda durante 30 días en `plaud_recordings.transcript_text` (ver
 *   `useSessionPlaudTranscriptAvailability` más abajo, que replica ese mismo filtro para
 *   saber de antemano si "Regenerar" va a poder funcionar). Solo si tampoco hay transcripción
 *   guardada vigente falla, y con un mensaje que distingue "se borró a los 30 días" de
 *   "esta sesión nunca tuvo grabación de Plaud".
 * - `regenerate: true` controla si, además, se rehace desde cero la dependencia
 *   `base_extraction` en vez de reutilizar la que ya hubiera guardada.
 *
 * Usa `aiDb` (`@/lib/ai-documents-db`) para las tres tablas nuevas, que todavía no están en
 * `src/integrations/supabase/types.ts` (autogenerado).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiDb } from '@/lib/ai-documents-db';
import { supabase } from '@/integrations/supabase/client';
import { renderMarkdown, parseSections } from '@/lib/ai-documents';
import { useCenter } from './useCenter';
import type {
  AiDocumentType,
  AiDocumentScope,
  AiGeneratedDocumentWithType,
} from '@/types/ai-documents';

/** Prefijo común de query key para poder invalidar todo lo de este hook de una vez. */
const AI_DOCUMENTS_KEY = 'ai-documents';

const DOCUMENT_WITH_TYPE_SELECT =
  '*, document_type:ai_document_types(key, label, audience, sections, mirror_column)';

// ---------------------------------------------------------------------------
// Plantillas disponibles
// ---------------------------------------------------------------------------

/**
 * Plantillas activas visibles para un centro, opcionalmente filtradas por `scope`.
 *
 * Une las plantillas de sistema (`center_id IS NULL`, comunes a todos los centros) con las
 * propias del centro: si el centro tiene su propia plantilla para una `key` de sistema, la
 * suya gana (es una personalización, no una plantilla adicional) — nunca se muestran las dos.
 */
export function useAiDocumentTypes(centerId: string | undefined, scope?: AiDocumentScope) {
  return useQuery({
    queryKey: ['ai-document-types', centerId, scope ?? 'all'],
    queryFn: async () => {
      let query = aiDb
        .from('ai_document_types')
        .select('*')
        .eq('is_active', true)
        .or(`center_id.is.null,center_id.eq.${centerId}`)
        .order('sort_order', { ascending: true });

      if (scope) query = query.eq('scope', scope);

      const { data, error } = await query;
      if (error) throw error;

      const byKey = new Map<string, AiDocumentType>();
      for (const row of (data ?? []) as AiDocumentType[]) {
        const existing = byKey.get(row.key);
        if (!existing) {
          byKey.set(row.key, row);
        } else if (existing.center_id === null && row.center_id !== null) {
          // La versión propia del centro sustituye a la de sistema, sea cual sea el orden
          // en el que haya llegado la fila.
          byKey.set(row.key, row);
        }
      }

      return Array.from(byKey.values()).sort((a, b) => a.sort_order - b.sort_order);
    },
    enabled: !!centerId,
  });
}

// ---------------------------------------------------------------------------
// Disponibilidad de transcripción guardada de Plaud (fallback de "Regenerar")
// ---------------------------------------------------------------------------

export interface SessionPlaudTranscriptAvailability {
  /** Hay una grabación de Plaud para esta sesión con `transcript_text` todavía vigente. */
  available: boolean;
  /** `transcript_expires_at` de esa grabación, o `null` si `available` es `false`. */
  expiresAt: string | null;
}

const NO_PLAUD_AVAILABILITY: SessionPlaudTranscriptAvailability = { available: false, expiresAt: null };

/**
 * Dice si `analyze-session-transcription` podría usar una transcripción guardada de Plaud
 * para esta sesión si el cliente no manda ninguna (ver el fallback del servidor, que
 * reproduce exactamente este mismo filtro: `transcript_text` no nulo y `transcript_expires_at`
 * en el futuro, tomando la más recientemente obtenida si hay varias).
 *
 * Deliberadamente NO trae `transcript_text`: al diálogo de regeneración solo le hace falta
 * saber que existe y hasta cuándo, nunca el contenido — evita mover a memoria del navegador
 * un dato clínico que no hace falta mostrar aquí.
 */
export function useSessionPlaudTranscriptAvailability(sessionId: string | undefined) {
  return useQuery({
    queryKey: [AI_DOCUMENTS_KEY, 'plaud-transcript-availability', sessionId],
    queryFn: async (): Promise<SessionPlaudTranscriptAvailability> => {
      const { data, error } = await supabase
        .from('plaud_recordings')
        .select('transcript_expires_at')
        .eq('session_id', sessionId)
        .not('transcript_text', 'is', null)
        .gt('transcript_expires_at', new Date().toISOString())
        .order('transcript_fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { available: true, expiresAt: data.transcript_expires_at } : NO_PLAUD_AVAILABILITY;
    },
    enabled: !!sessionId,
  });
}

// ---------------------------------------------------------------------------
// Documentos ya generados
// ---------------------------------------------------------------------------

/** Documentos generados para una sesión concreta, con su plantilla resuelta. */
export function useSessionAiDocuments(sessionId: string | undefined) {
  return useQuery({
    queryKey: [AI_DOCUMENTS_KEY, 'session', sessionId],
    queryFn: async () => {
      const { data, error } = await aiDb
        .from('ai_generated_documents')
        .select(DOCUMENT_WITH_TYPE_SELECT)
        .eq('session_id', sessionId)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiGeneratedDocumentWithType[];
    },
    enabled: !!sessionId,
  });
}

/** Todos los documentos generados de un paciente (cualquier sesión), con su plantilla resuelta. */
export function usePatientAiDocuments(patientId: string | undefined) {
  return useQuery({
    queryKey: [AI_DOCUMENTS_KEY, 'patient', patientId],
    queryFn: async () => {
      const { data, error } = await aiDb
        .from('ai_generated_documents')
        .select(DOCUMENT_WITH_TYPE_SELECT)
        .eq('patient_id', patientId)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiGeneratedDocumentWithType[];
    },
    enabled: !!patientId,
  });
}

/** El más reciente por `document_type.key`, a partir de una lista ya ordenada por fecha desc. */
export function latestByTypeKey(
  documents: AiGeneratedDocumentWithType[] | undefined,
): Map<string, AiGeneratedDocumentWithType> {
  const byKey = new Map<string, AiGeneratedDocumentWithType>();
  for (const doc of documents ?? []) {
    if (!byKey.has(doc.document_type.key)) {
      byKey.set(doc.document_type.key, doc);
    }
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

/** Mismo shape que `DiarizedTurn` en `supabase/functions/_shared/transcriptDiarization.ts`. */
export interface AiDiarizedTurn {
  speaker: string | null;
  content: string;
}

export interface GenerateAiDocumentInput {
  documentTypeKey: string;
  sessionId?: string;
  patientId?: string;
  sourceSessionIds?: string[];
  transcription?: string;
  segments?: AiDiarizedTurn[];
  transcriptSource?: 'manual' | 'plaud';
  plaudRecordingId?: string;
  inputs?: Record<string, unknown>;
  /**
   * Si es `true`, el servidor ignora las dependencias (`requires`) ya generadas para esta
   * sesión y las rehace — necesario cuando se manda una transcripción nueva y se quiere que
   * se tenga en cuenta de verdad, en vez de reutilizar la extracción base antigua.
   */
  regenerate?: boolean;
}

export interface GenerateAiDocumentDependency {
  key: string;
  documentId: string;
  reused: boolean;
}

export interface GenerateAiDocumentResult {
  documentId: string;
  documentTypeKey: string;
  sections: Record<string, string>;
  markdown: string;
  promptVersionId: string | null;
  modelUsed: string | null;
  dependencies: GenerateAiDocumentDependency[];
}

/**
 * Error de `generate()` que conserva el cuerpo JSON de la respuesta del servidor (cuando se
 * pudo extraer), para que un consumidor que necesite distinguir motivos concretos — p.ej.
 * `usePlaudRecordings.tsx` traduciendo un bloqueo por consentimiento (`consentDenied`,
 * `purpose`, `reason`) a su propio mensaje — pueda hacerlo sin volver a parsear la respuesta.
 */
export class AiDocumentGenerationError extends Error {
  payload: Record<string, unknown> | null;
  constructor(message: string, payload: Record<string, unknown> | null) {
    super(message);
    this.name = 'AiDocumentGenerationError';
    this.payload = payload;
  }
}

/**
 * `supabase.functions.invoke` no expone el cuerpo JSON de una respuesta de error (4xx/5xx)
 * en `data` — solo en `error.context`, como `Response` sin consumir. Mismo patrón que
 * `useInviteProfessional` en `@/hooks/useProfessionals.tsx`. Sin esto, cualquier error del
 * servidor (incluida la denegación de consentimiento) se perdería detrás de un genérico
 * "Edge Function returned a non-2xx status code".
 */
async function extractFunctionResponsePayload(
  error: unknown,
  data: unknown,
): Promise<Record<string, unknown> | null> {
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: unknown }).context;
    if (response instanceof Response) {
      return response.clone().json().catch(() => null);
    }
  }
  return null;
}

/** Invoca `analyze-session-transcription` para un `documentTypeKey` y refresca la caché. */
export function useGenerateAiDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GenerateAiDocumentInput & { centerId: string }): Promise<GenerateAiDocumentResult> => {
      const { data, error } = await supabase.functions.invoke('analyze-session-transcription', {
        body: input,
      });

      const payload = (await extractFunctionResponsePayload(error, data)) as
        | (Record<string, unknown> & { success?: boolean })
        | null;

      if (error) {
        const message = typeof payload?.error === 'string' ? payload.error : error.message;
        throw new AiDocumentGenerationError(message || 'Error al generar el documento', payload);
      }
      if (!payload?.success) {
        throw new AiDocumentGenerationError(
          typeof payload?.error === 'string' ? payload.error : 'Error al generar el documento',
          payload,
        );
      }

      return {
        documentId: payload.documentId as string,
        documentTypeKey: payload.documentTypeKey as string,
        sections: (payload.sections ?? {}) as Record<string, string>,
        markdown: (payload.markdown ?? '') as string,
        promptVersionId: (payload.promptVersionId as string | null) ?? null,
        modelUsed: (payload.modelUsed as string | null) ?? null,
        dependencies: (payload.dependencies ?? []) as GenerateAiDocumentDependency[],
      };
    },
    onSuccess: (_result, variables) => {
      // Invalidación amplia: cubre tanto la lista de la sesión como la del paciente (una
      // generación puede haber creado de paso una dependencia que también aparece en otras
      // vistas), y `sessions` porque el servidor espeja el markdown en
      // `ai_summary_clinical`/`ai_summary_patient` cuando la plantilla tiene `mirror_column`.
      queryClient.invalidateQueries({ queryKey: [AI_DOCUMENTS_KEY] });
      if (variables.sessionId) {
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Edición manual
// ---------------------------------------------------------------------------

export interface SaveAiDocumentEditInput {
  documentId: string;
  /** Contenido completo por sección tras la edición (no solo lo que cambió). */
  sections: Record<string, string>;
  /** `sections` (jsonb crudo) de la plantilla del documento, para re-renderizar el markdown. */
  templateSections: unknown;
}

/**
 * Guarda la edición manual de un documento: nunca toca `content_sections` (el original que
 * generó la IA), solo `edited_sections` + `edited_markdown`, re-renderizado con la misma
 * función canónica que usa el servidor (`renderMarkdown`, ver `@/lib/ai-documents`).
 *
 * Además sincroniza la columna espejo de `sessions` cuando la plantilla declara una. Esto
 * NO es opcional: `send-notification` solo deja enviar al paciente un mensaje que coincida
 * carácter a carácter con `sessions.ai_summary_clinical` / `ai_summary_patient` (es su
 * control antimanipulación, ver `supabase/functions/send-notification/index.ts:105-119`).
 * Sin esta sincronización, editar un informe y enviarlo lo bloquearía siempre, porque el
 * espejo seguiría conteniendo el texto original de la IA.
 */
export function useSaveAiDocumentEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, sections, templateSections }: SaveAiDocumentEditInput) => {
      const parsedSections = parseSections(templateSections);
      const markdown = renderMarkdown(parsedSections, sections);

      const { data: updated, error } = await aiDb
        .from('ai_generated_documents')
        .update({ edited_sections: sections, edited_markdown: markdown })
        .eq('id', documentId)
        .select('session_id, document_type:ai_document_types(mirror_column)')
        .maybeSingle();
      if (error) throw error;

      const mirrorColumn = (updated as { document_type?: { mirror_column?: string | null } } | null)
        ?.document_type?.mirror_column;
      const sessionId = (updated as { session_id?: string | null } | null)?.session_id;

      if (mirrorColumn && sessionId) {
        const { error: mirrorError } = await supabase
          .from('sessions')
          .update({ [mirrorColumn]: markdown })
          .eq('id', sessionId);
        // Si el espejo falla, la edición ya está guardada pero el envío al paciente
        // quedaría bloqueado: mejor avisar que dejarlo pasar en silencio.
        if (mirrorError) throw mirrorError;
      }

      return { markdown };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AI_DOCUMENTS_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// Hook compuesto — el que consumen los diálogos/paneles
// ---------------------------------------------------------------------------

export interface UseAIDocumentsOptions {
  /** Si no se indica, se toma del centro del usuario (`useCenter`). */
  centerId?: string;
  sessionId?: string;
  patientId?: string;
  /** Ámbito de plantillas a listar. Por defecto `'session'`. */
  scope?: AiDocumentScope;
  enabled?: boolean;
}

/**
 * Vista compuesta: plantillas disponibles + documentos ya generados (de la sesión si se pasa
 * `sessionId`, si no del paciente) + acciones de generar y guardar edición. Es lo que deben
 * usar los componentes en vez de reimplementar la orquestación de capas a mano.
 */
export function useAIDocuments(options: UseAIDocumentsOptions = {}) {
  const { sessionId, patientId, scope = 'session', enabled = true } = options;
  const { center } = useCenter();
  const centerId = options.centerId ?? center?.id;

  const templatesQuery = useAiDocumentTypes(centerId, scope);
  const sessionDocsQuery = useSessionAiDocuments(enabled && sessionId ? sessionId : undefined);
  const patientDocsQuery = usePatientAiDocuments(enabled && !sessionId && patientId ? patientId : undefined);
  const generateMutation = useGenerateAiDocument();
  const saveEditMutation = useSaveAiDocumentEdit();

  const usingSessionDocs = !!sessionId;
  const documents = usingSessionDocs ? sessionDocsQuery.data : patientDocsQuery.data;
  const isLoadingDocuments = usingSessionDocs ? sessionDocsQuery.isLoading : patientDocsQuery.isLoading;

  const documentsByKey = latestByTypeKey(documents);

  const generate = (documentTypeKey: string, opts: Omit<GenerateAiDocumentInput, 'documentTypeKey'> = {}) => {
    if (!centerId) return Promise.reject(new Error('No se pudo determinar el centro.'));
    return generateMutation.mutateAsync({
      documentTypeKey,
      centerId,
      sessionId,
      patientId,
      ...opts,
    });
  };

  const saveEdit = (documentId: string, sections: Record<string, string>, templateSections: unknown) =>
    saveEditMutation.mutateAsync({ documentId, sections, templateSections });

  return {
    centerId,
    templates: templatesQuery.data ?? [],
    isLoadingTemplates: templatesQuery.isLoading,
    documents: documents ?? [],
    documentsByKey,
    isLoadingDocuments,
    generate,
    isGenerating: generateMutation.isPending,
    saveEdit,
    isSavingEdit: saveEditMutation.isPending,
  };
}
