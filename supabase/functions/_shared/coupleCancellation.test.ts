import { describe, expect, it, vi } from 'vitest';

vi.mock('./adminAlerts.ts', () => ({ buildAlertMessage: vi.fn(), formatDateSpanish: vi.fn(), formatTime: vi.fn(), sendAdminAlert: vi.fn() }));
vi.mock('./bookingPatientNotifications.ts', () => ({ queueAndSendPatientBookingNotification: vi.fn() }));
vi.mock('./cancellationPolicy.ts', () => ({ isCancellationPolicyEnabled: vi.fn(), resolveSignedCancellationPolicyVersionForSession: vi.fn() }));

import { computeCoupleCancellationDeadline } from './coupleCancellation';

const H = 60 * 60 * 1000;
const session = new Date('2026-10-10T10:00:00Z');

describe('computeCoupleCancellationDeadline', () => {
  it('con tiempo de sobra, el plazo es 24 h antes de la cita', () => {
    const now = new Date(session.getTime() - 5 * 24 * H);
    expect(computeCoupleCancellationDeadline(session, now)?.toISOString())
      .toBe(new Date(session.getTime() - 24 * H).toISOString());
  });

  it('si cancela con menos de 24 h, da al menos 4 h para responder', () => {
    const now = new Date(session.getTime() - 20 * H);
    expect(computeCoupleCancellationDeadline(session, now)?.toISOString())
      .toBe(new Date(now.getTime() + 4 * H).toISOString());
  });

  it('nunca pasa de 1 h antes de la cita', () => {
    const now = new Date(session.getTime() - 3 * H);
    expect(computeCoupleCancellationDeadline(session, now)?.toISOString())
      .toBe(new Date(session.getTime() - 1 * H).toISOString());
  });

  it('con menos de 1 h para la cita no hay plazo: se cancela para los dos', () => {
    const now = new Date(session.getTime() - 30 * 60 * 1000);
    expect(computeCoupleCancellationDeadline(session, now)).toBeNull();
  });
});
