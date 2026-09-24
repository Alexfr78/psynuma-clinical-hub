import { describe, expect, it, vi } from 'vitest';
import { getSessionRecipients, patientSessionFilter, recipientsFor } from './sessionRecipients';

const payer = { id: 'payer', center_id: 'center', first_name: 'Ana', last_name: 'A', email: 'ana@example.com', phone: null };
const partner = { ...payer, id: 'partner', first_name: 'Luis', email: null, phone: '600000001' };

function client(participants: object[], error: object | null = null) {
  const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  return { queries, from: vi.fn((table: string) => {
    const query = { table, filters: [] as Array<[string, unknown]> };
    queries.push(query);
    const result = table === 'sessions'
      ? { data: { patient_id: payer.id, center_id: payer.center_id, patient: payer }, error: null }
      : { data: participants, error };
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn((key: string, value: unknown) => { query.filters.push([key, value]); return builder; }),
      single: vi.fn(async () => result),
      then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return builder;
  }) };
}

describe('session recipients', () => {
  it('keeps individual appointments private even when the patient has a partner elsewhere', async () => {
    const db = client([]);
    const recipients = await getSessionRecipients(db, 'individual');
    expect(recipients.map(r => [r.patientId, r.isPayer])).toEqual([['payer', true]]);
    expect(db.queries.map(q => q.table)).toEqual(['sessions', 'session_participants']);
    expect(db.queries[1].filters).toContainEqual(['session_id', 'individual']);
    expect(db.queries[1].filters).toContainEqual(['center_id', 'center']);
  });

  it('puts the payer first and sends payment notices only to them', async () => {
    const recipients = await getSessionRecipients(client([{ patient: partner }]), 'couple');
    expect(recipientsFor('appointment', recipients).map(r => r.patientId)).toEqual(['payer', 'partner']);
    expect(recipientsFor('payment', recipients).map(r => r.patientId)).toEqual(['payer']);
    expect(recipients[1].phone).toBe(partner.phone);
  });

  it('deduplicates participants and excludes patients from another center', async () => {
    const recipients = await getSessionRecipients(client([
      { patient: payer }, { patient: [partner] }, { patient: partner },
      { patient: { ...partner, id: 'foreign', center_id: 'other-center' } }, { patient: null },
    ]), 'couple');
    expect(recipients.map(r => r.patientId)).toEqual(['payer', 'partner']);
  });

  it('fails closed on membership lookup errors', async () => {
    const error = { message: 'membership unavailable' };
    await expect(getSessionRecipients(client([], error), 'couple')).rejects.toEqual(error);
    await expect(patientSessionFilter(client([], error), 'partner', 'center')).rejects.toEqual(error);
  });

  it('limits portal access to owned sessions and explicitly joined sessions', async () => {
    const db = client([{ session_id: 'couple' }]);
    expect(await patientSessionFilter(db, 'partner', 'center')).toBe('patient_id.eq.partner,id.in.(couple)');
    expect(db.queries[0].filters).toEqual([['patient_id', 'partner'], ['center_id', 'center']]);
    expect(await patientSessionFilter(client([]), 'partner', 'center')).toBe('patient_id.eq.partner');
  });
});
