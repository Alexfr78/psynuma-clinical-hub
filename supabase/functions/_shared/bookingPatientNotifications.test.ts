import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queueAndSendPatientBookingNotification } from './bookingPatientNotifications';

vi.mock('./advancePaymentNotifications.ts', () => ({
  buildAdvancePaymentBlock: vi.fn(async () => ({ hasPaymentInstructions: true, block: 'PAGO PRIVADO: 90 EUR https://pay.example.test/payer' })),
  markAdvancePaymentNotificationFailed: vi.fn(), markAdvancePaymentNotificationSent: vi.fn(),
}));
vi.mock('./publicShortLinks.ts', () => ({
  getOrCreatePublicShortLink: vi.fn(async () => '/enlace/payer-secret'),
}));
vi.mock('./bookingTemplates.ts', () => ({
  renderBookingTemplate: vi.fn(async (_db, _center, event, _audience, _channel, vars) => ({
    subject: event, message: `${vars.nombre_paciente}: ${event} ${vars.fecha} ${vars.link_sesion}`,
  })),
}));

function client(failPartner = false, metaOnly = false) {
  const patients = [
    { id: 'payer', center_id: 'center', first_name: 'Ana', last_name: 'A', email: 'ana@example.test', phone: null },
    { id: 'partner', center_id: 'center', first_name: 'Luis', last_name: 'B', email: metaOnly ? null : 'luis@example.test', phone: metaOnly ? '600000001' : null },
  ];
  const inserted: Array<Record<string, unknown>> = [];
  const db = { inserted, functions: { invoke: vi.fn(async () => ({ error: null })) }, from(table: string) {
    let id: string | undefined;
    let payload: Record<string, unknown> | undefined;
    const result = () => {
      if (table === 'notifications') {
        if (failPartner && payload?.patient_id === 'partner') return { data: null, error: { message: 'insert failed' } };
        return { data: { id: `notice-${payload?.patient_id}` }, error: null };
      }
      const data = table === 'centers' ? { id: 'center', name: 'Centro', portal_slug: 'centro', public_domain: 'example.test', whatsapp_send_method: metaOnly ? 'api' : 'web', whatsapp_access_token: 'token', whatsapp_phone_number_id: 'number', wasender_confirm_booking: true }
        : table === 'patients' ? patients.find(patient => patient.id === id)
        : table === 'sessions' ? { center_id: 'center', patient_id: 'payer', patient: patients[0], session_date: '2026-10-01', start_time: '10:00', access_token: 'payer-secret' }
        : table === 'session_participants' ? [{ patient: patients[1] }] : null;
      return { data, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (key: string, value: string) => { if (key === 'id') id = value; return builder; },
      insert: (value: Record<string, unknown>) => { payload = value; inserted.push(value); return builder; },
      single: async () => result(), maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
  } };
  return db;
}

beforeEach(() => {
  vi.stubGlobal('setTimeout', (callback: () => void) => { callback(); return 0; });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('booking notification fan-out', () => {
  it.each(['created', 'rescheduled', 'cancelled'] as const)('sends %s to both, with payment data and the personal manage link only in the payer message', async (eventType) => {
    const db = client();
    expect(await queueAndSendPatientBookingNotification({
      supabase: db, centerId: 'center', patientId: 'partner', sessionId: 'couple', eventType,
      includeAdvancePaymentBlock: true, extraMessage: 'Cargo privado: 25 EUR', manageUrl: '/book/centro/manage?token=payer-secret',
    })).toBe(true);
    expect(db.inserted.map(row => row.patient_id)).toEqual(['payer', 'partner']);
    expect(db.inserted[0].message).toContain('Cargo privado');
    if (eventType === 'created') expect(db.inserted[0].message).toContain('PAGO PRIVADO');
    expect(db.inserted[1].message).toContain('Luis');
    // El enlace de la cita es común a los dos; el de gestión de reservas es personal del titular.
    if (eventType !== 'cancelled') expect(db.inserted[1].message).toContain('/enlace/');
    expect(db.inserted[1].message).not.toContain('/book/centro/manage');
    expect(db.inserted[1].message).not.toMatch(/privado|PRIVADO|EUR/);
    expect(db.inserted[1].recipient).toBe('luis@example.test');
    expect(db.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it('sends WhatsApp through Meta to a phone-only participant, like to the payer', async () => {
    const db = client(false, true);
    expect(await queueAndSendPatientBookingNotification({ supabase: db, centerId: 'center', patientId: 'payer', sessionId: 'couple', eventType: 'created' })).toBe(true);
    expect(db.inserted[1]).toMatchObject({ patient_id: 'partner', type: 'whatsapp', recipient: '600000001' });
    expect(db.inserted[1].message).not.toMatch(/PRIVADO|EUR/);
    expect(db.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not undo the payer result if queuing the participant fails', async () => {
    const db = client(true);
    expect(await queueAndSendPatientBookingNotification({ supabase: db, centerId: 'center', patientId: 'payer', sessionId: 'couple', eventType: 'cancelled' })).toBe(true);
    expect(db.functions.invoke).toHaveBeenCalledTimes(1);
  });
});
