/**
 * Traducción a lenguaje natural de los códigos técnicos que produce la ingesta de Plaud
 * (`src/lib/plaud-matching.ts` y `src/lib/plaud-segmentation.ts`) para la bandeja de
 * revisión. Nada de esto decide nada — es solo presentación — pero es la pieza que evita
 * que quien revisa tenga que interpretar nombres de campo o códigos internos para saber
 * qué está pasando con una grabación.
 */
import type { Json } from '@/integrations/supabase/types';
import { CONSENT_PURPOSE_LABELS, consentPurposeStatusReason } from '@/lib/consent-block-messages';
import type { ConsentCheckResult, ConsentPurpose } from '@/lib/consent-verification';

function asStringArray(value: Json | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asNumberArray(value: Json | null | undefined): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number');
}

/** Códigos de `segmentation_signals` → frase sobre lo que se observó en el audio. */
const SEGMENTATION_SIGNAL_LABELS: Record<string, string> = {
  speaker_shift: 'El interlocutor que domina la conversación cambia de forma sostenida hacia el final del archivo.',
  long_gap: 'Hay un silencio largo (más de minuto y medio) antes de que continúe la grabación.',
  linguistic_marker: 'Se han detectado frases típicas de empezar una sesión nueva (presentación, motivo de consulta) en el tramo final.',
  duration_excessive: 'El archivo dura bastante más de lo habitual para una única sesión.',
};

/** Códigos de `match_reasons` que describen el motivo principal de revisión. */
const PRIMARY_REVIEW_REASON_LABELS: Record<string, string> = {
  possible_multi_session: 'Puede contener más de una sesión.',
  overlap_detected: 'Se solapa en el tiempo con otra grabación.',
  ambiguous_candidates: 'Hay más de una cita que encaja igual de bien.',
  no_session_that_day: 'No se ha encontrado ninguna cita cercana a la hora de esta grabación.',
  low_confidence: 'La coincidencia encontrada no llega al nivel de confianza necesario para confirmarla sola.',
};

/** Códigos de `match_reasons` que aportan contexto sobre la sesión sugerida, no sobre el bloqueo. */
const SUGGESTION_DETAIL_LABELS: Record<string, string> = {
  time_proximity: 'Empieza casi a la misma hora que la cita.',
  time_far: 'Empieza bastante lejos de la hora de la cita.',
  duration_match: 'Dura aproximadamente lo mismo que la cita agendada.',
  duration_mismatch: 'Dura bastante distinto de lo agendado.',
  duration_exceeds_scheduled: 'Dura notablemente más de lo agendado — puede llevar contenido de más.',
  contiguous_recording: 'Es la siguiente grabación justo después de otra, como si se hubiera parado y vuelto a grabar entre citas.',
};

export interface SegmentationSignalDescription {
  code: string;
  label: string;
}

/** Traduce `segmentation_signals` (array de códigos) a frases legibles, en orden estable. */
export function describeSegmentationSignals(signals: Json | null | undefined): SegmentationSignalDescription[] {
  return asStringArray(signals)
    .filter((code) => code in SEGMENTATION_SIGNAL_LABELS)
    .map((code) => ({ code, label: SEGMENTATION_SIGNAL_LABELS[code] }));
}

/** Motivos principales por los que una grabación necesita revisión humana, en lenguaje natural. */
export function describePrimaryReviewReasons(reasons: Json | null | undefined): string[] {
  const codes = asStringArray(reasons);
  return Object.entries(PRIMARY_REVIEW_REASON_LABELS)
    .filter(([code]) => codes.includes(code))
    .map(([, label]) => label);
}

/** Detalles de por qué se sugiere una sesión concreta (no son motivo de bloqueo, son contexto). */
export function describeSuggestionDetails(reasons: Json | null | undefined): string[] {
  const codes = asStringArray(reasons);
  return Object.entries(SUGGESTION_DETAIL_LABELS)
    .filter(([code]) => codes.includes(code))
    .map(([, label]) => label);
}

/** Convierte un offset en milisegundos desde el inicio del archivo a "mm:ss" u "h:mm:ss". */
export function formatOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Marcas de tiempo (mm:ss desde el inicio del archivo) donde se sospecha un corte entre sesiones. */
export function describeSegmentBoundaries(boundaries: Json | null | undefined): string[] {
  return asNumberArray(boundaries).map((ms) => formatOffset(ms));
}

/** Formatea una duración en milisegundos como "Xh Ymin" o "Ymin". */
export function formatDurationMs(durationMs: number): string {
  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  }
  return `${minutes} min`;
}

/** Formatea la confianza de emparejamiento (0..1) como porcentaje entero. */
export function formatConfidencePct(confidence: number | null): string {
  if (confidence === null || Number.isNaN(confidence)) return '—';
  return `${Math.round(confidence * 100)}%`;
}

// ---------------------------------------------------------------------------
// Bloqueo por consentimiento al generar informes de IA sobre una grabación
// ---------------------------------------------------------------------------
//
// La generación de informes exige los mismos dos consentimientos
// ('ai_processing' y 'report_generation') que ya controla
// `useTranscriptionAnalysis.tsx` para el flujo de audio subido a mano. En vez
// de inventar un texto nuevo para este único punto de entrada, se reutiliza
// el mismo vocabulario que el resto de la app ya usa para hablar de
// consentimiento (`src/lib/consent-block-messages.ts`): las mismas etiquetas
// de propósito y las mismas frases por motivo (revocado, caducado, pendiente
// de firma...).

const GENERATION_CONSENT_ORDER: ConsentPurpose[] = ['ai_processing', 'report_generation'];

/** Mensaje de bloqueo para un propósito de consentimiento concreto, con el mismo vocabulario que el resto de la app. */
function formatConsentBlockMessage(purpose: ConsentPurpose, result: ConsentCheckResult): string {
  const label = CONSENT_PURPOSE_LABELS[purpose];
  const reason = consentPurposeStatusReason(result) ?? 'Consentimiento no concedido.';
  return `No se pueden generar informes con IA: falta autorización para "${label}". ${reason}`;
}

/**
 * Motivo concreto (no un error genérico) por el que no se pueden generar los informes de
 * IA de una grabación, a partir de los resultados de `usePlaudGenerationConsent` — o de un
 * único resultado ya conocido, cuando lo que se traduce es la respuesta 403 de
 * `analyze-session-transcription` en vez de la comprobación proactiva del cliente. Devuelve
 * `null` cuando no hay bloqueo (ambos propósitos concedidos) o cuando todavía no hay datos.
 */
export function describePlaudGenerationBlock(
  results: Partial<Record<ConsentPurpose, ConsentCheckResult>> | undefined,
): string | null {
  if (!results) return null;
  for (const purpose of GENERATION_CONSENT_ORDER) {
    const result = results[purpose];
    if (result && !result.granted) return formatConsentBlockMessage(purpose, result);
  }
  return null;
}
