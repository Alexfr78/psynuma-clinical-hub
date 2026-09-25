import { describe, expect, it } from 'vitest';
import { describeLateChange, sessionHasStarted } from '../../../supabase/functions/_shared/lateChange';
import { evaluateCancellationCharge } from '../../../supabase/functions/_shared/paymentRules';

// Sesión a las 17:30 hora de Madrid del 24-sep-2026 (CEST, UTC+2) = 15:30 UTC.
const SESSION = { sessionDate: '2026-09-24', startTime: '17:30:00' };
const RULES = { cancellation_window_hours: 24, late_cancel_penalty_percentage: 50, no_show_percentage: 100 };

function evaluate(now: Date, basePrice: number) {
  return evaluateCancellationCharge({
    rules: RULES,
    sessionStartsAt: new Date('2026-09-24T15:30:00Z'),
    cancelledAt: now,
    basePrice,
  });
}

describe('sessionHasStarted', () => {
  it('usa la hora de Madrid, no UTC', () => {
    expect(sessionHasStarted(SESSION.sessionDate, SESSION.startTime, new Date('2026-09-24T15:25:00Z'))).toBe(false);
    // 17:31 en Madrid: ya empezó (antes se tomaba 17:30 como UTC y daba dos horas de más).
    expect(sessionHasStarted(SESSION.sessionDate, SESSION.startTime, new Date('2026-09-24T15:31:00Z'))).toBe(true);
  });
});

describe('describeLateChange', () => {
  it('fuera de la ventana no es cambio tardío', () => {
    const now = new Date('2026-09-22T10:00:00Z');
    const info = describeLateChange({ ...SESSION, rules: RULES, evaluation: evaluate(now, 60), now });
    expect(info.isLate).toBe(false);
    expect(info.cancelMessage).toBeNull();
  });

  it('primera consulta gratuita cinco minutos antes: consumida aunque el cargo sea 0 €', () => {
    const now = new Date('2026-09-24T15:25:00Z');
    const info = describeLateChange({
      ...SESSION,
      sessionTypeName: 'Primera consulta',
      rules: RULES,
      evaluation: evaluate(now, 0),
      now,
    });
    expect(info.isLate).toBe(true);
    expect(info.started).toBe(false);
    expect(info.cancelMessage).toContain('menos de 24 h');
    expect(info.cancelMessage).toContain('«Primera consulta» cuenta como utilizada');
    expect(info.rescheduleMessage).toContain('el centro revisará la nueva cita');
  });

  it('sesión de pago: indica el cargo según la política', () => {
    const now = new Date('2026-09-24T10:00:00Z');
    const info = describeLateChange({ ...SESSION, rules: RULES, evaluation: evaluate(now, 60), now });
    expect(info.isLate).toBe(true);
    expect(info.cancelMessage).toContain('30,00 €');
  });

  it('ya empezada: no se ofrece como cambio tardío (se bloquea)', () => {
    const now = new Date('2026-09-24T15:55:00Z');
    const info = describeLateChange({ ...SESSION, rules: RULES, evaluation: evaluate(now, 0), now });
    expect(info.started).toBe(true);
    expect(info.isLate).toBe(false);
  });
});
