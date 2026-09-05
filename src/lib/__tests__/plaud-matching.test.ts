import { describe, expect, it } from 'vitest';
import { matchRecordingToSession, type CandidateSession, type PlaudRecordingMeta } from '@/lib/plaud-matching';
import type { ContiguityPair, OverlapPair, SegmentationResult } from '@/lib/plaud-segmentation';

const DEVICE_SERIAL = '8810B30222359734';

function recording(overrides: Partial<PlaudRecordingMeta> = {}): PlaudRecordingMeta {
  return {
    fileId: 'file-1',
    startAt: '2026-09-01T15:00:56.000Z',
    durationMs: 3_000_000, // 50 min
    serialNumber: DEVICE_SERIAL,
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateSession> = {}): CandidateSession {
  return {
    sessionId: 'session-1',
    patientId: 'patient-1',
    startAt: '2026-09-01T15:00:00.000Z',
    durationMin: 50,
    ...overrides,
  };
}

describe('matchRecordingToSession — bloqueo duro por segmentación/solapamiento', () => {
  it('caso real verificado: segmentación sospechosa fuerza revisión y anula la confianza aunque el score temporal sea casi perfecto', () => {
    const rec = recording({
      fileId: 'f8beaedebbd7b4038648a704f21ba051',
      startAt: '2026-09-01T15:00:56.000Z',
      durationMs: 4_185_000, // 69m45s, exactamente el caso real
    });
    // Candidata que encajaría casi perfectamente en tiempo (56s de diferencia) si se
    // ignorase la sospecha de segmentación.
    const candidates = [candidate({
      sessionId: 'session-1500',
      patientId: 'patient-A',
      startAt: '2026-09-01T15:00:00.000Z',
      durationMin: 50,
    })];
    const segmentation: SegmentationResult = {
      containsMultipleSessions: true,
      score: 0.6,
      signals: ['speaker_shift', 'linguistic_marker'],
      boundaries: [3_947_900],
    };

    const result = matchRecordingToSession(rec, candidates, { segmentation });

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.reasons).toContain('possible_multi_session');
    // La mejor candidata se conserva como SUGERENCIA para la bandeja de revisión, nunca
    // como asignación automática (confidence ya está anulada arriba).
    expect(result.sessionId).toBe('session-1500');
    expect(result.patientId).toBe('patient-A');
  });

  it('ninguna combinación de señales de score puede saltarse el bloqueo por segmentación, ni con match temporal perfecto', () => {
    const rec = recording();
    const candidates = [candidate()]; // tiempo y duración exactos, único candidato
    const segmentation: SegmentationResult = {
      containsMultipleSessions: true,
      score: 0.9,
      signals: ['speaker_shift', 'linguistic_marker', 'long_gap'],
      boundaries: [100],
    };

    const result = matchRecordingToSession(rec, candidates, { segmentation });

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it('solapamiento entre archivos: AMBOS archivos quedan a revisión aunque cada uno tenga una candidata perfecta', () => {
    const recA = recording({ fileId: 'file-A', startAt: '2026-09-01T15:00:00.000Z', durationMs: 3_000_000 });
    const recB = recording({ fileId: 'file-B', startAt: '2026-09-01T15:50:00.000Z', durationMs: 3_000_000 });
    const overlaps: OverlapPair[] = [{ fileIdA: 'file-A', fileIdB: 'file-B', overlapMs: 5000 }];

    const resultA = matchRecordingToSession(
      recA,
      [candidate({ sessionId: 'session-A', patientId: 'patient-A', startAt: recA.startAt, durationMin: 50 })],
      { overlaps },
    );
    const resultB = matchRecordingToSession(
      recB,
      [candidate({ sessionId: 'session-B', patientId: 'patient-B', startAt: recB.startAt, durationMin: 50 })],
      { overlaps },
    );

    for (const result of [resultA, resultB]) {
      expect(result.requiresReview).toBe(true);
      expect(result.confidence).toBe(0);
      expect(result.reasons).toContain('overlap_detected');
    }
  });

  it('una segmentación "limpia" explícita (sin sospecha) no fuerza revisión por sí sola', () => {
    const rec = recording();
    const candidates = [candidate()];
    const segmentation: SegmentationResult = {
      containsMultipleSessions: false,
      score: 0,
      signals: [],
      boundaries: [],
    };

    const result = matchRecordingToSession(rec, candidates, { segmentation });

    expect(result.requiresReview).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.reasons).toContain('matched_auto');
  });
});

describe('matchRecordingToSession — contigüidad (hueco pequeño) NUNCA es motivo de bloqueo por sí sola', () => {
  it('caso real verificado (sesiones seguidas, protocolo correcto, 29,2s de hueco): NO se bloquea, se empareja en automático', () => {
    // A: 2026-09-04T09:30:35.378 + 1.768.000ms termina 10:00:03.378; B empieza 10:00:32.611,
    // 29,2s después — justo el protocolo esperado. Antes del arreglo, la tolerancia de 30s
    // habría marcado esto como solapamiento y forzado revisión sin motivo real.
    const rec = recording({
      fileId: 'sesion-seguida-B',
      startAt: '2026-09-04T10:00:32.611Z',
      durationMs: 3_000_000,
    });
    const contiguities: ContiguityPair[] = [
      { fileIdA: 'sesion-seguida-A', fileIdB: 'sesion-seguida-B', gapMs: 29_233 },
    ];
    const cand = candidate({ startAt: rec.startAt, durationMin: 50 });

    const result = matchRecordingToSession(rec, [cand], { contiguities, overlaps: [] });

    expect(result.requiresReview).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.reasons).toContain('matched_auto');
  });

  it('una contigüidad expuesta en `opts.contiguities` no aparece en `opts.overlaps` y por tanto no dispara `overlap_detected` ni bloquea', () => {
    const rec = recording();
    const contiguities: ContiguityPair[] = [
      { fileIdA: rec.fileId, fileIdB: 'otro-archivo', gapMs: 14_000 },
    ];

    const result = matchRecordingToSession(rec, [candidate()], { contiguities });

    expect(result.requiresReview).toBe(false);
    expect(result.reasons).not.toContain('overlap_detected');
    expect(result.reasons).toContain('contiguous_recording');
  });

  it('contigüidad + segmentación sospechosa a la vez: el bloqueo lo dispara la segmentación, y la razón de contigüidad queda expuesta como refuerzo de contexto (nunca como causa por sí sola)', () => {
    const rec = recording();
    const contiguities: ContiguityPair[] = [
      { fileIdA: rec.fileId, fileIdB: 'otro-archivo', gapMs: 14_000 },
    ];
    const segmentation: SegmentationResult = {
      containsMultipleSessions: true,
      score: 0.6,
      signals: ['speaker_shift', 'linguistic_marker'],
      boundaries: [100],
    };

    const result = matchRecordingToSession(rec, [candidate()], { segmentation, contiguities });

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.reasons).toContain('possible_multi_session');
    expect(result.reasons).toContain('contiguous_recording');
  });
});

describe('matchRecordingToSession — emparejamiento por proximidad temporal y duración', () => {
  it('grabación limpia con una única candidata que encaja en tiempo y duración: alta confianza, sin revisión', () => {
    const rec = recording();
    const result = matchRecordingToSession(rec, [candidate()]);

    expect(result.requiresReview).toBe(false);
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
    expect(result.sessionId).toBe('session-1');
    expect(result.patientId).toBe('patient-1');
    expect(result.reasons).toContain('matched_auto');
  });

  it('sin ninguna cita candidata ese día: revisión, sin sugerencia posible', () => {
    const rec = recording();
    const result = matchRecordingToSession(rec, []);

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.sessionId).toBeNull();
    expect(result.patientId).toBeNull();
    expect(result.reasons).toContain('no_session_that_day');
  });

  it('sesiones consecutivas el mismo día con menos de una hora entre ellas: la grabación cae entre ambas → revisión por ambigüedad', () => {
    const rec = recording({ startAt: '2026-09-01T15:25:00.000Z', durationMs: 50 * 60_000 });
    const candidateA = candidate({
      sessionId: 'session-early',
      patientId: 'patient-early',
      startAt: '2026-09-01T15:00:00.000Z',
      durationMin: 50,
    });
    const candidateB = candidate({
      sessionId: 'session-late',
      patientId: 'patient-late',
      startAt: '2026-09-01T15:50:00.000Z', // 50 min después de la anterior, <1h de separación
      durationMin: 50,
    });

    const result = matchRecordingToSession(rec, [candidateA, candidateB]);

    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain('ambiguous_candidates');
  });

  it('dos candidatas de alta confianza pero sin margen suficiente entre ellas: revisión (el margen de 0.25 hace su trabajo)', () => {
    const rec = recording({ startAt: '2026-09-01T15:05:00.000Z', durationMs: 50 * 60_000 });
    // Ambas candidatas encajan razonablemente bien en tiempo y exactamente en duración —
    // sus scores individuales superarían 0.85, pero están demasiado cerca entre sí.
    const candidateA = candidate({
      sessionId: 'session-a',
      patientId: 'patient-a',
      startAt: '2026-09-01T15:00:00.000Z', // 5 min de diferencia
      durationMin: 50,
    });
    const candidateB = candidate({
      sessionId: 'session-b',
      patientId: 'patient-b',
      startAt: '2026-09-01T14:57:00.000Z', // 8 min de diferencia
      durationMin: 50,
    });

    const result = matchRecordingToSession(rec, [candidateA, candidateB]);

    expect(result.requiresReview).toBe(true);
    expect(result.reasons).toContain('ambiguous_candidates');
  });

  it('duración que excede mucho lo agendado: penaliza el score y evita el emparejamiento automático incluso con tiempo perfecto', () => {
    const rec = recording({ startAt: '2026-09-01T15:00:00.000Z', durationMs: 70 * 60_000 }); // 70 min
    const result = matchRecordingToSession(rec, [candidate({ startAt: rec.startAt, durationMin: 50 })]); // cita de 50 min

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBeLessThan(0.85);
    expect(result.reasons).toContain('duration_exceeds_scheduled');
  });

  it('sin candidato claro tras aplicar la penalización, la confianza no llega al umbral ni con un único candidato', () => {
    const rec = recording({ startAt: '2026-09-01T15:00:00.000Z', durationMs: 90 * 60_000 }); // 90 min
    const result = matchRecordingToSession(rec, [candidate({ startAt: rec.startAt, durationMin: 45 })]);

    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBeLessThan(0.85);
  });
});
