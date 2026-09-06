/**
 * Bandeja de revisión de grabaciones Plaud.
 *
 * `plaud_recordings` todavía no existe en `src/integrations/supabase/types.ts` (otro agente
 * está creando la tabla en Supabase). Para no bloquear este trabajo se amplía el tipo
 * `Database` generado con la forma de esa tabla, documentada en el encargo, y se usa esa
 * versión ampliada solo para las consultas de este archivo.
 *
 * QUITAR ESTO CUANDO SE REGENEREN LOS TIPOS: en cuanto `npx supabase gen types` incluya
 * `plaud_recordings`, borra el bloque "Augmented Database" de abajo y sustituye
 * `plaudClient` por el `supabase` normal en las funciones de este archivo — si los nombres
 * de columnas coinciden con los de aquí, no hace falta tocar nada más.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './useAuth';
import { checkPatientConsent, type ConsentCheckResult, type ConsentDenialReason, type ConsentPurpose } from '@/lib/consent-verification';
import { describePlaudGenerationBlock } from '@/components/plaud/plaudReviewLabels';

// ---------------------------------------------------------------------------
// Augmented Database (temporal, ver cabecera del archivo)
// ---------------------------------------------------------------------------

export type PlaudRecordingStatus =
  | 'pending'
  | 'matched'
  | 'needs_review'
  | 'ignored'
  | 'processed'
  | 'error';

export type PlaudMatchedBy = 'auto' | 'manual';

export interface PlaudRecordingRow {
  id: string;
  center_id: string;
  plaud_file_id: string;
  start_at: string;
  duration_ms: number;
  serial_number: string | null;
  status: PlaudRecordingStatus;
  contains_multiple_sessions: boolean;
  segmentation_score: number | null;
  segmentation_signals: Json | null;
  segment_boundaries: Json | null;
  overlap_flag: boolean;
  overlap_with_file_id: string | null;
  session_id: string | null;
  patient_id: string | null;
  match_confidence: number | null;
  match_reasons: Json | null;
  matched_by: PlaudMatchedBy | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  transcript_text: string | null;
  transcript_fetched_at: string | null;
  transcript_expires_at: string | null;
  report_generated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

type PlaudRecordingUpdate = Partial<PlaudRecordingRow>;

/** Los tipos generados ya incluyen `plaud_recordings`: se usa el cliente normal. */
const plaudClient = supabase;


// ---------------------------------------------------------------------------
// Datos combinados para presentación
// ---------------------------------------------------------------------------

export interface PlaudSessionRef {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
}

export interface PlaudOverlapRef {
  id: string;
  start_at: string;
  duration_ms: number;
}

export interface PlaudConfirmedByRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface PlaudRecordingWithContext extends PlaudRecordingRow {
  suggestedSession: PlaudSessionRef | null;
  overlapRecording: PlaudOverlapRef | null;
  confirmedByProfile: PlaudConfirmedByRef | null;
}

const RESOLVED_STATUSES: PlaudRecordingStatus[] = ['matched', 'ignored', 'processed'];

async function attachContext(
  recordings: PlaudRecordingRow[],
  centerId: string,
): Promise<PlaudRecordingWithContext[]> {
  if (recordings.length === 0) return [];

  const sessionIds = Array.from(new Set(recordings.map((r) => r.session_id).filter((v): v is string => !!v)));
  const overlapFileIds = Array.from(new Set(recordings.map((r) => r.overlap_with_file_id).filter((v): v is string => !!v)));
  const confirmedByIds = Array.from(new Set(recordings.map((r) => r.confirmed_by).filter((v): v is string => !!v)));

  const [sessionsRes, overlapRes, profilesRes] = await Promise.all([
    sessionIds.length > 0
      ? supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, patient_id, patients!sessions_patient_id_fkey(first_name, last_name)')
        .in('id', sessionIds)
      : Promise.resolve({ data: [], error: null }),
    overlapFileIds.length > 0
      ? plaudClient
        .from('plaud_recordings')
        .select('id, plaud_file_id, start_at, duration_ms')
        .eq('center_id', centerId)
        .in('plaud_file_id', overlapFileIds)
      : Promise.resolve({ data: [], error: null }),
    confirmedByIds.length > 0
      ? supabase.from('profiles').select('id, first_name, last_name').in('id', confirmedByIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (overlapRes.error) throw overlapRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const sessionMap = new Map<string, PlaudSessionRef>();
  for (const s of (sessionsRes.data ?? []) as Array<{
    id: string;
    session_date: string;
    start_time: string;
    end_time: string;
    patient_id: string;
    patients: { first_name: string; last_name: string } | null;
  }>) {
    sessionMap.set(s.id, {
      id: s.id,
      session_date: s.session_date,
      start_time: s.start_time,
      end_time: s.end_time,
      patient_id: s.patient_id,
      patient_first_name: s.patients?.first_name ?? '',
      patient_last_name: s.patients?.last_name ?? '',
    });
  }

  const overlapMap = new Map<string, PlaudOverlapRef>();
  for (const o of (overlapRes.data ?? []) as Array<{ id: string; plaud_file_id: string; start_at: string; duration_ms: number }>) {
    overlapMap.set(o.plaud_file_id, { id: o.id, start_at: o.start_at, duration_ms: o.duration_ms });
  }

  const profileMap = new Map<string, PlaudConfirmedByRef>();
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
    profileMap.set(p.id, p);
  }

  return recordings.map((r) => ({
    ...r,
    suggestedSession: r.session_id ? sessionMap.get(r.session_id) ?? null : null,
    overlapRecording: r.overlap_with_file_id ? overlapMap.get(r.overlap_with_file_id) ?? null : null,
    confirmedByProfile: r.confirmed_by ? profileMap.get(r.confirmed_by) ?? null : null,
  }));
}

/**
 * Bandeja de grabaciones Plaud. `scope: 'needs_review'` trae solo las pendientes de
 * decisión humana; `scope: 'resolved'` trae el historial (emparejadas, descartadas o
 * procesadas) para consulta.
 */
export function usePlaudRecordings(scope: 'needs_review' | 'resolved', options?: { enabled?: boolean }) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-recordings', scope, centerId],
    queryFn: async () => {
      if (!centerId) return [];

      let query = plaudClient
        .from('plaud_recordings')
        .select('*')
        .eq('center_id', centerId);

      query = scope === 'needs_review'
        ? query.eq('status', 'needs_review')
        : query.in('status', RESOLVED_STATUSES);

      query = scope === 'needs_review'
        ? query.order('start_at', { ascending: true })
        : query.order('confirmed_at', { ascending: false, nullsFirst: false });

      const { data, error } = await query;
      if (error) throw error;

      return attachContext((data ?? []) as PlaudRecordingRow[], centerId);
    },
    enabled: !!centerId && (options?.enabled ?? true),
  });
}

/** Cuenta rápida de pendientes, para mostrar un aviso/badge en la navegación. */
export function usePlaudNeedsReviewCount() {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-recordings-count', centerId],
    queryFn: async () => {
      if (!centerId) return 0;
      const { count, error } = await plaudClient
        .from('plaud_recordings')
        .select('id', { count: 'exact', head: true })
        .eq('center_id', centerId)
        .eq('status', 'needs_review');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!centerId,
    staleTime: 60_000,
  });
}

function invalidatePlaudQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['plaud-recordings'] });
  queryClient.invalidateQueries({ queryKey: ['plaud-recordings-count'] });
}

/**
 * Confirma el emparejamiento de una grabación con una sesión y paciente concretos —
 * ya sea la sugerencia del sistema o una elegida a mano en el buscador. Siempre queda
 * registrado como `matched_by: 'manual'` porque pasó por una decisión humana, y guarda
 * quién y cuándo.
 */
export function useConfirmPlaudMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ recordingId, sessionId, patientId }: { recordingId: string; sessionId: string; patientId: string }) => {
      if (!user?.id) throw new Error('No hay usuario autenticado');

      const update: PlaudRecordingUpdate = {
        session_id: sessionId,
        patient_id: patientId,
        matched_by: 'manual',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
        status: 'matched',
      };

      const { error } = await plaudClient
        .from('plaud_recordings')
        .update(update)
        .eq('id', recordingId);
      if (error) throw error;
    },
    onSuccess: () => invalidatePlaudQueries(queryClient),
  });
}

/** Descarta una grabación por no corresponder a contenido clínico (ruido, prueba, etc.). */
export function useDiscardPlaudRecording() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (recordingId: string) => {
      if (!user?.id) throw new Error('No hay usuario autenticado');

      const update: PlaudRecordingUpdate = {
        status: 'ignored',
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      };

      const { error } = await plaudClient
        .from('plaud_recordings')
        .update(update)
        .eq('id', recordingId);
      if (error) throw error;
    },
    onSuccess: () => invalidatePlaudQueries(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Generación de informes de IA sobre una grabación ya emparejada y confirmada
// ---------------------------------------------------------------------------
//
// Último eslabón de la integración: `analyze-session-transcription` ya sabe recibir una
// transcripción diarizada (`segments: DiarizedTurn[]`, ver su cabecera y
// `_shared/transcriptDiarization.ts`) en vez de un texto plano manual, pero nada disparaba
// todavía esa llamada para una grabación Plaud. Lo que sigue es exactamente eso: una acción
// explícita (nunca automática — ver `PlaudGenerateReportsButton.tsx`) que reconstruye los
// turnos a partir de `transcript_text`, llama a la función una vez por capa igual que hace
// `useTranscriptionAnalysis.tsx` para el flujo manual, y dejar la grabación en `processed`.

/**
 * Forma mínima que espera `analyze-session-transcription` en `segments` — copiada aquí en
 * vez de importada porque esa función es Deno y este archivo es del navegador (mismo motivo
 * por el que `src/lib/plaud-segmentation.ts` re-exporta su copia Deno en vez de compartir
 * módulo). Debe mantenerse en sync con `DiarizedTurn` en
 * `supabase/functions/_shared/transcriptDiarization.ts`.
 */
interface PlaudDiarizedTurn {
  speaker: string | null;
  content: string;
}

/**
 * Reconstruye `DiarizedTurn[]` a partir de `plaud_recordings.transcript_text`.
 *
 * La forma exacta de ese texto la fija `buildTranscriptText` en
 * `supabase/functions/sync-plaud-recordings/index.ts`: una línea por segmento, ordenadas por
 * `startTime`, con el formato `[<speaker o "desconocido">] <contenido>`. Así que SÍ conserva
 * la separación por turnos y por hablante — no hace falta degradar a "un único turno sin
 * hablante" (eso solo aplicaría si la ingesta guardara el texto ya aplanado sin esa marca,
 * que no es el caso).
 *
 * "desconocido" es un relleno de la ingesta para un segmento sin `speaker`, no una etiqueta
 * de hablante real — se traduce de vuelta a `null` para que `buildTranscriptFromTurns` lo
 * trate como turno sin identificar en vez de como un hablante más.
 *
 * Si una línea no encaja con el patrón `[..] ..` se trata como continuación del turno
 * anterior (un salto de línea dentro del contenido de un mismo segmento, en vez de un
 * segmento nuevo) para no perder texto — o, a falta de turno anterior, como un turno propio
 * sin hablante.
 */
export function parsePlaudTranscriptText(transcriptText: string): PlaudDiarizedTurn[] {
  const LINE_PATTERN = /^\[([^\]]*)\]\s?(.*)$/;
  const turns: PlaudDiarizedTurn[] = [];

  for (const rawLine of transcriptText.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;

    const match = LINE_PATTERN.exec(rawLine);
    if (match) {
      const label = match[1].trim();
      turns.push({ speaker: label && label !== 'desconocido' ? label : null, content: match[2] });
      continue;
    }

    if (turns.length > 0) {
      turns[turns.length - 1] = {
        ...turns[turns.length - 1],
        content: `${turns[turns.length - 1].content}\n${rawLine}`,
      };
    } else {
      turns.push({ speaker: null, content: rawLine });
    }
  }

  return turns;
}

const GENERATION_CONSENT_PURPOSES: ConsentPurpose[] = ['ai_processing', 'report_generation'];

/**
 * Comprobación proactiva (defensa en profundidad, no la autoridad real — esa es
 * `analyze-session-transcription` en el servidor) de los dos consentimientos que hacen
 * falta para generar informes de IA, para poder explicar el motivo concreto en la bandeja
 * en vez de esperar a que la llamada falle. Solo se activa cuando `enabled` es cierto
 * (grabación ya emparejada, no descartada) y hay `patientId`.
 */
export function usePlaudGenerationConsent(patientId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['plaud-generation-consent', patientId],
    queryFn: async () => {
      const entries = await Promise.all(
        GENERATION_CONSENT_PURPOSES.map(
          async (purpose) => [purpose, await checkPatientConsent(supabase, patientId!, purpose)] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<ConsentPurpose, ConsentCheckResult>;
    },
    enabled: enabled && !!patientId,
    staleTime: 30_000,
  });
}

type PlaudGenerationStage = 'layer1' | 'layer2' | 'layer3';

interface GeneratePlaudReportsInput {
  recording: PlaudRecordingRow;
  /** Para que la bandeja pueda mostrar en qué capa va (ver `PlaudGenerateReportsButton.tsx`). */
  onProgress?: (stage: PlaudGenerationStage) => void;
}

/** Traduce la respuesta de bloqueo por consentimiento de `analyze-session-transcription` al mismo texto que ya usa el resto de la bandeja. */
function buildServerConsentError(data: Record<string, unknown> | null | undefined): Error {
  const purpose: ConsentPurpose = data?.purpose === 'report_generation' ? 'report_generation' : 'ai_processing';
  const reason = typeof data?.reason === 'string' ? (data.reason as ConsentDenialReason) : undefined;
  const message = describePlaudGenerationBlock({ [purpose]: { granted: false, reason } });
  return new Error(message ?? 'No se pueden generar informes: el contacto no ha otorgado el consentimiento necesario.');
}

function buildAnalysisError(data: Record<string, unknown> | null | undefined, fallback: string): Error {
  if (data?.consentDenied) return buildServerConsentError(data);
  const message = typeof data?.error === 'string' ? data.error : fallback;
  return new Error(message);
}

/**
 * Genera los informes de IA (clínico + paciente) de una grabación Plaud ya emparejada y
 * confirmada, y la deja en `processed`.
 *
 * Acción explícita y separada de la confirmación del emparejamiento a propósito: confirmar
 * a qué sesión pertenece un archivo es una decisión sobre datos ya existentes (dónde vive
 * esta grabación); generar informes es la decisión, aparte, de mandar su contenido a un
 * proveedor de IA externo. Fundir ambas en un solo clic haría que aceptar un emparejamiento
 * arrastrara sin querer un envío a IA — justo el tipo de automatismo silencioso que este
 * encargo pide evitar. Ver `PlaudGenerateReportsButton.tsx` para el botón dedicado.
 *
 * Reconstruye `segments` desde `transcript_text` (ver `parsePlaudTranscriptText`) y llama a
 * `analyze-session-transcription` una vez por capa, replicando el mismo patrón que
 * `useTranscriptionAnalysis.tsx` usa para el flujo de audio subido a mano (incluido el modo
 * `single`, si el centro lo tiene activado). El control de consentimiento real ocurre en el
 * servidor en cada llamada — esto no lo repite, solo traduce su respuesta si deniega.
 */
export function useGeneratePlaudReports() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useMutation({
    mutationFn: async ({ recording, onProgress }: GeneratePlaudReportsInput) => {
      if (!centerId) throw new Error('No se pudo determinar el centro del profesional.');
      if (!recording.session_id) throw new Error('Esta grabación no está emparejada con ninguna sesión.');
      if (!recording.transcript_text || !recording.transcript_text.trim()) {
        throw new Error('Esta grabación no tiene transcripción disponible.');
      }

      // Defensa en profundidad — ver punto 5 del encargo. Por construcción
      // (`plaud-matching.ts`), una grabación con sospecha de mezcla solo puede llegar a
      // `matched` pasando por el diálogo de confirmación manual con su casilla extra
      // (`PlaudConfirmMatchDialog`), así que esto no debería dispararse nunca en la
      // práctica — pero si por cualquier vía apareciera aquí sin ese rastro, se bloquea en
      // vez de asumir que está bien.
      if ((recording.contains_multiple_sessions || recording.overlap_flag) && recording.matched_by !== 'manual') {
        throw new Error(
          'Esta grabación tiene sospecha de mezclar más de una sesión o de solaparse con otra, y no consta que haya sido confirmada a mano. Revísala y confírmala explícitamente antes de generar informes.',
        );
      }

      const segments = parsePlaudTranscriptText(recording.transcript_text);
      if (segments.length === 0) {
        throw new Error('No se pudo interpretar la transcripción de esta grabación.');
      }

      const baseBody = {
        centerId,
        sessionId: recording.session_id,
        segments,
        transcriptSource: 'plaud' as const,
        plaudRecordingId: recording.id,
      };

      const invoke = (body: Record<string, unknown>) =>
        supabase.functions.invoke('analyze-session-transcription', { body });

      onProgress?.('layer1');
      const layer1 = await invoke({ ...baseBody, layer: 1 });
      if (layer1.error) throw new Error(layer1.error.message || 'Error al generar la extracción clínica base.');
      const layer1Data = layer1.data as Record<string, unknown> | null;
      if (!layer1Data?.success) throw buildAnalysisError(layer1Data, 'Error al generar la extracción clínica base.');

      let clinical: string | null = null;
      let patient: string | null = null;

      if (layer1Data.mode === 'single') {
        clinical = typeof layer1Data.clinical === 'string' ? layer1Data.clinical : null;
        patient = typeof layer1Data.patient === 'string' ? layer1Data.patient : null;
        if (!clinical) throw new Error('La respuesta del análisis no contenía un informe clínico válido.');
      } else {
        const baseAnalysis = layer1Data.content as string;

        onProgress?.('layer2');
        const layer2 = await invoke({ ...baseBody, layer: 2, baseAnalysis });
        if (layer2.error) throw new Error(layer2.error.message || 'Error al generar el informe clínico.');
        const layer2Data = layer2.data as Record<string, unknown> | null;
        if (!layer2Data?.success) throw buildAnalysisError(layer2Data, 'Error al generar el informe clínico.');
        clinical = layer2Data.content as string;

        onProgress?.('layer3');
        const layer3 = await invoke({ ...baseBody, layer: 3, baseAnalysis });
        if (layer3.error) throw new Error(layer3.error.message || 'Error al generar el informe para el paciente.');
        const layer3Data = layer3.data as Record<string, unknown> | null;
        if (!layer3Data?.success) throw buildAnalysisError(layer3Data, 'Error al generar el informe para el paciente.');
        patient = layer3Data.content as string;
      }

      const { error: sessionUpdateError } = await supabase
        .from('sessions')
        .update({
          notes: clinical,
          ai_summary_clinical: clinical,
          ai_summary_patient: patient,
          transcript_processed_at: new Date().toISOString(),
        })
        .eq('id', recording.session_id);
      if (sessionUpdateError) throw sessionUpdateError;

      const reportUpdate: PlaudRecordingUpdate = {
        report_generated_at: new Date().toISOString(),
        status: 'processed',
      };
      const { error: recordingUpdateError } = await plaudClient
        .from('plaud_recordings')
        .update(reportUpdate)
        .eq('id', recording.id);
      if (recordingUpdateError) throw recordingUpdateError;
    },
    onSuccess: () => invalidatePlaudQueries(queryClient),
  });
}

// ---------------------------------------------------------------------------
// Buscador de sesiones del centro (para "elegir otra sesión")
// ---------------------------------------------------------------------------

export interface PlaudSessionSearchResult {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  patient_id: string;
  patient_first_name: string;
  patient_last_name: string;
}

/**
 * Busca sesiones del centro por nombre de paciente para el selector manual de
 * "elegir otra sesión". Sin texto de búsqueda, muestra las sesiones más recientes primero
 * para que sea fácil localizar una cita cercana a la fecha de la grabación.
 */
export function usePlaudSessionSearch(search: string) {
  const { profile } = useAuth();
  const centerId = profile?.center_id;

  return useQuery({
    queryKey: ['plaud-session-search', centerId, search],
    queryFn: async () => {
      if (!centerId) return [];

      let query = supabase
        .from('sessions')
        .select('id, session_date, start_time, end_time, patient_id, patients!sessions_patient_id_fkey(first_name, last_name)')
        .eq('center_id', centerId)
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(25);

      const trimmed = search.trim();
      if (trimmed) {
        const { data: matchingPatients, error: patientsError } = await supabase
          .from('patients')
          .select('id')
          .eq('center_id', centerId)
          .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`)
          .limit(50);
        if (patientsError) throw patientsError;

        const patientIds = (matchingPatients ?? []).map((p) => p.id);
        if (patientIds.length === 0) return [];
        query = query.in('patient_id', patientIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((s) => ({
        id: s.id,
        session_date: s.session_date,
        start_time: s.start_time,
        end_time: s.end_time,
        patient_id: s.patient_id,
        patient_first_name: s.patients?.first_name ?? '',
        patient_last_name: s.patients?.last_name ?? '',
      })) as PlaudSessionSearchResult[];
    },
    enabled: !!centerId,
  });
}

export function usePlaudReviewStats(recordings: PlaudRecordingWithContext[] | undefined) {
  return useMemo(() => {
    const list = recordings ?? [];
    return {
      total: list.length,
      multiSession: list.filter((r) => r.contains_multiple_sessions).length,
      overlap: list.filter((r) => r.overlap_flag).length,
    };
  }, [recordings]);
}
