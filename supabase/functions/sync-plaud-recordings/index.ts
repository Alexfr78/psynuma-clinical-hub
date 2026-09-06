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
 *      `(center_id, plaud_file_id)` — salvo que la fila existente tenga
 *      `status = 'error'`, en cuyo caso se reintenta (ver `syncCenter`).
 *   4. Para cada archivo nuevo: se trae la transcripción completa (pagina
 *      hasta el final por cursor, probando `transaction_polish` y cayendo a
 *      `transaction` si viene vacío o falla), se ejecuta la segmentación
 *      intra-archivo, se calculan solapamientos contra otras grabaciones del
 *      mismo centro, y se empareja contra las sesiones candidatas del centro
 *      en una ventana de ±1 día alrededor de `start_at`.
 *   5. Se guarda el resultado con `status = 'matched'` si el emparejamiento
 *      fue automático (`requiresReview = false`) o `'needs_review'` en
 *      cualquier otro caso — incluida la ausencia total de sesiones ese día.
 *      Un fallo real al traer la transcripción (no solo "vacía", sino un
 *      error del servidor) se guarda como `status = 'error'` sin intentar
 *      emparejar, para que el próximo cron lo reintente.
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
 * en `status: 'error'` por archivo o en saltarse el centro, nunca en un
 * crash del batch completo.
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
// Procesamiento de un archivo nuevo.
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
): Promise<"inserted" | "error"> {
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

  if ("error" in transcriptResult) {
    // Fallo real de la API, no una transcripción vacía: se guarda como
    // `error` y se deja sin emparejar. Como el dedupe de `syncCenter` solo
    // excluye filas que NO están en `error`, el próximo cron reintentará
    // este mismo archivo automáticamente.
    const row = {
      ...baseRow,
      status: "error",
      last_error: `transcript_fetch_failed: ${transcriptResult.error}`.slice(0, 500),
    };
    const { error } = await supabase.from("plaud_recordings").upsert(row, { onConflict: "center_id,plaud_file_id" });
    if (error) {
      console.error(`[sync-plaud-recordings] Failed to persist error row (center ${centerId}):`, error.message);
    }
    return "error";
  }

  const segments = transcriptResult.segments;
  const segmentation = detectSegmentation(recordingMeta, segments);

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

  const candidates: CandidateSession[] = (sessionRows ?? [])
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
    session_id: matchResult.sessionId,
    patient_id: matchResult.patientId,
    match_confidence: matchResult.confidence,
    match_reasons: matchResult.reasons,
    matched_by: status === "matched" ? "auto" : null,
    transcript_text: segments.length > 0 ? buildTranscriptText(segments) : null,
    transcript_fetched_at: fetchedAt.toISOString(),
    transcript_expires_at: expiresAt.toISOString(),
    last_error: null,
  };

  const { error: upsertError } = await supabase
    .from("plaud_recordings")
    .upsert(row, { onConflict: "center_id,plaud_file_id" });

  if (upsertError) {
    console.error(`[sync-plaud-recordings] Failed to persist recording (center ${centerId}):`, upsertError.message);
    return "error";
  }
  return "inserted";
}

// ---------------------------------------------------------------------------
// Sincronización de un centro.
// ---------------------------------------------------------------------------

interface CenterSyncSummary {
  listed: number;
  new: number;
  inserted: number;
  errors: number;
}

async function syncCenter(supabase: SupabaseClient, centerId: string, accessToken: string): Promise<CenterSyncSummary> {
  const summary: CenterSyncSummary = { listed: 0, new: 0, inserted: 0, errors: 0 };

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
    .select("plaud_file_id, status")
    .eq("center_id", centerId)
    .in("plaud_file_id", fileIds);

  if (existingError) {
    console.error(`[sync-plaud-recordings] Failed to check existing recordings (center ${centerId}):`, existingError.message);
    return summary;
  }

  // Los archivos ya clasificados (cualquier estado salvo `error`) se
  // descartan aquí — esto es la deduplicación por (center_id, plaud_file_id)
  // del paso 3. Las filas en `error` SÍ se reintentan: se tratan como
  // "todavía no procesadas" y `processFile` hace upsert sobre ellas.
  const finalizedIds = new Set((existing ?? []).filter((r) => r.status !== "error").map((r) => r.plaud_file_id));
  const newFiles = files.filter((f) => !finalizedIds.has(f.id));
  summary.new = newFiles.length;
  if (newFiles.length === 0) return summary;

  const newMetas: PlaudRecordingMeta[] = newFiles.map((f) => ({
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

  // Un único cálculo de solapamiento/contigüidad sobre el lote nuevo + lo ya
  // guardado cerca en el tiempo; cada archivo se queda solo con los pares que
  // lo involucran (ver `processFile`).
  const { overlaps, contiguities } = detectOverlaps([...newMetas, ...existingMetas]);

  for (const file of newFiles) {
    try {
      const outcome = await processFile(supabase, centerId, accessToken, file, { overlaps, contiguities });
      if (outcome === "inserted") summary.inserted++;
      else summary.errors++;
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
    filesNew: 0,
    filesInserted: 0,
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
    totals.filesNew += summary.new;
    totals.filesInserted += summary.inserted;
    totals.fileErrors += summary.errors;
  }

  console.log("[sync-plaud-recordings] Done.", totals);

  return new Response(JSON.stringify(totals), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
