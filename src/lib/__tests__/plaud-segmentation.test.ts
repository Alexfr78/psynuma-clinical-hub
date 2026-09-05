import { describe, expect, it } from 'vitest';
import {
  detectOverlaps,
  detectSegmentation,
  type PlaudRecordingMeta,
  type TranscriptSegment,
} from '@/lib/plaud-segmentation';

/**
 * Los dos casos reales verificados con las grabaciones del propietario que motivan esta
 * corrección: en ambos, el hueco entre archivos consecutivos es el patrón esperado de un
 * buen protocolo (parar la grabación al terminar, arrancar en la siguiente) — NO un
 * solapamiento real, por pequeño que sea el hueco.
 */
const REAL_CASE_CLEAN_PROTOCOL = {
  // Sesiones seguidas con protocolo correcto: A termina 10:00:03.378, B empieza 10:00:32.611.
  a: {
    fileId: 'sesion-seguida-A',
    startAt: '2026-09-04T09:30:35.378Z',
    durationMs: 1_768_000, // termina 10:00:03.378
    serialNumber: '8810B30222359734',
  } satisfies PlaudRecordingMeta,
  b: {
    fileId: 'sesion-seguida-B',
    startAt: '2026-09-04T10:00:32.611Z', // 29,2 s después de que A termine
    durationMs: 3_000_000,
    serialNumber: '8810B30222359734',
  } satisfies PlaudRecordingMeta,
};

const REAL_CASE_MULTI_SESSION_FILE = {
  // Archivo con dos pacientes dentro: A termina 16:10:41, B empieza 16:10:55 (14 s después).
  // Lo peligroso de este archivo NO es el hueco entre A y B (14 s, contigüidad normal), sino
  // que A contiene, en su tramo final, la apertura de la siguiente consulta — eso lo detecta
  // `detectSegmentation`, no `detectOverlaps`.
  a: {
    fileId: 'f8beaedebbd7b4038648a704f21ba051',
    startAt: '2026-09-01T15:00:56.000Z',
    durationMs: 4_185_000, // termina 16:10:41
    serialNumber: '8810B30222359734',
  } satisfies PlaudRecordingMeta,
  b: {
    fileId: '76da56d5ae6c3ab8696b7be5df9facc3',
    startAt: '2026-09-01T16:10:55.000Z', // 14 s después de que A termine
    durationMs: 3_000_000,
    serialNumber: '8810B30222359734',
  } satisfies PlaudRecordingMeta,
};

/**
 * Genera una transcripción sintética con un bloque "base" (un único hablante dominante
 * alternando con un segundo interlocutor, sin marcadores de apertura) seguido de un bloque
 * "de cola" con un hablante distinto. Reproduce la forma del caso real verificado: 300
 * turnos base (30 ventanas de 10) + 20 turnos de cola (2 ventanas de 10), para que las dos
 * últimas ventanas de `chunkIntoWindows` coincidan exactamente con el bloque de cola.
 */
function buildRecordingWithTailShift(opts: {
  tailContent?: string;
  tailStartMs?: number;
  totalDurationMs?: number;
  includeLongGap?: boolean;
}): { recording: PlaudRecordingMeta; segments: TranscriptSegment[] } {
  const totalDurationMs = opts.totalDurationMs ?? 4_185_000; // 69m45s, igual que el caso real
  const tailStartMs = opts.tailStartMs ?? 3_947_900; // ~minuto 66, igual que el caso real
  const tailContent = opts.tailContent ?? 'Todas las sesiones las grabo y no me he preparado la sesión.';

  const segments: TranscriptSegment[] = [];

  const baseCount = 300;
  const baseStep = tailStartMs / baseCount;
  for (let i = 0; i < baseCount; i++) {
    const start = Math.round(i * baseStep);
    segments.push({
      startTime: start,
      endTime: start + 5000,
      speaker: i % 2 === 0 ? 'Speaker 1' : 'Speaker 2',
      content: 'Continuamos hablando del tema de la semana pasada.',
    });
  }

  // Si se pide un hueco largo, se desplaza TODO el bloque de cola 120s más tarde (por
  // encima del umbral de 90s) respecto al último turno base — un único hueco grande en el
  // límite base/cola, no huecos repetidos dentro de la cola.
  const tailBlockOffset = opts.includeLongGap ? 120_000 : 0;
  const tailCount = 20;
  const tailStep = 2000;
  for (let i = 0; i < tailCount; i++) {
    const start = tailStartMs + tailBlockOffset + i * tailStep;
    segments.push({
      startTime: start,
      endTime: start + 1500,
      speaker: 'Speaker 3',
      content: i === 0 ? tailContent : 'Hola, buenas tardes.',
    });
  }

  const recording: PlaudRecordingMeta = {
    fileId: 'f8beaedebbd7b4038648a704f21ba051',
    startAt: '2026-09-01T15:00:56.000Z',
    durationMs: totalDurationMs,
    serialNumber: '8810B30222359734',
  };

  return { recording, segments };
}

describe('detectSegmentation', () => {
  it('marca contains_multiple_sessions=true en el caso real verificado (cambio de speaker + marcador lingüístico en el mismo tramo final)', () => {
    // Caso real: archivo de 70 min iniciado a las 15:00:56 con un hablante nuevo hacia el
    // minuto 66, coincidiendo con el arranque textual de una primera consulta ("todas las
    // sesiones las grabo..."). Debe marcarse a revisión, nunca emparejarse en automático.
    const { recording, segments } = buildRecordingWithTailShift({});

    const result = detectSegmentation(recording, segments);

    expect(result.containsMultipleSessions).toBe(true);
    expect(result.signals).toContain('speaker_shift');
    expect(result.signals).toContain('linguistic_marker');
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.boundaries.length).toBeGreaterThan(0);
    expect(result.boundaries[0]).toBeGreaterThanOrEqual(3_900_000);
  });

  it('NO marca sospecha solo por un cambio de hablante sostenido sin ningún otro indicio (una sola señal nunca basta)', () => {
    const { recording, segments } = buildRecordingWithTailShift({ tailContent: 'Seguimos con la sesión, cuéntame más.' });

    const result = detectSegmentation(recording, segments);

    expect(result.signals).toContain('speaker_shift');
    expect(result.signals).not.toContain('linguistic_marker');
    expect(result.containsMultipleSessions).toBe(false);
  });

  it('el salto temporal largo por sí solo (sin cambio de speaker ni marcador) no dispara sospecha', () => {
    // Reproduce fielmente el archivo real: los timestamps eran casi continuos, así que esta
    // señal aislada nunca habría detectado el caso — se documenta aquí como señal débil.
    const segments: TranscriptSegment[] = [
      { startTime: 0, endTime: 5000, speaker: 'Speaker 1', content: 'Hola, empezamos.' },
      { startTime: 3_000_000, endTime: 3_005_000, speaker: 'Speaker 1', content: 'Seguimos con la sesión.' },
      { startTime: 3_200_000, endTime: 3_205_000, speaker: 'Speaker 1', content: 'Continuamos hablando.' },
    ];
    const recording: PlaudRecordingMeta = {
      fileId: 'gap-only',
      startAt: '2026-09-01T10:00:00.000Z',
      durationMs: 3_300_000,
      serialNumber: '8810B30222359734',
    };

    const result = detectSegmentation(recording, segments);

    expect(result.signals).toContain('long_gap');
    expect(result.containsMultipleSessions).toBe(false);
  });

  it('el gap largo SÍ correlaciona con un cambio de speaker en el mismo tramo final → sospecha', () => {
    const { recording, segments } = buildRecordingWithTailShift({
      tailContent: 'Seguimos con la sesión, cuéntame más.',
      includeLongGap: true,
    });

    const result = detectSegmentation(recording, segments);

    expect(result.signals).toContain('speaker_shift');
    expect(result.signals).toContain('long_gap');
    expect(result.containsMultipleSessions).toBe(true);
  });

  it('duración que excede holgadamente cualquier sesión clínica individual se registra como señal informativa, pero no basta sola', () => {
    const recording: PlaudRecordingMeta = {
      fileId: 'very-long',
      startAt: '2026-09-01T09:00:00.000Z',
      durationMs: 100 * 60_000, // 100 minutos, muy por encima del umbral de 75 min
      serialNumber: '8810B30222359734',
    };
    const segments: TranscriptSegment[] = [
      { startTime: 0, endTime: 5000, speaker: 'Speaker 1', content: 'Hola, buenas.' },
      { startTime: 10_000, endTime: 15_000, speaker: 'Speaker 2', content: 'Buenas tardes.' },
    ];

    const result = detectSegmentation(recording, segments);

    expect(result.signals).toContain('duration_excessive');
    expect(result.containsMultipleSessions).toBe(false);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(0.5);
  });

  it('transcripción vacía no lanza excepción y no genera sospecha', () => {
    const recording: PlaudRecordingMeta = {
      fileId: 'empty',
      startAt: '2026-09-01T09:00:00.000Z',
      durationMs: 1_800_000,
      serialNumber: '8810B30222359734',
    };

    const result = detectSegmentation(recording, []);

    expect(result.containsMultipleSessions).toBe(false);
    expect(result.score).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.boundaries).toEqual([]);
  });

  it('transcripción sin datos de hablante (speaker siempre null) no lanza excepción y no dispara el voto de speaker', () => {
    const segments: TranscriptSegment[] = Array.from({ length: 50 }, (_, i) => ({
      startTime: i * 10_000,
      endTime: i * 10_000 + 5000,
      speaker: null,
      content: 'Contenido sin diarizar.',
    }));
    const recording: PlaudRecordingMeta = {
      fileId: 'no-speaker-data',
      startAt: '2026-09-01T09:00:00.000Z',
      durationMs: 600_000,
      serialNumber: '8810B30222359734',
    };

    const result = detectSegmentation(recording, segments);

    expect(result.signals).not.toContain('speaker_shift');
    expect(result.containsMultipleSessions).toBe(false);
  });
});

describe('detectOverlaps', () => {
  it('caso real verificado (sesiones seguidas, protocolo correcto): 29,2s de hueco es contigüidad, NUNCA solapamiento', () => {
    // A: 2026-09-04T09:30:35.378 + 1.768.000ms termina 10:00:03.378; B empieza 10:00:32.611.
    // Este es exactamente el patrón esperado del protocolo del propietario (parar y arrancar
    // entre sesiones) — antes del arreglo, la tolerancia de 30s lo marcaba como solapamiento
    // y mandaba la grabación a revisión manual sin motivo.
    const { a, b } = REAL_CASE_CLEAN_PROTOCOL;

    const { overlaps, contiguities } = detectOverlaps([a, b]);

    expect(overlaps).toEqual([]);
    expect(contiguities).toHaveLength(1);
    expect(contiguities[0]).toMatchObject({ fileIdA: a.fileId, fileIdB: b.fileId, gapMs: 29_233 });
  });

  it('caso real verificado (archivo con dos pacientes dentro): 14s de hueco es contigüidad, NUNCA solapamiento — lo peligroso es el contenido, no el intervalo', () => {
    // A: 2026-09-01T15:00:56 + 4.185.000ms termina 16:10:41; B empieza 16:10:55. Antes del
    // arreglo, la tolerancia de 30s "cazaba" este archivo por casualidad marcándolo como
    // solapamiento; el arreglo lo saca de `overlaps` deliberadamente porque 14s de separación
    // NO es un solapamiento real. La sospecha correcta sobre este archivo debe venir de
    // `detectSegmentation` (speaker_shift + linguistic_marker en el tramo final de A), no de
    // aquí — ver el test de `detectSegmentation` para el mismo caso.
    const { a, b } = REAL_CASE_MULTI_SESSION_FILE;

    const { overlaps, contiguities } = detectOverlaps([a, b]);

    expect(overlaps).toEqual([]);
    expect(contiguities).toHaveLength(1);
    expect(contiguities[0]).toMatchObject({ fileIdA: a.fileId, fileIdB: b.fileId, gapMs: 14_000 });
  });

  it('un hueco de solo unos segundos (dentro del margen de deriva de reloj) SÍ se trata como solapamiento real', () => {
    // 3s es del orden de la deriva de reloj de un dispositivo, muy por debajo de cualquier
    // hueco de protocolo real (10-60s observados) — distingue el caso "mismo instante, reloj
    // impreciso" del caso "el usuario paró y arrancó la grabación".
    const recordings: PlaudRecordingMeta[] = [
      { fileId: 'a', startAt: '2026-09-01T15:00:00.000Z', durationMs: 3_000_000, serialNumber: '8810B30222359734' }, // termina 15:50:00
      { fileId: 'b', startAt: '2026-09-01T15:50:03.000Z', durationMs: 3_000_000, serialNumber: '8810B30222359734' }, // 3s después
    ];

    const { overlaps, contiguities } = detectOverlaps(recordings);

    expect(overlaps).toHaveLength(1);
    expect(contiguities).toEqual([]);
  });

  it('dos grabaciones separadas por más del margen de contigüidad no se reportan como relacionadas (ni solapamiento ni contigüidad)', () => {
    const recordings: PlaudRecordingMeta[] = [
      {
        fileId: 'a',
        startAt: '2026-09-01T15:00:00.000Z',
        durationMs: 3_000_000, // termina 15:50:00
        serialNumber: '8810B30222359734',
      },
      {
        fileId: 'b',
        startAt: '2026-09-01T16:10:00.000Z', // 20 min después, muy por encima del margen de 60s
        durationMs: 3_000_000,
        serialNumber: '8810B30222359734',
      },
    ];

    const { overlaps, contiguities } = detectOverlaps(recordings);

    expect(overlaps).toEqual([]);
    expect(contiguities).toEqual([]);
  });

  it('detecta un solapamiento real (las dos grabaciones estuvieron corriendo a la vez)', () => {
    const recordings: PlaudRecordingMeta[] = [
      {
        fileId: 'a',
        startAt: '2026-09-01T15:00:00.000Z',
        durationMs: 3_600_000, // termina 16:00:00
        serialNumber: '8810B30222359734',
      },
      {
        fileId: 'b',
        startAt: '2026-09-01T15:50:00.000Z', // arranca 10 min antes de que termine la primera
        durationMs: 3_000_000,
        serialNumber: '1788365203296',
      },
    ];

    const { overlaps, contiguities } = detectOverlaps(recordings);

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].overlapMs).toBeGreaterThan(0);
    expect(contiguities).toEqual([]);
  });
});

describe('detectSegmentation — caso real "archivo con dos pacientes dentro" sin la muleta de intervalos', () => {
  it('el archivo del 1-sep-2026 (16:10:41→16:10:55, 14s de contigüidad real) sigue detectándose por señales de CONTENIDO, no por intervalos', () => {
    // Verifica explícitamente que, al retirar la detección de solapamiento por intervalos
    // como "muleta" para este caso (ahora 14s es contigüidad, no solapamiento — ver
    // describe('detectOverlaps') más arriba), la segmentación por contenido sigue bastando
    // por sí sola: cambio de speaker sostenido + marcador lingüístico de apertura en el
    // mismo tramo final de A. Si este test fallara, significaría que la segmentación por
    // contenido dependía en la práctica de la señal de intervalos para este caso concreto.
    const { recording, segments } = buildRecordingWithTailShift({});

    const result = detectSegmentation(recording, segments);

    expect(result.containsMultipleSessions).toBe(true);
    expect(result.signals).toContain('speaker_shift');
    expect(result.signals).toContain('linguistic_marker');
  });
});
