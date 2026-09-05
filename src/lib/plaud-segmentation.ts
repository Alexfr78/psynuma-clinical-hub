/**
 * Segmentación intra-archivo y detección de solapamiento para grabaciones Plaud.
 *
 * Contexto (ver arquitectura-plaud.md §3.1.bis, verificado dos veces sobre datos reales):
 * un mismo archivo de Plaud puede contener el final de la sesión de un paciente y el
 * arranque de la sesión de otro paciente distinto, porque el dispositivo sigue grabando
 * después de que el primer paciente se va. El resumen nativo de Plaud (`get_note`) cubrió
 * solo el primer bloque y omitió el segundo en silencio, así que no puede usarse como señal
 * de "esto es una única sesión". Este módulo NO decide a qué paciente pertenece nada — solo
 * detecta la sospecha de que un archivo mezcla contenido de más de una sesión, para que
 * `plaud-matching.ts` pueda bloquear el emparejamiento automático cuando corresponda.
 *
 * Ninguna señal individual es suficiente por sí sola: la diarización de Plaud es ruidosa
 * (turnos sueltos etiquetados con un speaker distinto en medio de un tramo dominado por
 * otro, confirmado en datos reales) y los saltos de speaker legítimos ocurren también
 * dentro de una sesión normal (p. ej. el terapeuta cede la palabra, o un tercero interviene
 * brevemente). Por eso se exige correlación entre al menos dos señales independientes antes
 * de marcar `containsMultipleSessions = true`.
 */

export interface PlaudRecordingMeta {
  fileId: string;
  startAt: string; // ISO 8601
  durationMs: number;
  serialNumber: string;
}

export interface TranscriptSegment {
  startTime: number; // ms desde el inicio del archivo
  endTime: number;
  speaker: string | null;
  content: string;
}

export interface SegmentationResult {
  containsMultipleSessions: boolean;
  score: number; // 0..1
  signals: string[]; // códigos de señal disparada, nunca el texto que hizo match
  boundaries: number[]; // ms desde el inicio del archivo donde se sospecha un corte
}

/**
 * Par de grabaciones cuyos intervalos se invaden de verdad (solapamiento real), más allá del
 * margen de deriva de reloj. Con un único dispositivo esto es físicamente imposible salvo
 * metadatos corruptos o dos aparatos grabando a la vez — por eso es bloqueo duro en
 * `plaud-matching.ts`.
 */
export interface OverlapPair {
  fileIdA: string;
  fileIdB: string;
  overlapMs: number; // > -CLOCK_DRIFT_TOLERANCE_MS; positivo si hay invasión real de intervalos
}

/**
 * Par de grabaciones consecutivas separadas por un hueco pequeño y positivo (ni solapan ni
 * están tan lejos como para ser recordings sin relación). Es el patrón *esperable* de un buen
 * protocolo de grabación (parar al terminar, arrancar en la siguiente) — señal de contexto,
 * nunca motivo de bloqueo por sí sola. Ver `CONTIGUITY_GAP_MAX_MS`.
 */
export interface ContiguityPair {
  fileIdA: string;
  fileIdB: string;
  gapMs: number; // > CLOCK_DRIFT_TOLERANCE_MS y <= CONTIGUITY_GAP_MAX_MS
}

/**
 * Resultado de comparar los intervalos de un conjunto de grabaciones. Separa
 * deliberadamente dos conceptos que antes vivían mezclados bajo una sola tolerancia:
 * `overlaps` (solapamiento real, bloqueo duro) y `contiguities` (huecos pequeños, señal de
 * contexto que nunca basta por sí sola). Ver comentario de `detectOverlaps`.
 */
export interface OverlapAnalysis {
  overlaps: OverlapPair[];
  contiguities: ContiguityPair[];
}

// ---------------------------------------------------------------------------
// Umbrales — cada uno documentado porque alguien tendrá que defenderlos.
// ---------------------------------------------------------------------------

/**
 * Tamaño de ventana para el voto de "speaker dominante". El diseño original (§3.2.bis)
 * pide "ventanas deslizantes de ~10 turnos": suficientemente grande para que un par de
 * turnos mal diarizados (ruido observado en datos reales: `Speaker 1`/`Speaker 3` sueltos
 * en medio de un tramo `Speaker 4`) no cambien el voto mayoritario de la ventana, pero
 * suficientemente pequeño para que una ventana quede acotada a un único bloque temático.
 */
const SPEAKER_WINDOW_SIZE = 10;

/**
 * Hacen falta al menos 3 ventanas (una "base" + dos "de cola") para evaluar el voto de
 * speaker. Con menos, no hay base suficiente para distinguir un cambio sostenido de una
 * fluctuación normal — el resultado es "sin datos suficientes", nunca un falso disparo.
 */
const MIN_WINDOWS_FOR_SPEAKER_SIGNAL = 3;

/**
 * Un hueco de silencio > 90 s entre el final de un turno y el inicio del siguiente es
 * indicio de que algo ocurrió en medio (el paciente se fue, el terapeuta preparó la sala).
 * Es una señal débil por sí sola: en el caso real verificado (archivo de 15:00 del
 * 1-sep-2026) los timestamps eran casi continuos y esta señal NO se disparó — por eso solo
 * cuenta como refuerzo cuando coincide con otra señal en el mismo tramo final.
 */
const LONG_GAP_MS = 90_000;

/**
 * Fracción de la duración total a partir de la cual un turno se considera parte del
 * "tramo final" del archivo. Se fija en 0.7 (último 30%) porque, por construcción, una
 * sesión que se cuela al final de una grabación ocurre necesariamente después de que la
 * sesión original terminase — nunca a la mitad de un archivo bien comportado. Restringir
 * la correlación de señales a este tramo evita que un cambio de interlocutor legítimo a
 * mitad de sesión (una llamada, un tercero que entra un momento) dispare sospecha.
 */
const TAIL_FRACTION = 0.7;

/**
 * Duración absoluta a partir de la cual, incluso sin conocer la duración agendada (que
 * `detectSegmentation` no recibe — eso se compara contra la cita real en
 * `plaud-matching.ts`), un archivo resulta sospechosamente largo para una única sesión
 * clínica individual. 75 minutos da un margen amplio sobre la duración habitual (45-60 min)
 * para no penalizar sesiones legítimamente largas; es una señal informativa/débil, nunca
 * decide `containsMultipleSessions` por sí sola.
 */
const DURATION_EXCESSIVE_MS = 75 * 60_000;

/**
 * Marcadores lingüísticos de apertura de sesión. Se basan literalmente en el caso real
 * verificado (el terapeuta dice "todas las sesiones las grabo..." al empezar con un
 * paciente nuevo dentro del archivo de otro paciente) más fórmulas habituales de una
 * primera consulta. Nunca se persiste el fragmento que hizo match, solo el booleano.
 */
const OPENING_MARKER_PATTERNS: RegExp[] = [
  /vengo porque/i,
  /es la primera vez que/i,
  /motivo de consulta/i,
  /todas las sesiones las grabo/i,
  /te aviso que (te )?grabo/i,
  /qu[eé] te trae por (aqu[ií])?/i,
];

/**
 * Margen de tolerancia por desfase de reloj del dispositivo al comparar intervalos de dos
 * archivos distintos — cubre SOLO el error de reloj de una grabadora de mano, nunca un hueco
 * de protocolo. Con un único dispositivo, unos pocos segundos de deriva son razonables; una
 * separación mayor ya no es "el mismo instante visto con reloj impreciso", es dos eventos
 * distintos en el tiempo. Se fija en 5 s porque el propietario para y arranca la grabación
 * manualmente entre sesiones, dejando huecos reales de 10-60 s (ver `CONTIGUITY_GAP_MAX_MS`)
 * que son claramente mayores que cualquier deriva de reloj razonable — 5 s da margen sin
 * confundir ambos fenómenos.
 *
 * IMPORTANTE (corrección de un fallo real): antes esta constante valía 30_000 y se usaba
 * como umbral único de "solapamiento", lo que trataba como solapamiento CUALQUIER hueco
 * menor de 30 s entre grabaciones consecutivas — incluidos los 14 s del caso real verificado
 * del 1-sep-2026, que es justo el patrón esperado de un buen protocolo (parar y arrancar). El
 * efecto era el contrario del buscado: todas las grabaciones del propietario (huecos de 10 a
 * 60 s) habrían caído en revisión manual por esta regla, vaciando de sentido la
 * automatización. Ver `ContiguityPair` para la señal correcta de ese caso.
 */
const CLOCK_DRIFT_TOLERANCE_MS = 5_000;

/**
 * Hueco máximo (en ms) entre el fin de una grabación y el inicio de la siguiente para
 * considerarlas "contiguas" — el patrón esperado del protocolo del propietario (parar al
 * terminar cada sesión, arrancar en la siguiente), verificado con huecos reales de 14 s y
 * 29,2 s. 60 s da margen sobre el extremo superior observado (protocolo habitual de 10-60 s)
 * sin llegar a cubrir una pausa real entre citas distintas. Por encima de este umbral, dos
 * grabaciones no se reportan como relacionadas en absoluto (ni solapamiento ni contigüidad):
 * son, sencillamente, grabaciones independientes.
 */
const CONTIGUITY_GAP_MAX_MS = 60_000;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function chunkIntoWindows<T>(items: T[], windowSize: number): T[][] {
  const windows: T[][] = [];
  for (let i = 0; i < items.length; i += windowSize) {
    windows.push(items.slice(i, i + windowSize));
  }
  // Fusiona una última ventana demasiado pequeña con la anterior para no dejar que un
  // puñado de turnos decida un voto de speaker por sí solo.
  if (windows.length >= 2 && windows[windows.length - 1].length < windowSize / 2) {
    const last = windows.pop() as T[];
    windows[windows.length - 1] = windows[windows.length - 1].concat(last);
  }
  return windows;
}

function dominantSpeaker(window: TranscriptSegment[]): string | null {
  const counts = new Map<string, number>();
  for (const segment of window) {
    if (!segment.speaker) continue;
    counts.set(segment.speaker, (counts.get(segment.speaker) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [speaker, count] of counts) {
    if (count > bestCount) {
      best = speaker;
      bestCount = count;
    }
  }
  return best;
}

interface SpeakerShiftResult {
  fired: boolean;
  boundaryMs: number | null;
}

function detectSpeakerShift(segments: TranscriptSegment[]): SpeakerShiftResult {
  const windows = chunkIntoWindows(segments, SPEAKER_WINDOW_SIZE);
  if (windows.length < MIN_WINDOWS_FOR_SPEAKER_SIGNAL) {
    return { fired: false, boundaryMs: null };
  }

  const tailWindows = windows.slice(-2);
  const baseWindows = windows.slice(0, -2);
  const baseSegments = baseWindows.flat();

  const baseline = dominantSpeaker(baseSegments);
  const tailDominants = tailWindows.map(dominantSpeaker);

  const fired = baseline !== null
    && tailDominants[0] !== null
    && tailDominants[0] === tailDominants[1]
    && tailDominants[0] !== baseline;

  if (!fired) return { fired: false, boundaryMs: null };

  const firstTailSegment = tailWindows[0][0];
  return { fired: true, boundaryMs: firstTailSegment ? firstTailSegment.startTime : null };
}

interface LocatedSignal {
  fired: boolean;
  boundaries: number[];
}

function detectLongGaps(segments: TranscriptSegment[], tailStartMs: number): LocatedSignal {
  const boundaries: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].startTime - segments[i - 1].endTime;
    if (gap > LONG_GAP_MS && segments[i - 1].endTime >= tailStartMs) {
      boundaries.push(segments[i - 1].endTime);
    }
  }
  return { fired: boundaries.length > 0, boundaries };
}

function detectLinguisticMarkers(segments: TranscriptSegment[], tailStartMs: number): LocatedSignal {
  const boundaries: number[] = [];
  for (const segment of segments) {
    if (segment.startTime < tailStartMs) continue;
    if (OPENING_MARKER_PATTERNS.some((pattern) => pattern.test(segment.content))) {
      boundaries.push(segment.startTime);
    }
  }
  return { fired: boundaries.length > 0, boundaries };
}

/**
 * Detecta si una grabación probablemente contiene más de una sesión clínica.
 *
 * Regla de decisión: se requieren al menos DOS de las tres señales localizables
 * (speaker_shift, long_gap, linguistic_marker) disparadas en el tramo final del archivo
 * para marcar `containsMultipleSessions = true`. Ninguna señal aislada basta — es
 * exactamente el motivo por el que el caso real (turno único con speaker distinto) no
 * habría bastado sin el marcador lingüístico que lo acompañaba. La señal de solapamiento
 * entre archivos (equivalente a la "señal 4" del diseño) vive en `detectOverlaps`, porque
 * esta función solo recibe los datos de UN archivo; es responsabilidad de quien llama
 * (`plaud-matching.ts`) combinar ambos resultados y aplicar el bloqueo duro.
 */
export function detectSegmentation(
  recording: PlaudRecordingMeta,
  segments: TranscriptSegment[],
): SegmentationResult {
  const tailStartMs = recording.durationMs * TAIL_FRACTION;

  const speakerShift = detectSpeakerShift(segments);
  const longGap = detectLongGaps(segments, tailStartMs);
  const linguisticMarker = detectLinguisticMarkers(segments, tailStartMs);
  const durationExcessive = recording.durationMs > DURATION_EXCESSIVE_MS;

  const signals: string[] = [];
  const boundaries: number[] = [];
  let score = 0;

  if (speakerShift.fired) {
    signals.push('speaker_shift');
    if (speakerShift.boundaryMs !== null) boundaries.push(speakerShift.boundaryMs);
    score += 0.3;
  }
  if (longGap.fired) {
    signals.push('long_gap');
    boundaries.push(...longGap.boundaries);
    score += 0.3;
  }
  if (linguisticMarker.fired) {
    signals.push('linguistic_marker');
    boundaries.push(...linguisticMarker.boundaries);
    score += 0.3;
  }
  if (durationExcessive) {
    signals.push('duration_excessive');
    score += 0.1;
  }

  const gateSignalsFired = [speakerShift.fired, longGap.fired, linguisticMarker.fired]
    .filter(Boolean).length;
  const containsMultipleSessions = gateSignalsFired >= 2;

  return {
    containsMultipleSessions,
    score: clamp01(score),
    signals,
    boundaries: Array.from(new Set(boundaries)).sort((a, b) => a - b),
  };
}

/**
 * Compara los intervalos [start_at, start_at + duration_ms] de un conjunto de grabaciones y
 * separa dos fenómenos distintos que antes se trataban como uno solo:
 *
 * - `overlaps`: solapamiento REAL — los intervalos se invaden (`overlapMs > 0`), o casi,
 *   dentro del margen de deriva de reloj `CLOCK_DRIFT_TOLERANCE_MS`. Con un único
 *   dispositivo grabando en serie esto es físicamente imposible, así que indica metadatos
 *   corruptos o dos aparatos grabando a la vez. Sigue siendo bloqueo duro en
 *   `plaud-matching.ts`: ambos archivos a revisión, confianza anulada.
 * - `contiguities`: hueco pequeño y POSITIVO entre el fin de una grabación y el inicio de la
 *   siguiente (hasta `CONTIGUITY_GAP_MAX_MS`). Es el patrón esperable de un buen protocolo
 *   (parar la grabación al terminar, arrancar en la siguiente) — NUNCA basta por sí solo
 *   para bloquear un emparejamiento automático. Se expone como señal de contexto: si además
 *   hay señales de contenido (`detectSegmentation`) sobre alguno de los dos archivos, un
 *   llamador puede usarla para reforzar la interpretación, pero la contigüidad en sí misma
 *   describe exactamente lo que se espera que ocurra, no una anomalía.
 *
 * Un par separado por más de `CONTIGUITY_GAP_MAX_MS` no aparece en ninguna de las dos listas:
 * son grabaciones sin relación aparente.
 *
 * El llamador es responsable de pre-filtrar `recordings` al mismo profesional y a una
 * ventana razonable de días (±1 día, per §3.2.ter) — esta función solo hace la comparación
 * geométrica de intervalos sobre lo que reciba, sin conocer a qué profesional pertenece
 * cada archivo (el contrato `PlaudRecordingMeta` no lleva ese campo).
 */
export function detectOverlaps(recordings: PlaudRecordingMeta[]): OverlapAnalysis {
  const intervals = recordings.map((recording) => {
    const start = new Date(recording.startAt).getTime();
    return {
      fileId: recording.fileId,
      start,
      end: start + recording.durationMs,
    };
  });

  const overlaps: OverlapPair[] = [];
  const contiguities: ContiguityPair[] = [];
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (Number.isNaN(a.start) || Number.isNaN(b.start)) continue;

      const overlapMs = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (overlapMs > -CLOCK_DRIFT_TOLERANCE_MS) {
        overlaps.push({ fileIdA: a.fileId, fileIdB: b.fileId, overlapMs });
      } else if (overlapMs > -CONTIGUITY_GAP_MAX_MS) {
        contiguities.push({ fileIdA: a.fileId, fileIdB: b.fileId, gapMs: -overlapMs });
      }
    }
  }
  return { overlaps, contiguities };
}
