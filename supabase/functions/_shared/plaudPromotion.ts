/**
 * Lleva una grabación de Plaud ya emparejada al mismo circuito que la grabadora de Psycma:
 *
 *   1. Crea una fila en `audio_ingestions` (source 'plaud', sin audio: Plaud no lo expone,
 *      solo la transcripción) para que aparezca en /grabaciones y se pueda borrar desde allí.
 *      Su id es el de la fila de `plaud_recordings`, así que repetir la promoción no duplica.
 *   2. Guarda la transcripción en `transcripts` con las etiquetas de hablante ya
 *      anonimizadas ("Hablante N") y la misma caducidad que tenía en `plaud_recordings`.
 *   3. Genera los informes automáticos en borrador (salvo que la sesión ya tenga documentos
 *      generados, para no duplicar los de sesiones antiguas).
 *
 * Solo se promociona lo que no tiene dudas: emparejado automáticamente sin solapes ni
 * sospecha de varios pacientes, o confirmado a mano en la bandeja y sin aviso posterior.
 * Exige el consentimiento `recording` de todos los pacientes de la sesión, igual que la
 * grabadora web antes de empezar a grabar.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkSessionConsent } from "./consent.ts";
import { logAuditEvent } from "./auditLogger.ts";
import { generateAutomaticReports } from "./automaticReports.ts";
import type { TranscriptionSegment } from "./transcriptionProvider.ts";

const LOG = "[plaud-promotion]";
/** Cada informe tarda decenas de segundos: se limita por ciclo para no agotar el tiempo del cron. */
export const MAX_PROMOTIONS_PER_RUN = 2;
export const CONSENT_MISSING_REASON = "consent_recording_missing";
/** Una reserva más antigua que esto se da por abandonada (ejecución cortada a medias). */
const CLAIM_TTL_MS = 30 * 60 * 1000;

interface PromotableRow {
  id: string;
  center_id: string;
  session_id: string;
  patient_id: string;
  start_at: string;
  duration_ms: number;
  matched_by: string | null;
  confirmed_by: string | null;
  contains_multiple_sessions: boolean;
  overlap_flag: boolean;
  match_reasons: string[] | null;
  transcript_text: string;
  transcript_expires_at: string | null;
}

export interface PromotionSummary {
  promoted: number;
  /** Otra ejecución del cron la tiene reservada. */
  skippedClaimed: number;
  waitingConsent: number;
  errors: number;
}

/**
 * Convierte el `transcript_text` guardado (una línea `[hablante] texto` por segmento, ver
 * `buildTranscriptText` en sync-plaud-recordings) en segmentos con la etiqueta ya
 * anonimizada. Las líneas sin marca continúan el segmento anterior.
 */
export function plaudTextToSegments(text: string): TranscriptionSegment[] {
  const labels = new Map<string, string>();
  const segments: TranscriptionSegment[] = [];
  for (const line of text.split("\n")) {
    const match = /^\[([^\]]*)\] ([\s\S]*)$/.exec(line);
    if (!match) {
      if (segments.length > 0 && line.trim()) segments[segments.length - 1].text += `\n${line}`;
      continue;
    }
    const [, rawSpeaker, content] = match;
    if (!content.trim()) continue;
    let speaker: string | undefined;
    if (rawSpeaker && rawSpeaker !== "desconocido") {
      speaker = labels.get(rawSpeaker);
      if (!speaker) {
        speaker = `Hablante ${labels.size + 1}`;
        labels.set(rawSpeaker, speaker);
      }
    }
    // Plaud no conserva los tiempos en el texto guardado; el orden de las líneas es el real.
    segments.push({ start: 0, end: 0, text: content, ...(speaker ? { speaker } : {}) });
  }
  return segments;
}

function isPromotable(row: PromotableRow): boolean {
  if (row.matched_by === "auto") return !row.contains_multiple_sessions && !row.overlap_flag;
  return row.matched_by === "manual" && row.confirmed_by !== null;
}

async function promoteOne(supabase: SupabaseClient, req: Request, row: PromotableRow): Promise<"promoted" | "waiting_consent"> {
  // `session_id`/`patient_id` vienen de una fila que la bandeja edita desde el cliente: se
  // comprueba aquí que la sesión es del centro y que el paciente es de esa sesión, para no
  // colgar nunca una transcripción de una sesión ajena ni de otro paciente.
  const { data: session, error: sessionError } = await supabase.from("sessions")
    .select("professional_id, patient_id")
    .eq("id", row.session_id)
    .eq("center_id", row.center_id)
    .maybeSingle();
  if (sessionError) throw new Error("session_lookup_failed");
  if (!session?.professional_id) throw new Error("session_not_in_center");
  if (session.patient_id !== row.patient_id) {
    const { data: participant } = await supabase.from("session_participants")
      .select("patient_id").eq("session_id", row.session_id).eq("patient_id", row.patient_id).maybeSingle();
    if (!participant) throw new Error("patient_not_in_session");
  }

  const consent = await checkSessionConsent(supabase, row.session_id, ["recording"], row.patient_id);
  if (!consent.granted) {
    // Emparejada sola: pasa a la bandeja para que se vea por qué no avanza. Confirmada a mano:
    // la decisión humana no se toca; queda el motivo y se reintenta en cada ciclo.
    const update = row.matched_by === "auto"
      ? {
        status: "needs_review",
        matched_by: null,
        match_reasons: [...(row.match_reasons ?? []).filter((r) => r !== "matched_auto"), CONSENT_MISSING_REASON],
        last_error: CONSENT_MISSING_REASON,
      }
      : { last_error: CONSENT_MISSING_REASON };
    Object.assign(update, { promotion_claimed_at: null });
    await supabase.from("plaud_recordings").update(update).eq("id", row.id);
    return "waiting_consent";
  }

  const { error: ingestionError } = await supabase.from("audio_ingestions").upsert({
    id: row.id,
    center_id: row.center_id,
    professional_id: session.professional_id,
    patient_id: row.patient_id,
    session_id: row.session_id,
    source: "plaud",
    recorded_at: row.start_at,
    duration_ms: row.duration_ms,
    status: "transcription_verified",
    matching_status: "confirmed",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (ingestionError) throw new Error(`audio_ingestion_insert_failed: ${ingestionError.message}`);

  const segments = plaudTextToSegments(row.transcript_text);
  const normalizedText = segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n");
  if (!normalizedText) throw new Error("empty_transcription");

  const { data: existingTranscript, error: lookupError } = await supabase.from("transcripts")
    .select("id").eq("audio_ingestion_id", row.id).limit(1).maybeSingle();
  if (lookupError) throw new Error("transcript_lookup_failed");
  if (!existingTranscript) {
    const { error: transcriptError } = await supabase.from("transcripts").insert({
      session_id: row.session_id,
      patient_id: row.patient_id,
      center_id: row.center_id,
      audio_ingestion_id: row.id,
      source: "plaud",
      normalized_text: normalizedText,
      segments,
      language: "es",
      diarization_available: segments.some((segment) => segment.speaker),
      ...(row.transcript_expires_at ? { expires_at: row.transcript_expires_at } : {}),
    });
    // 23505: otra ejecución la insertó a la vez (índice único por audio_ingestion_id).
    if (transcriptError && transcriptError.code !== "23505") throw new Error(`transcript_insert_failed: ${transcriptError.message}`);
    if (!transcriptError) {
      await logAuditEvent({
        supabase, req, userId: null, organizationId: row.center_id, patientId: row.patient_id,
        resourceType: "transcripts", resourceId: row.id, action: "CREATE",
        routeOrEndpoint: "sync-plaud-recordings",
        metadata: { source: "plaud", sessionId: row.session_id, plaudRecordingId: row.id },
      });
    }
  }

  // Se marca antes de los informes: si estos fallan, no se reintentan (igual que en la
  // grabadora) y se pueden generar a mano desde la sesión con la transcripción guardada.
  const { error: linkError } = await supabase.from("plaud_recordings")
    .update({ audio_ingestion_id: row.id, last_error: null, promotion_claimed_at: null }).eq("id", row.id);
  if (linkError) throw new Error(`plaud_link_failed: ${linkError.message}`);

  const { count: existingDocuments } = await supabase.from("ai_generated_documents")
    .select("id", { count: "exact", head: true }).eq("session_id", row.session_id);
  if ((existingDocuments ?? 0) > 0) {
    console.log(`${LOG} Se omiten informes automáticos: la sesión ya tiene documentos generados.`);
    return "promoted";
  }

  await generateAutomaticReports(
    supabase,
    { centerId: row.center_id, professionalId: session.professional_id, sessionId: row.session_id },
    normalizedText,
    segments,
    { transcriptSource: "plaud", plaudRecordingId: row.id, logPrefix: LOG },
  );
  return "promoted";
}

/** Promociona hasta `MAX_PROMOTIONS_PER_RUN` grabaciones listas del centro. Nunca lanza. */
export async function promotePlaudRecordings(supabase: SupabaseClient, req: Request, centerId: string): Promise<PromotionSummary> {
  const summary: PromotionSummary = { promoted: 0, skippedClaimed: 0, waitingConsent: 0, errors: 0 };
  const { data, error } = await supabase.from("plaud_recordings")
    .select("id, center_id, session_id, patient_id, start_at, duration_ms, matched_by, confirmed_by, contains_multiple_sessions, overlap_flag, match_reasons, transcript_text, transcript_expires_at")
    .eq("center_id", centerId)
    .eq("status", "matched")
    .eq("flagged_after_confirmation", false)
    .is("audio_ingestion_id", null)
    .not("transcript_text", "is", null)
    .not("session_id", "is", null)
    .not("patient_id", "is", null)
    .order("start_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error(`${LOG} No se pudieron leer las grabaciones listas (center ${centerId}):`, error.message);
    summary.errors++;
    return summary;
  }

  for (const row of ((data ?? []) as PromotableRow[]).filter(isPromotable)) {
    if (summary.promoted >= MAX_PROMOTIONS_PER_RUN) break;
    // Reserva atómica: si dos ejecuciones del cron se solapan, solo una promociona la fila.
    const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
    const { data: claimed, error: claimError } = await supabase.from("plaud_recordings")
      .update({ promotion_claimed_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("audio_ingestion_id", null)
      .or(`promotion_claimed_at.is.null,promotion_claimed_at.lt.${staleBefore}`)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      summary.skippedClaimed++;
      continue;
    }
    try {
      const outcome = await promoteOne(supabase, req, row);
      if (outcome === "promoted") summary.promoted++;
      else summary.waitingConsent++;
    } catch (promoteError) {
      summary.errors++;
      const message = promoteError instanceof Error ? promoteError.message : String(promoteError);
      console.error(`${LOG} Error promocionando una grabación (center ${centerId}): ${message}`);
      await supabase.from("plaud_recordings").update({ last_error: message.slice(0, 500), promotion_claimed_at: null }).eq("id", row.id);
    }
  }
  return summary;
}
