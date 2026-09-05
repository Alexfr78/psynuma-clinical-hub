/**
 * Emparejamiento de una grabación Plaud con la cita agendada (sesión) a la que pertenece.
 *
 * Regla que domina todo lo demás (ver arquitectura-plaud.md §3.3 punto 4 y §6 riesgo #1):
 * si la segmentación intra-archivo sospecha más de una sesión, o si el archivo solapa con
 * otro, el resultado es SIEMPRE `requiresReview = true` con `confidence` anulada a 0 — sin
 * importar lo bien que encaje temporalmente con una candidata. Un falso positivo aquí no es
 * un error de etiquetado: es volcar el relato de un paciente en la ficha de otro (dato de
 * categoría especial, art. 9 RGPD). Por eso el bloqueo se evalúa antes que cualquier otra
 * cosa y no hay combinación de señales de score que pueda saltárselo.
 */

import type { ContiguityPair, OverlapPair, SegmentationResult } from '@/lib/plaud-segmentation';

export interface PlaudRecordingMeta {
  fileId: string;
  startAt: string; // ISO 8601
  durationMs: number;
  serialNumber: string;
}

export interface CandidateSession {
  sessionId: string;
  patientId: string;
  startAt: string; // ISO 8601
  durationMin: number;
}

export interface MatchResult {
  sessionId: string | null;
  patientId: string | null;
  confidence: number; // 0..1
  reasons: string[];
  requiresReview: boolean;
}

// ---------------------------------------------------------------------------
// Umbrales — cada uno documentado porque alguien tendrá que defenderlos.
// ---------------------------------------------------------------------------

/**
 * Peso de la proximidad temporal en el score. Es el componente principal (0.6 de 1.0)
 * porque el instante en que arranca una grabación es un dato fiable — lo pone el propio
 * dispositivo al pulsar grabar, cerca del inicio real de la cita — mientras que la duración
 * puede variar por motivos legítimos (la sesión se alarga, el terapeuta sigue grabando su
 * propio repaso al terminar, etc.), como ya se observó en las grabaciones "Informe".
 */
const TIME_WEIGHT = 0.6;

/** Complemento de TIME_WEIGHT: 0.4 para la proximidad de duración. */
const DURATION_WEIGHT = 0.4;

/**
 * Ventana de 30 minutos para normalizar la diferencia temporal: una grabación que arranca
 * más de 30 min antes o después del inicio agendado aporta 0 puntos por este componente.
 * 30 min es, aproximadamente, la duración de una sesión corta completa — más allá de eso ya
 * no es "el mismo evento con el reloj desajustado", es sencillamente otra franja horaria.
 */
const TIME_DIFF_CAP_MIN = 30;

/**
 * Tolerancia del 50% en la diferencia de duración para normalizar ese componente: una
 * grabación que dura el doble o la mitad de lo agendado aporta 0 puntos aquí. Es
 * deliberadamente laxo porque la duración por sí sola es la señal menos fiable (ver
 * TIME_WEIGHT) — el filtro realmente estricto sobre duración es la penalización explícita
 * de abajo, no este término normalizador.
 */
const DURATION_DIFF_CAP_PCT = 0.5;

/**
 * Si la grabación dura más de un 25% por encima de lo agendado, se penaliza el score de esa
 * candidata. Es exactamente el patrón del caso real verificado: una cita de 50 min con una
 * grabación de 70 min (40% de exceso) resultó ser un archivo que además contenía el inicio
 * de la sesión de otro paciente. Un exceso de duración moderado (ensayo que se alarga 10-15
 * min) no dispara la penalización; superar claramente ese margen sí es indicio de que el
 * archivo puede llevar más contenido del que le corresponde a esa cita.
 */
const DURATION_OVERAGE_RATIO = 1.25;

/**
 * Magnitud de la penalización por exceso de duración. Se resta directamente del score
 * (no es un multiplicador) para que sea una señal fuerte y predecible: sobre un score
 * perfecto de 1.0, deja como máximo 0.7 — por debajo del umbral de auto-match (0.85) — de
 * modo que ninguna coincidencia temporal por perfecta que sea puede compensar por sí sola
 * un archivo sospechosamente largo.
 */
const DURATION_OVERAGE_PENALTY = 0.3;

/**
 * Corrección menor (±0.05) según si la grabación trae un número de serie de dispositivo
 * identificable. `CandidateSession` no lleva un número de serie esperado con el que
 * compararlo (las citas agendadas no registran qué grabadora se usará), así que esta señal
 * NO puede discriminar entre candidatas — es deliberadamente un ajuste pequeño y uniforme,
 * no un componente central del score. Se incluye porque un `serialNumber` ausente reduce la
 * trazabilidad del archivo (no se puede auditar de qué dispositivo vino) y eso, por
 * higiene, debe pesar levemente en contra de un emparejamiento automático.
 *
 * Heurística frágil, dicho explícitamente: si en el futuro se quiere que el número de serie
 * discrimine de verdad entre candidatas (p. ej. distinguir grabaciones del dispositivo
 * físico principal de grabaciones de la app de escritorio, ver arquitectura-plaud.md §3.1),
 * hace falta enriquecer `CandidateSession` con qué dispositivo se espera para esa cita, o
 * moverlo a la fase de clasificación previa en vez de al emparejamiento.
 */
const DEVICE_SERIAL_ADJUSTMENT = 0.05;

/**
 * Umbral de confianza mínima para emparejamiento 100% automático. 0.85 exige que ambos
 * componentes del score sean altos simultáneamente (p. ej. ~10 min de diferencia temporal Y
 * duración casi exacta) — deliberadamente alto porque el coste de un falso positivo es una
 * brecha de datos, no una simple corrección manual.
 */
const AUTO_MATCH_MIN_SCORE = 0.85;

/**
 * Margen mínimo exigido entre la mejor candidata y la segunda mejor para considerar el
 * emparejamiento inequívoco. 0.25 evita el caso típico de dos citas consecutivas el mismo
 * día con poco margen entre ellas: ambas quedarían con scores parecidos y, sin este margen,
 * el sistema podría "adivinar" cuál es la correcta en vez de preguntar. Ante la duda, a
 * revisión humana.
 */
const AUTO_MATCH_MARGIN = 0.25;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toEpochMs(iso: string): number {
  const value = new Date(iso).getTime();
  return Number.isNaN(value) ? NaN : value;
}

interface ScoredCandidate {
  candidate: CandidateSession;
  value: number;
  reasons: string[];
}

function scoreCandidate(recording: PlaudRecordingMeta, candidate: CandidateSession): ScoredCandidate {
  const reasons: string[] = [];

  const recordingStart = toEpochMs(recording.startAt);
  const candidateStart = toEpochMs(candidate.startAt);
  const timeDiffMin = Number.isNaN(recordingStart) || Number.isNaN(candidateStart)
    ? Infinity
    : Math.abs(recordingStart - candidateStart) / 60_000;

  const recordingDurationMin = recording.durationMs / 60_000;
  const candidateDurationMin = candidate.durationMin;
  const durationDiffPct = candidateDurationMin > 0
    ? Math.abs(recordingDurationMin - candidateDurationMin) / candidateDurationMin
    : 1;

  let value = TIME_WEIGHT * Math.max(0, 1 - timeDiffMin / TIME_DIFF_CAP_MIN)
    + DURATION_WEIGHT * Math.max(0, 1 - durationDiffPct / DURATION_DIFF_CAP_PCT);

  reasons.push(timeDiffMin <= TIME_DIFF_CAP_MIN ? 'time_proximity' : 'time_far');
  reasons.push(durationDiffPct <= DURATION_DIFF_CAP_PCT ? 'duration_match' : 'duration_mismatch');

  if (candidateDurationMin > 0 && recordingDurationMin > candidateDurationMin * DURATION_OVERAGE_RATIO) {
    value -= DURATION_OVERAGE_PENALTY;
    reasons.push('duration_exceeds_scheduled');
  }

  if (recording.serialNumber && recording.serialNumber.trim().length > 0) {
    value += DEVICE_SERIAL_ADJUSTMENT;
    reasons.push('device_serial_present');
  } else {
    value -= DEVICE_SERIAL_ADJUSTMENT;
    reasons.push('device_serial_missing');
  }

  return { candidate, value: clamp01(value), reasons };
}

/**
 * Empareja una grabación con la sesión agendada más plausible.
 *
 * Orden de evaluación (deliberado, no reordenar):
 * 1. Bloqueo duro por segmentación/solapamiento REAL — si aplica, se calcula igualmente la
 *    mejor candidata como SUGERENCIA para la bandeja de revisión (para que el terapeuta no
 *    tenga que buscarla a mano), pero `confidence` se fuerza a 0 y `requiresReview` a `true`
 *    pase lo que pase con el score temporal. `opts.overlaps` debe contener SOLO solapamiento
 *    real (`OverlapPair`, ver `plaud-segmentation.ts::detectOverlaps`) — una contigüidad
 *    (`opts.contiguities`) nunca dispara este bloqueo por sí sola, es lo esperable de un buen
 *    protocolo de grabación (parar y arrancar entre sesiones), no una anomalía.
 * 2. Sin candidatas ese día → revisión, sin sugerencia posible.
 * 3. Con candidatas → se puntúa cada una y solo se permite `matched_auto` si la mejor
 *    supera 0.85 Y saca al menos 0.25 de ventaja sobre la segunda mejor. Cualquier otro
 *    caso (score intermedio, dos candidatas parecidas — el caso típico de sesiones
 *    consecutivas el mismo día) cae en revisión con la mejor candidata como sugerencia.
 *
 * `opts.contiguities` es puramente informativo: si la grabación es contigua a otra, se añade
 * la razón `contiguous_recording` al resultado (nunca afecta a `confidence` ni a
 * `requiresReview`) para que quien revise a mano vea, junto a `possible_multi_session` si
 * también está presente, que ambas señales coinciden — sin que la contigüidad por sí sola
 * pueda nunca ser la causa del bloqueo.
 */
export function matchRecordingToSession(
  recording: PlaudRecordingMeta,
  candidates: CandidateSession[],
  opts?: { segmentation?: SegmentationResult; overlaps?: OverlapPair[]; contiguities?: ContiguityPair[] },
): MatchResult {
  const gateReasons: string[] = [];

  const blockedBySegmentation = opts?.segmentation?.containsMultipleSessions === true;
  if (blockedBySegmentation) gateReasons.push('possible_multi_session');

  const blockedByOverlap = (opts?.overlaps ?? [])
    .some((pair) => pair.fileIdA === recording.fileId || pair.fileIdB === recording.fileId);
  if (blockedByOverlap) gateReasons.push('overlap_detected');

  // Señal de contexto, nunca de bloqueo: se añade a las razones expuestas pero no participa
  // en `isBlocked`. Ver docstring de esta función y de `ContiguityPair`.
  const isContiguousWithOther = (opts?.contiguities ?? [])
    .some((pair) => pair.fileIdA === recording.fileId || pair.fileIdB === recording.fileId);
  if (isContiguousWithOther) gateReasons.push('contiguous_recording');

  const isBlocked = blockedBySegmentation || blockedByOverlap;

  if (candidates.length === 0) {
    return {
      sessionId: null,
      patientId: null,
      confidence: 0,
      reasons: [...gateReasons, 'no_session_that_day'],
      requiresReview: true,
    };
  }

  const scored = candidates
    .map((candidate) => scoreCandidate(recording, candidate))
    .sort((a, b) => b.value - a.value);

  const best = scored[0];
  const second = scored[1];

  if (isBlocked) {
    // Condición bloqueante: ninguna combinación de señales de score puede saltársela.
    // Se expone la mejor candidata solo como sugerencia visual — nunca como asignación.
    return {
      sessionId: best.candidate.sessionId,
      patientId: best.candidate.patientId,
      confidence: 0,
      reasons: [...gateReasons, ...best.reasons, 'requires_human_review'],
      requiresReview: true,
    };
  }

  const hasClearWinner = best.value >= AUTO_MATCH_MIN_SCORE
    && (!second || best.value - second.value >= AUTO_MATCH_MARGIN);

  if (hasClearWinner) {
    return {
      sessionId: best.candidate.sessionId,
      patientId: best.candidate.patientId,
      confidence: best.value,
      // Aquí `gateReasons` solo puede contener `contiguous_recording` (si `isBlocked` fuese
      // true no habríamos llegado a esta rama) — informativo, no cambia `requiresReview`.
      reasons: [...gateReasons, ...best.reasons, 'matched_auto'],
      requiresReview: false,
    };
  }

  return {
    sessionId: best.candidate.sessionId,
    patientId: best.candidate.patientId,
    confidence: best.value,
    reasons: [...gateReasons, ...best.reasons, second ? 'ambiguous_candidates' : 'low_confidence', 'requires_human_review'],
    requiresReview: true,
  };
}
