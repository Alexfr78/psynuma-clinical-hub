import { describe, expect, it } from 'vitest';
import {
  describePrimaryReviewReasons,
  describeSegmentBoundaries,
  describeSegmentationSignals,
  describeSuggestionDetails,
  formatConfidencePct,
  formatDurationMs,
  formatOffset,
} from '@/components/plaud/plaudReviewLabels';

describe('describePrimaryReviewReasons', () => {
  it('traduce los códigos de bloqueo a frases en español, ignorando los que no son de bloqueo', () => {
    const labels = describePrimaryReviewReasons([
      'time_proximity',
      'possible_multi_session',
      'requires_human_review',
      'matched_auto',
    ]);
    expect(labels).toEqual(['Puede contener más de una sesión.']);
  });

  it('devuelve varias frases cuando coinciden varios motivos', () => {
    const labels = describePrimaryReviewReasons(['overlap_detected', 'ambiguous_candidates']);
    expect(labels).toHaveLength(2);
    expect(labels).toContain('Se solapa en el tiempo con otra grabación.');
    expect(labels).toContain('Hay más de una cita que encaja igual de bien.');
  });

  it('devuelve una lista vacía si no hay motivos reconocidos, sin lanzar sobre entradas raras', () => {
    expect(describePrimaryReviewReasons(null)).toEqual([]);
    expect(describePrimaryReviewReasons(undefined)).toEqual([]);
    expect(describePrimaryReviewReasons('no_es_un_array' as unknown as string[])).toEqual([]);
    expect(describePrimaryReviewReasons(['codigo_desconocido'])).toEqual([]);
  });
});

describe('describeSuggestionDetails', () => {
  it('traduce las señales de por qué se sugiere una candidata, no las de bloqueo', () => {
    const labels = describeSuggestionDetails(['time_proximity', 'duration_exceeds_scheduled', 'possible_multi_session']);
    expect(labels).toEqual([
      'Empieza casi a la misma hora que la cita.',
      'Dura notablemente más de lo agendado — puede llevar contenido de más.',
    ]);
  });
});

describe('describeSegmentationSignals', () => {
  it('traduce cada señal técnica a una frase describiendo lo observado en el audio', () => {
    const result = describeSegmentationSignals(['speaker_shift', 'linguistic_marker']);
    expect(result).toEqual([
      { code: 'speaker_shift', label: 'El interlocutor que domina la conversación cambia de forma sostenida hacia el final del archivo.' },
      { code: 'linguistic_marker', label: 'Se han detectado frases típicas de empezar una sesión nueva (presentación, motivo de consulta) en el tramo final.' },
    ]);
  });

  it('nunca expone el texto original de la transcripción, solo los códigos ya traducidos', () => {
    const result = describeSegmentationSignals(['speaker_shift']);
    expect(JSON.stringify(result)).not.toMatch(/paciente|dijo|transcri/i);
  });
});

describe('formatOffset', () => {
  it('formatea milisegundos como mm:ss por debajo de una hora', () => {
    expect(formatOffset(0)).toBe('0:00');
    expect(formatOffset(65_000)).toBe('1:05');
    expect(formatOffset(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('formatea como h:mm:ss a partir de una hora', () => {
    expect(formatOffset(60 * 60_000)).toBe('1:00:00');
    expect(formatOffset(3 * 3_600_000 + 5 * 60_000 + 9_000)).toBe('3:05:09');
  });
});

describe('describeSegmentBoundaries', () => {
  it('convierte cada límite de ms a su marca de tiempo legible', () => {
    expect(describeSegmentBoundaries([0, 65_000, 3_600_000])).toEqual(['0:00', '1:05', '1:00:00']);
  });

  it('ignora entradas que no son números', () => {
    expect(describeSegmentBoundaries(['no-es-numero' as unknown as number, 1000])).toEqual(['0:01']);
    expect(describeSegmentBoundaries(null)).toEqual([]);
  });
});

describe('formatDurationMs', () => {
  it('muestra solo minutos por debajo de una hora', () => {
    expect(formatDurationMs(50 * 60_000)).toBe('50 min');
  });

  it('muestra horas y minutos por encima de una hora', () => {
    expect(formatDurationMs(90 * 60_000)).toBe('1 h 30 min');
    expect(formatDurationMs(120 * 60_000)).toBe('2 h');
  });
});

describe('formatConfidencePct', () => {
  it('redondea a porcentaje entero', () => {
    expect(formatConfidencePct(0.851)).toBe('85%');
    expect(formatConfidencePct(1)).toBe('100%');
    expect(formatConfidencePct(0)).toBe('0%');
  });

  it('muestra un guion cuando no hay confianza calculada', () => {
    expect(formatConfidencePct(null)).toBe('—');
    expect(formatConfidencePct(Number.NaN)).toBe('—');
  });
});
