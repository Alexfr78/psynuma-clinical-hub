/**
 * Ingesta periódica de grabaciones Plaud (cron). Por cada centro con la
 * integración conectada Y activada (`center_plaud_connections.enabled`):
 *
 *   1. Si `enabled = false`, no se hace absolutamente nada con ese centro —
 *      ni siquiera se pide el listado de archivos. Esta es la salvaguarda
 *      que impide procesar datos sin el contrato con Plaud cerrado. Ver
 *      cabecera de `_shared/plaud.ts` y de la migración
 *      `center_plaud_connections`.
 *   2. Se obtiene un access token válido con `getValidPlaudAccessToken`; si
 *      no hay token utilizable, se registra el motivo (consola, sin datos
 *      sensibles) y se pasa al siguiente centro.
 *   3. Se lista `list_files` y se descartan los archivos que ya existan por
 *      `(center_id, plaud_file_id)` **con transcripción ya guardada**
 *      (`transcript_text IS NOT NULL`) o cuyo presupuesto de reintento de
 *      transcripción ya se haya agotado (ver punto 4.bis). Todo lo demás —
 *      incluidas las filas que llevan ciclos esperando— se procesa de nuevo
 *      este ciclo. Ver `syncCenter`.
 *
 *   FALLO CORREGIDO EN ESTA VERSIÓN (verificado en producción, caso real:
 *   archivo `23e6c306df90cef32cc717e5e8a16f22` del 7-sep-2026): antes, si
 *   Plaud todavía no había transcrito un archivo, la fila se guardaba YA
 *   CLASIFICADA (`matched` o `needs_review`) con `transcript_text` vacío, y
 *   la deduplicación la daba por resuelta para siempre — la ingesta nunca
 *   volvía a mirarla aunque Plaud la transcribiera minutos después. Como la
 *   segmentación intra-archivo (`detectSegmentation`) solo puede detectar
 *   señales a partir del TEXTO de la transcripción, un archivo importado en
 *   vacío jamás podía marcarse `contains_multiple_sessions = true` por mucho
 *   que la transcripción real, llegada después, sí las tuviera. Ahora:
 *
 *   4. Para cada archivo a procesar este ciclo, distingue primero si la fila
 *      existente (si la hay) representa una DECISIÓN HUMANA ya tomada:
 *      `matched_by = 'manual'`, `confirmed_by` con valor, o
 *      `status = 'ignored'`. Si es así, `refreshTranscriptForConfirmedRow`
 *      SOLO actualiza `transcript_text` y recalcula la segmentación cuando
 *      llega texto — nunca toca `session_id`, `patient_id`, `matched_by`,
 *      `confirmed_by`, `confirmed_at`, `status`, `match_confidence`,
 *      `match_reasons`, `overlap_flag` ni `overlap_with_file_id`. Si la
 *      segmentación recalculada detecta sospecha de varias sesiones en una
 *      fila que SÍ está asignada a un paciente (`matched_by = 'manual'`),
 *      levanta `flagged_after_confirmation = true` — la señal visible del
 *      caso de riesgo real: el emparejamiento se hizo antes de saber que el
 *      archivo podía mezclar a dos pacientes. Nunca se deshace en silencio;
 *      ver el informe de entrega para qué falta ajustar en la interfaz para
 *      que esa bandera bloquee también la generación de informes cuando
 *      `matched_by = 'manual'` (hoy `useGeneratePlaudReports` solo bloquea
 *      si `matched_by !== 'manual'`, un supuesto que esta bandera rompe).
 *
 *      Para el resto (fila nueva, `status = 'pending'`/`'error'` previo, o
 *      `needs_review` sin decisión humana todavía), `processFile` ejecuta el
 *      pipeline completo: transcripción → segmentación → emparejamiento.
 *
 *   4.bis. Si la transcripción sigue vacía, `processFile` NO clasifica nada
 *      todavía: guarda `status = 'pending'` (reutiliza un valor del CHECK
 *      que ya existía sin usarse — invisible para la bandeja de revisión y
 *      para el botón de generar informes, que consultan `needs_review` /
 *      `matched`+`processed` respectivamente: exactamente el "nada que
 *      procesar todavía" que pedía el encargo, sin tocar `src/**`) e
 *      incrementa `transcript_attempts`. Solo si se agota el presupuesto de
 *      reintento —`TRANSCRIPT_RETRY_MAX_AGE_DAYS` días desde `created_at` O
 *      `MAX_TRANSCRIPT_RETRY_ATTEMPTS` intentos, lo que llegue antes— se
 *      fuerza `status = 'needs_review'` con una sugerencia calculada SOLO
 *      por metadatos (fecha/duración; `matchRecordingToSession` sin pasarle
 *      `segmentation`, porque nunca se pudo calcular), `match_confidence` a
 *      0 y el código `'transcript_retry_exhausted'` en `match_reasons` —
 *      nunca a `matched` automático, porque no se puede descartar mezcla de
 *      sesiones sin haber podido leer el contenido. `segmentation_unverified
 *      = true` dice explícitamente "no lo sabemos", distinto de
 *      `contains_multiple_sessions = false` ("se comprobó y no hay riesgo").
 *
 *   5. Cuando SÍ hay contenido, se ejecuta la segmentación intra-archivo, se
 *      calculan solapamientos contra otras grabaciones del mismo centro, y
 *      se empareja contra las sesiones candidatas del centro en una ventana
 *      de ±1 día alrededor de `start_at`. Se guarda con `status = 'matched'`
 *      si el emparejamiento fue automático (`requiresReview = false`) o
 *      `'needs_review'` en cualquier otro caso.
 *   6. Se fija `transcript_expires_at` a 30 días desde la obtención.
 *
 * Esta función NO genera informes ni envía nada al paciente — solo clasifica
 * y deja el material preparado para que otro agente construya la generación
 * de informes sobre `plaud_recordings`.
 *
 * REGLA QUE NO SE NEGOCIA: el campo `name` que devuelve `list_files` (título
 * autogenerado del archivo, con contenido clínico en texto libre visto en
 * producción) nunca se lee, nunca se guarda y nunca se escribe en un log.
 * `PlaudListFileEntry` de abajo deliberadamente NO declara ese campo.
 *
 * NO verificado contra el servidor real de Plaud (no había un token válido
 * disponible durante esta construcción — ver notas de entrega): la forma
 * exacta de los argumentos de paginación de `list_files` (se asume
 * `{ page, page_size }`, 1-indexado) y el nombre del argumento de cursor de
 * `get_transcript` (se asume `cursor`, simétrico con `next_cursor` en la
 * respuesta). `callPlaudTool` nunca lanza, así que un fallo aquí se traduce
 * en quedarse en `status: 'pending'` (o forzar `needs_review` si se agota el
 * presupuesto de reintento) por archivo, o en saltarse el centro, nunca en
 * un crash del batch completo.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callPlaudTool, getValidPlaudAccessToken } from "../_shared/plaud.ts";
import {
  detectOverlaps,
  detectSegmentation,
  type ContiguityPair,
  type OverlapPair,
  type PlaudRecordingMeta,
  type TranscriptSegment,
} from "../_shared/plaud-segmentation.ts";
import { matchRecordingToSession, type CandidateSession } from "../_shared/plaud-matching.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// ---------------------------------------------------------------------------
// Constantes — cada una documentada porque alguien tendrá que defenderla.
// ---------------------------------------------------------------------------

/** Tamaño de página al listar archivos. No confirmado contra el servidor real. */
const LIST_PAGE_SIZE = 100;
/** Tope defensivo de páginas al listar, para que un bug de paginación nunca deje el cron en bucle infinito. */
const MAX_LIST_PAGES = 50;
/** Tope defensivo de páginas al paginar una transcripción por cursor. */
const MAX_TRANSCRIPT_PAGES = 200;
/** Ventana (días) a cada lado de `start_at` para buscar sesiones candidatas del centro. */
const CANDIDATE_WINDOW_DAYS = 1;
/** Ventana (días) a cada lado del lote nuevo para traer grabaciones existentes y poder detectar solapamiento/contigüidad. */
const OVERLAP_WINDOW_DAYS = 1;
/** Retención de `transcript_text`: se vacía a los 30 días vía `cleanup-plaud-transcripts`. */
const TRANSCRIPT_RETENTION_DAYS = 30;

/**
 * Días desde `created_at` (fecha en que se importó el archivo, no cuando se pidió por última
 * vez la transcripción) tras los cuales se deja de reintentar la transcripción y se fuerza la
 * fila a revisión humana si nunca llegó texto. Es el criterio PRINCIPAL de corte, no el número
 * de intentos: lo que importa clínicamente es cuánto tiempo lleva esperando, no cuántos ciclos
 * de 15 min han pasado. 3 días da margen amplio sobre el caso normal (Plaud transcribe en
 * minutos u horas) y también sobre el caso "el usuario tiene que pedirlo a mano en la app de
 * Plaud" (tiempo de sobra para que se acuerde en un par de días laborables), sin dejar un
 * archivo en limbo indefinidamente si la transcripción nunca va a llegar (grabación borrada en
 * Plaud, fallo del dispositivo, etc.) — pasado ese plazo es más útil que una persona lo vea y
 * decida, que seguir preguntando a una API que nunca va a responder con contenido.
 */
const TRANSCRIPT_RETRY_MAX_AGE_DAYS = 3;
const TRANSCRIPT_RETRY_MAX_AGE_MS = TRANSCRIPT_RETRY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Tope de intentos, puramente defensivo (red de seguridad, no el criterio real de negocio —
 * ese es `TRANSCRIPT_RETRY_MAX_AGE_DAYS`). Con la cadencia actual del cron (cada 15 min, ver
 * `20260906090100_schedule_plaud_sync_and_cleanup.sql`) 3 días equivalen a ~288 intentos; 400
 * dan margen sin ser efectivamente infinito, para que un cambio futuro de cadencia (p. ej. cron
 * cada minuto) no multiplique las llamadas a la API de Plaud sin límite mientras el criterio de
 * antigüedad termina de cumplirse.
 */
const MAX_TRANSCRIPT_RETRY_ATTEMPTS = 400;

// ---------------------------------------------------------------------------
// Tipos de las respuestas de Plaud usadas aquí (subconjunto deliberado).
// ---------------------------------------------------------------------------

interface PlaudListFileEntry {
  id: string;
  start_at: string; // ISO 8601 — instante real de la sesión (NO created_at, que es la fecha de sincronización).
  duration: number; // ms
  serial_number?: string | null;
  // NOTA DE SEGURIDAD: la API también devuelve `name` (título autogenerado
  // con contenido clínico en texto libre, ver cabecera del archivo). A
  // propósito NO se declara aquí para que sea imposible leerlo o guardarlo
  // por error, ni siquiera accidentalmente en un log de depuración.
}

interface PlaudListFilesResponse {
  data: PlaudListFileEntry[];
  page?: number;
  page_size?: number;
}

interface PlaudTranscriptSegmentRaw {
  start_time: number;
  end_time: number;
  content: string;
  speaker?: string | null;
  original_speaker?: string | null;
}

interface PlaudTranscriptPage {
  file_id?: string;
  block?: string;
  total?: number;
  offset?: number;
  limit?: number;
  returned?: number;
  next_cursor?: string | null;
  segments?: PlaudTranscriptSegmentRaw[];
}

/**
 * Subconjunto de `plaud_recordings` que necesita `syncCenter` para decidir cómo tratar una
 * fila que ya existía antes de este ciclo: si representa una decisión humana (ver
 * `isHumanDecision` más abajo) y cuánto presupuesto de reintento de transcripción le queda.
 */
interface ExistingPlaudRow {
  plaud_file_id: string;
  status: string;
  transcript_text: string | null;
  transcript_attempts: number | null;
  matched_by: string | null;
  confirmed_by: string | null;
  flagged_after_confirmation: boolean | null;
  created_at: string;
}

/**
 * Una fila representa una decisión humana ya tomada cuando alguien confirmó el emparejamiento
 * a mano o descartó la grabación — exactamente la definición del punto 3 del encargo. Estas
 * filas nunca deben ver tocado su emparejamiento o estado por la ingesta automática; ver
 * `refreshTranscriptForConfirmedRow`.
 */
function isHumanDecision(row: ExistingPlaudRow): boolean {
  return row.matched_by === "manual" || row.confirmed_by !== null || row.status === "ignored";
}

/** true si ya se agotó el presupuesto de reintento de transcripción para esta fila. */
function isRetryExhausted(row: ExistingPlaudRow): boolean {
  const attempts = row.transcript_attempts ?? 0;
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  return attempts >= MAX_TRANSCRIPT_RETRY_ATTEMPTS || ageMs >= TRANSCRIPT_RETRY_MAX_AGE_MS;
}

// ---------------------------------------------------------------------------
// Conversión de hora local (Europe/Madrid) de las citas agendadas a UTC.
//
// `sessions.session_date` es una fecha y `sessions.start_time`/`end_time` son
// columnas TIME sin zona horaria: se interpretan como hora local del centro
// (ver `_shared/special-days-adapter.ts::APP_TZ` y el comentario de
// `RawSession` en `_shared/paymentRules.ts`). Esta función usa exactamente el
// mismo algoritmo que `buildSessionDateTime` en `_shared/paymentRules.ts`
// (deliberadamente reimplementado aquí en vez de importado, para no tocar un
// módulo que pertenece a otro flujo de trabajo) para poder comparar contra
// `start_at` de Plaud, que sí viene en UTC.
// ---------------------------------------------------------------------------

const SESSIONS_TZ = "Europe/Madrid";

function madridWallClockToUtcIso(dateStr: string, timeStr: string): string | null {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute, second = 0] = timeStr.split(":").map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SESSIONS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const madridAtGuessAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  const utcMs = utcGuess - (madridAtGuessAsUtc - utcGuess);
  return Number.isNaN(utcMs) ? null : new Date(utcMs).toISOString();
}

/** Fecha (YYYY-MM-DD) en Europe/Madrid correspondiente a un instante UTC. */
function formatMadridDate(isoUtc: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SESSIONS_TZ }).format(new Date(isoUtc));
}

/** Desplaza una fecha YYYY-MM-DD en `deltaDays` días (aritmética de calendario, sin TZ). */
function shiftDateStr(dateStr: string, deltaDays: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** Diferencia en minutos entre dos columnas TIME ("HH:MM" o "HH:MM:SS"). */
function diffMinutes(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = toMinutes(endTime) - toMinutes(startTime);
  return diff >= 0 ? diff : diff + 24 * 60;
}

// ---------------------------------------------------------------------------
// Listado de archivos (paginado).
// ---------------------------------------------------------------------------

async function listAllPlaudFiles(
  accessToken: string,
): Promise<{ ok: true; files: PlaudListFileEntry[] } | { ok: false; error: string }> {
  const files: PlaudListFileEntry[] = [];
  for (let page = 1; page <= MAX_LIST_PAGES; page++) {
    const result = await callPlaudTool<PlaudListFilesResponse>(accessToken, "list_files", {
      page,
      page_size: LIST_PAGE_SIZE,
    });
    if (!result.ok) return { ok: false, error: result.error };
    const pageData = Array.isArray(result.data?.data) ? result.data.data : [];
    files.push(...pageData);
    if (pageData.length < LIST_PAGE_SIZE) break;
  }
  return { ok: true, files };
}

// ---------------------------------------------------------------------------
// Transcripción (paginada por cursor, con fallback de bloque).
// ---------------------------------------------------------------------------

async function fetchTranscriptBlock(
  accessToken: string,
  fileId: string,
  block: string,
): Promise<{ ok: true; segments: TranscriptSegment[] } | { ok: false; error: string }> {
  const collected: TranscriptSegment[] = [];
  let cursor: string | null = null;

  for (let i = 0; i < MAX_TRANSCRIPT_PAGES; i++) {
    const args: Record<string, unknown> = { file_id: fileId, block };
    if (cursor) args.cursor = cursor;

    const result = await callPlaudTool<PlaudTranscriptPage>(accessToken, "get_transcript", args);
    if (!result.ok) return { ok: false, error: result.error };

    const raw = Array.isArray(result.data?.segments) ? result.data.segments : [];
    for (const seg of raw) {
      collected.push({
        startTime: seg.start_time,
        endTime: seg.end_time,
        speaker: seg.speaker ?? seg.original_speaker ?? null,
        content: seg.content,
      });
    }

    const nextCursor = result.data?.next_cursor ?? null;
    const returned = result.data?.returned ?? raw.length;
    if (!nextCursor || returned === 0) break;
    cursor = nextCursor;
  }

  return { ok: true, segments: collected };
}

/**
 * Trae la transcripción completa de un archivo: `transaction_polish` primero,
 * cayendo a `transaction` si el primer bloque viene vacío O falla. Solo
 * devuelve `error` si AMBOS intentos fallan de verdad (no solo "sin
 * contenido") — un archivo con transcripción legítimamente vacía (silencio)
 * es un resultado válido, no un error.
 */
async function fetchFullTranscript(
  accessToken: string,
  fileId: string,
): Promise<{ segments: TranscriptSegment[] } | { error: string }> {
  const polished = await fetchTranscriptBlock(accessToken, fileId, "transaction_polish");
  if (polished.ok && polished.segments.length > 0) {
    return { segments: polished.segments };
  }

  const fallback = await fetchTranscriptBlock(accessToken, fileId, "transaction");
  if (fallback.ok) {
    return { segments: fallback.segments };
  }

  const polishedReason = polished.ok ? "empty" : polished.error;
  return { error: `transaction_polish=${polishedReason}; transaction=${fallback.error}` };
}

/** Texto plano de la transcripción para que otro agente lo use como materia prima del informe. */
function buildTranscriptText(segments: TranscriptSegment[]): string {
  return segments
    .slice()
    .sort((a, b) => a.startTime - b.startTime)
    .map((s) => `[${s.speaker ?? "desconocido"}] ${s.content}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sesiones candidatas para el emparejamiento (compartido por el pipeline
// completo y por la vía de "presupuesto de transcripción agotado").
// ---------------------------------------------------------------------------

async function fetchCandidateSessions(
  supabase: SupabaseClient,
  centerId: string,
  recordingMeta: PlaudRecordingMeta,
): Promise<CandidateSession[]> {
  const madridDate = formatMadridDate(recordingMeta.startAt);
  const dateFrom = shiftDateStr(madridDate, -CANDIDATE_WINDOW_DAYS);
  const dateTo = shiftDateStr(madridDate, CANDIDATE_WINDOW_DAYS);

  const { data: sessionRows, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, patient_id, session_date, start_time, end_time, status")
    .eq("center_id", centerId)
    .gte("session_date", dateFrom)
    .lte("session_date", dateTo)
    .not("status", "in", '("cancelled","no_show")');

  if (sessionsError) {
    console.error(`[sync-plaud-recordings] Failed to fetch candidate sessions (center ${centerId}):`, sessionsError.message);
  }

  return (sessionRows ?? [])
    .map((s): CandidateSession | null => {
      const startAt = madridWallClockToUtcIso(s.session_date, s.start_time);
      if (!startAt) return null;
      return {
        sessionId: s.id,
        patientId: s.patient_id,
        startAt,
        durationMin: diffMinutes(s.start_time, s.end_time),
      };
    })
    .filter((c): c is CandidateSession => c !== null);
}

// ---------------------------------------------------------------------------
// Procesamiento de un archivo sin decisión humana previa (nuevo, o en
// `pending`/`error`/`needs_review` sin que nadie lo haya confirmado o
// descartado a mano todavía).
// ---------------------------------------------------------------------------

interface OverlapContext {
  overlaps: OverlapPair[];
  contiguities: ContiguityPair[];
}

async function processFile(
  supabase: SupabaseClient,
  centerId: string,
  accessToken: string,
  file: PlaudListFileEntry,
  overlapContext: OverlapContext,
  existingRow: ExistingPlaudRow | null,
): Promise<"finalized" | "pending" | "error"> {
  const recordingMeta: PlaudRecordingMeta = {
    fileId: file.id,
    startAt: file.start_at,
    durationMs: file.duration,
    serialNumber: file.serial_number ?? "",
  };

  const fileOverlaps = overlapContext.overlaps.filter((p) => p.fileIdA === file.id || p.fileIdB === file.id);
  const fileContiguities = overlapContext.contiguities.filter((p) => p.fileIdA === file.id || p.fileIdB === file.id);
  const overlapFlag = fileOverlaps.length > 0;
  const overlapWithFileId = overlapFlag
    ? (fileOverlaps[0].fileIdA === file.id ? fileOverlaps[0].fileIdB : fileOverlaps[0].fileIdA)
    : null;

  const baseRow = {
    center_id: centerId,
    plaud_file_id: file.id,
    start_at: recordingMeta.startAt,
    duration_ms: recordingMeta.durationMs,
    serial_number: recordingMeta.serialNumber || null,
    overlap_flag: overlapFlag,
    overlap_with_file_id: overlapWithFileId,
  };

  const transcriptResult = await fetchFullTranscript(accessToken, file.id);
  const fetchErrorText = "error" in transcriptResult ? transcriptResult.error : null;
  const segments = "segments" in transcriptResult ? transcriptResult.segments : [];

  const priorAttempts = existingRow?.transcript_attempts ?? 0;
  const attempts = priorAttempts + 1;
  const firstSeenAt = existingRow ? new Date(existingRow.created_at) : new Date();
  const ageMs = Date.now() - firstSeenAt.getTime();

  if (segments.length === 0) {
    // Todavía sin transcripción utilizable — no es necesariamente un error (ver
    // `fetchFullTranscript`): puede ser, sencillamente, que Plaud no la haya terminado
    // todavía. Nunca se clasifica a partir de una transcripción vacía (ver cabecera del
    // archivo): se guarda como `pending` y se reintentará en el próximo ciclo, salvo que se
    // haya agotado el presupuesto de reintento.
    const exhausted = attempts >= MAX_TRANSCRIPT_RETRY_ATTEMPTS || ageMs >= TRANSCRIPT_RETRY_MAX_AGE_MS;
    const lastError = fetchErrorText ? `transcript_fetch_failed: ${fetchErrorText}`.slice(0, 500) : null;

    if (!exhausted) {
      const row = {
        ...baseRow,
        status: "pending",
        segmentation_unverified: true,
        transcript_attempts: attempts,
        last_error: lastError,
      };
      const { error } = await supabase.from("plaud_recordings").upsert(row, { onConflict: "center_id,plaud_file_id" });
      if (error) {
        console.error(`[sync-plaud-recordings] Failed to persist pending row (center ${centerId}):`, error.message);
        return "error";
      }
      return "pending";
    }

    // Presupuesto agotado y la transcripción nunca llegó: se fuerza a revisión humana en vez
    // de dejarla en `pending` para siempre. La sugerencia se calcula SOLO por metadatos
    // (fecha/duración de la cita) — deliberadamente NO se pasa `segmentation` a
    // `matchRecordingToSession` porque nunca se pudo calcular, así que nunca se le puede dar
    // a esta fila el status `matched` automático: no se puede descartar que el archivo mezcle
    // el contenido de dos pacientes sin haber podido leer una sola palabra de su contenido.
    const candidates = await fetchCandidateSessions(supabase, centerId, recordingMeta);
    const matchResult = matchRecordingToSession(recordingMeta, candidates, {
      overlaps: fileOverlaps,
      contiguities: fileContiguities,
    });

    // `status` se fuerza a `needs_review` incondicionalmente (nunca se lee
    // `matchResult.requiresReview` aquí) y `match_confidence` se anula a 0 aunque el score
    // temporal fuera perfecto — por eso se descarta también el código `matched_auto` de las
    // razones, para no dejar una etiqueta que sugiera un auto-match que nunca ocurrió.
    const row = {
      ...baseRow,
      status: "needs_review",
      contains_multiple_sessions: false,
      segmentation_score: null,
      segmentation_signals: null,
      segment_boundaries: null,
      segmentation_unverified: true,
      session_id: matchResult.sessionId,
      patient_id: matchResult.patientId,
      match_confidence: 0,
      match_reasons: [...matchResult.reasons.filter((r) => r !== "matched_auto"), "transcript_retry_exhausted"],
      matched_by: null,
      transcript_attempts: attempts,
      transcript_retry_gave_up_at: new Date().toISOString(),
      last_error: lastError,
    };
    const { error } = await supabase.from("plaud_recordings").upsert(row, { onConflict: "center_id,plaud_file_id" });
    if (error) {
      console.error(`[sync-plaud-recordings] Failed to persist exhausted-retry row (center ${centerId}):`, error.message);
      return "error";
    }
    return "finalized";
  }

  // Hay transcripción de verdad: pipeline completo (segmentación + emparejamiento), igual que
  // si el archivo se hubiera transcrito a tiempo en el primer intento.
  const segmentation = detectSegmentation(recordingMeta, segments);
  const candidates = await fetchCandidateSessions(supabase, centerId, recordingMeta);

  const matchResult = matchRecordingToSession(recordingMeta, candidates, {
    segmentation,
    overlaps: fileOverlaps,
    contiguities: fileContiguities,
  });

  const status = matchResult.requiresReview ? "needs_review" : "matched";
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const row = {
    ...baseRow,
    status,
    contains_multiple_sessions: segmentation.containsMultipleSessions,
    segmentation_score: segmentation.score,
    segmentation_signals: segmentation.signals,
    segment_boundaries: segmentation.boundaries,
    segmentation_unverified: false,
    session_id: matchResult.sessionId,
    patient_id: matchResult.patientId,
    match_confidence: matchResult.confidence,
    match_reasons: matchResult.reasons,
    matched_by: status === "matched" ? "auto" : null,
    transcript_text: buildTranscriptText(segments),
    transcript_fetched_at: fetchedAt.toISOString(),
    transcript_expires_at: expiresAt.toISOString(),
    transcript_attempts: attempts,
    last_error: null,
  };

  const { error: upsertError } = await supabase
    .from("plaud_recordings")
    .upsert(row, { onConflict: "center_id,plaud_file_id" });

  if (upsertError) {
    console.error(`[sync-plaud-recordings] Failed to persist recording (center ${centerId}):`, upsertError.message);
    return "error";
  }
  return "finalized";
}

// ---------------------------------------------------------------------------
// Refresco de transcripción para una fila con decisión humana ya tomada.
// ---------------------------------------------------------------------------

/**
 * Actualiza SOLO la transcripción y la segmentación recalculada de una fila que ya tiene una
 * decisión humana detrás (`isHumanDecision`). Nunca toca `session_id`, `patient_id`,
 * `matched_by`, `confirmed_by`, `confirmed_at`, `status`, `match_confidence`,
 * `match_reasons`, `overlap_flag` ni `overlap_with_file_id` — punto 3 del encargo ("no pises
 * nunca una decisión humana"). Si la segmentación recalculada detecta sospecha de varias
 * sesiones en una fila que SÍ está asignada a un paciente (`matched_by === 'manual'`), levanta
 * `flagged_after_confirmation` — el caso de riesgo señalado explícitamente en el encargo (el
 * emparejamiento se confirmó antes de saber que el archivo podía mezclar a dos pacientes).
 * Nunca se pone a `false` automáticamente una vez levantada: advertencia duradera hasta que
 * alguien la revise (ver informe de entrega para qué falta en la interfaz).
 */
async function refreshTranscriptForConfirmedRow(
  supabase: SupabaseClient,
  centerId: string,
  accessToken: string,
  file: PlaudListFileEntry,
  existingRow: ExistingPlaudRow,
): Promise<"updated" | "flagged" | "still_pending" | "error"> {
  const recordingMeta: PlaudRecordingMeta = {
    fileId: file.id,
    startAt: file.start_at,
    durationMs: file.duration,
    serialNumber: file.serial_number ?? "",
  };

  const transcriptResult = await fetchFullTranscript(accessToken, file.id);
  const fetchErrorText = "error" in transcriptResult ? transcriptResult.error : null;
  const segments = "segments" in transcriptResult ? transcriptResult.segments : [];
  const attempts = (existingRow.transcript_attempts ?? 0) + 1;

  if (segments.length === 0) {
    const update = {
      transcript_attempts: attempts,
      last_error: fetchErrorText ? `transcript_fetch_failed: ${fetchErrorText}`.slice(0, 500) : null,
    };
    const { error } = await supabase
      .from("plaud_recordings")
      .update(update)
      .eq("center_id", centerId)
      .eq("plaud_file_id", file.id);
    if (error) {
      console.error(`[sync-plaud-recordings] Failed to bump attempts on confirmed row (center ${centerId}):`, error.message);
      return "error";
    }
    return "still_pending";
  }

  const segmentation = detectSegmentation(recordingMeta, segments);
  const isNewlyRisky = segmentation.containsMultipleSessions && existingRow.matched_by === "manual";
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + TRANSCRIPT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const update = {
    contains_multiple_sessions: segmentation.containsMultipleSessions,
    segmentation_score: segmentation.score,
    segmentation_signals: segmentation.signals,
    segment_boundaries: segmentation.boundaries,
    segmentation_unverified: false,
    flagged_after_confirmation: existingRow.flagged_after_confirmation === true || isNewlyRisky,
    transcript_text: buildTranscriptText(segments),
    transcript_fetched_at: fetchedAt.toISOString(),
    transcript_expires_at: expiresAt.toISOString(),
    transcript_attempts: attempts,
    last_error: null,
  };

  const { error } = await supabase
    .from("plaud_recordings")
    .update(update)
    .eq("center_id", centerId)
    .eq("plaud_file_id", file.id);

  if (error) {
    console.error(`[sync-plaud-recordings] Failed to refresh transcript on confirmed row (center ${centerId}):`, error.message);
    return "error";
  }
  return isNewlyRisky ? "flagged" : "updated";
}

// ---------------------------------------------------------------------------
// Sincronización de un centro.
// ---------------------------------------------------------------------------

interface CenterSyncSummary {
  listed: number;
  /** Archivos que entran al pipeline este ciclo: nuevos + reintentos de transcripción pendiente. */
  toProcess: number;
  /** Terminaron en `matched`/`needs_review` este ciclo (clasificación fresca o revisión forzada por presupuesto agotado). */
  finalized: number;
  /** Siguen sin transcripción, dentro de presupuesto — se reintentarán el próximo ciclo. */
  stillPending: number;
  /** Filas con decisión humana previa cuya transcripción llegó y se actualizó (sin tocar el emparejamiento). */
  confirmedRefreshed: number;
  /** Subconjunto de `confirmedRefreshed` en el que se detectó sospecha de varias sesiones DESPUÉS de una confirmación manual — el caso de riesgo del punto 3 del encargo. */
  confirmedFlagged: number;
  errors: number;
}

async function syncCenter(supabase: SupabaseClient, centerId: string, accessToken: string): Promise<CenterSyncSummary> {
  const summary: CenterSyncSummary = {
    listed: 0,
    toProcess: 0,
    finalized: 0,
    stillPending: 0,
    confirmedRefreshed: 0,
    confirmedFlagged: 0,
    errors: 0,
  };

  const listResult = await listAllPlaudFiles(accessToken);
  if (!listResult.ok) {
    console.error(`[sync-plaud-recordings] list_files failed (center ${centerId}): ${listResult.error}`);
    return summary;
  }

  const files = listResult.files;
  summary.listed = files.length;
  if (files.length === 0) return summary;

  const fileIds = files.map((f) => f.id);
  const { data: existing, error: existingError } = await supabase
    .from("plaud_recordings")
    .select("plaud_file_id, status, transcript_text, transcript_attempts, matched_by, confirmed_by, flagged_after_confirmation, created_at")
    .eq("center_id", centerId)
    .in("plaud_file_id", fileIds);

  if (existingError) {
    console.error(`[sync-plaud-recordings] Failed to check existing recordings (center ${centerId}):`, existingError.message);
    return summary;
  }

  const existingRows = (existing ?? []) as ExistingPlaudRow[];
  const existingByFileId = new Map(existingRows.map((r) => [r.plaud_file_id, r]));

  // Una fila se da por resuelta (se excluye de este ciclo) cuando YA tiene transcripción
  // guardada — nada que traer de nuevo — o cuando se agotó su presupuesto de reintento (ver
  // `isRetryExhausted`). Todo lo demás entra al pipeline: archivos nunca vistos, filas en
  // `pending`/`error` esperando transcripción, y filas `needs_review` sin decisión humana
  // todavía cuyo texto pueda haber llegado mientras tanto.
  const finalizedIds = new Set(
    existingRows.filter((r) => r.transcript_text !== null || isRetryExhausted(r)).map((r) => r.plaud_file_id),
  );
  const filesToProcess = files.filter((f) => !finalizedIds.has(f.id));
  summary.toProcess = filesToProcess.length;
  if (filesToProcess.length === 0) return summary;

  const newMetas: PlaudRecordingMeta[] = filesToProcess.map((f) => ({
    fileId: f.id,
    startAt: f.start_at,
    durationMs: f.duration,
    serialNumber: f.serial_number ?? "",
  }));

  let existingMetas: PlaudRecordingMeta[] = [];
  const validStarts = newMetas.map((m) => new Date(m.startAt).getTime()).filter((n) => !Number.isNaN(n));
  if (validStarts.length > 0) {
    const windowStartMs = Math.min(...validStarts) - OVERLAP_WINDOW_DAYS * 86_400_000;
    const windowEndMs = Math.max(...validStarts) + OVERLAP_WINDOW_DAYS * 86_400_000;
    const { data: nearby, error: nearbyError } = await supabase
      .from("plaud_recordings")
      .select("plaud_file_id, start_at, duration_ms, serial_number")
      .eq("center_id", centerId)
      .gte("start_at", new Date(windowStartMs).toISOString())
      .lte("start_at", new Date(windowEndMs).toISOString());

    if (nearbyError) {
      console.error(`[sync-plaud-recordings] Failed to fetch nearby recordings (center ${centerId}):`, nearbyError.message);
    } else {
      existingMetas = (nearby ?? []).map((r) => ({
        fileId: r.plaud_file_id,
        startAt: r.start_at,
        durationMs: Number(r.duration_ms),
        serialNumber: r.serial_number ?? "",
      }));
    }
  }

  // Un único cálculo de solapamiento/contigüidad sobre el lote a procesar + lo ya guardado
  // cerca en el tiempo; cada archivo se queda solo con los pares que lo involucran (ver
  // `processFile`). Las filas con decisión humana no usan este contexto (no se les recalcula
  // el solapamiento, ver `refreshTranscriptForConfirmedRow`), pero incluirlas aquí no hace daño.
  const { overlaps, contiguities } = detectOverlaps([...newMetas, ...existingMetas]);

  for (const file of filesToProcess) {
    const existingRow = existingByFileId.get(file.id) ?? null;
    try {
      if (existingRow && isHumanDecision(existingRow)) {
        // Punto 3 del encargo: ya hay una decisión humana detrás de esta fila (confirmada a
        // mano o descartada). Solo se actualiza la transcripción y la segmentación si llega
        // texto — nunca el emparejamiento ni el estado.
        const outcome = await refreshTranscriptForConfirmedRow(supabase, centerId, accessToken, file, existingRow);
        if (outcome === "flagged") {
          summary.confirmedRefreshed++;
          summary.confirmedFlagged++;
        } else if (outcome === "updated") {
          summary.confirmedRefreshed++;
        } else if (outcome === "still_pending") {
          summary.stillPending++;
        } else {
          summary.errors++;
        }
      } else {
        const outcome = await processFile(supabase, centerId, accessToken, file, { overlaps, contiguities }, existingRow);
        if (outcome === "finalized") summary.finalized++;
        else if (outcome === "pending") summary.stillPending++;
        else summary.errors++;
      }
    } catch (error) {
      summary.errors++;
      console.error(
        `[sync-plaud-recordings] Unexpected error processing a file (center ${centerId}):`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const expectedSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (!expectedSecret) {
    console.error("[sync-plaud-recordings] CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Function not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: connections, error: connectionsError } = await supabase
    .from("center_plaud_connections")
    .select("center_id, enabled");

  if (connectionsError) {
    console.error("[sync-plaud-recordings] Failed to fetch connections:", connectionsError.message);
    return new Response(JSON.stringify({ error: "Failed to fetch connections" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const totals = {
    centersConsidered: 0,
    centersDisabled: 0,
    centersSkippedNoToken: 0,
    centersSynced: 0,
    filesListed: 0,
    filesToProcess: 0,
    filesFinalized: 0,
    filesStillPending: 0,
    confirmedRowsRefreshed: 0,
    confirmedRowsFlagged: 0,
    fileErrors: 0,
  };

  for (const connection of connections ?? []) {
    totals.centersConsidered++;

    // Salvaguarda no negociable: enabled=false => cero llamadas a Plaud para
    // este centro, ni siquiera el listado. No la bypasses nunca.
    if (!connection.enabled) {
      totals.centersDisabled++;
      continue;
    }

    const tokenResult = await getValidPlaudAccessToken(supabase, connection.center_id);
    if (!tokenResult.accessToken) {
      totals.centersSkippedNoToken++;
      console.log(`[sync-plaud-recordings] Skipping center ${connection.center_id}: ${tokenResult.reason}`);
      continue;
    }

    const summary = await syncCenter(supabase, connection.center_id, tokenResult.accessToken);
    totals.centersSynced++;
    totals.filesListed += summary.listed;
    totals.filesToProcess += summary.toProcess;
    totals.filesFinalized += summary.finalized;
    totals.filesStillPending += summary.stillPending;
    totals.confirmedRowsRefreshed += summary.confirmedRefreshed;
    totals.confirmedRowsFlagged += summary.confirmedFlagged;
    totals.fileErrors += summary.errors;

    // `confirmedRowsFlagged` > 0 es el caso de riesgo del punto 3 del encargo: una grabación
    // ya confirmada a mano en la que la transcripción, llegada después, reveló sospecha de
    // varias sesiones. Se registra explícitamente en el log del cron (sin datos sensibles,
    // solo el conteo) porque hoy es la única señal fuera de la propia fila — ver el informe de
    // entrega sobre el aviso pendiente en la interfaz.
    if (summary.confirmedFlagged > 0) {
      console.warn(
        `[sync-plaud-recordings] ${summary.confirmedFlagged} grabación(es) confirmada(s) a mano en el centro ${connection.center_id} señalada(s) con flagged_after_confirmation tras recibir su transcripción — requieren revisión humana.`,
      );
    }
  }

  console.log("[sync-plaud-recordings] Done.", totals);

  return new Response(JSON.stringify(totals), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
