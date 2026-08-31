import { describe, expect, it } from 'vitest';
import {
  attributePaymentsToProfessionals,
  calculateCompensationAmount,
  type BonoItemForAttribution,
  type InvoiceItemForAttribution,
  type PaymentForAttribution,
  type SessionForAttribution,
} from '@/lib/expense-compensation';

describe('attributePaymentsToProfessionals', () => {
  it('attributes a payment linked directly to a session to that session\'s professional', () => {
    const sessions: SessionForAttribution[] = [{ id: 's1', professionalId: 'prof-a' }];
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 100, sessionId: 's1', invoiceId: null }];

    const result = attributePaymentsToProfessionals(payments, sessions, [], []);

    expect(result.byProfessional).toEqual({ 'prof-a': 100 });
    expect(result.unattributed).toBe(0);
  });

  it('attributes an invoice-linked payment to the session referenced by its line item', () => {
    const sessions: SessionForAttribution[] = [{ id: 's1', professionalId: 'prof-a' }];
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 60, sessionId: null, invoiceId: 'inv-1' }];
    const invoiceItems: InvoiceItemForAttribution[] = [
      { invoiceId: 'inv-1', total: 60, sessionId: 's1', bonoId: null },
    ];

    const result = attributePaymentsToProfessionals(payments, sessions, invoiceItems, []);

    expect(result.byProfessional).toEqual({ 'prof-a': 60 });
  });

  it('splits an invoice payment proportionally across multiple line items', () => {
    const sessions: SessionForAttribution[] = [
      { id: 's1', professionalId: 'prof-a' },
      { id: 's2', professionalId: 'prof-b' },
    ];
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 90, sessionId: null, invoiceId: 'inv-1' }];
    const invoiceItems: InvoiceItemForAttribution[] = [
      { invoiceId: 'inv-1', total: 30, sessionId: 's1', bonoId: null },
      { invoiceId: 'inv-1', total: 60, sessionId: 's2', bonoId: null },
    ];

    const result = attributePaymentsToProfessionals(payments, sessions, invoiceItems, []);

    expect(result.byProfessional['prof-a']).toBe(30);
    expect(result.byProfessional['prof-b']).toBe(60);
    expect(result.unattributed).toBe(0);
  });

  it('prorates a bono payment between two professionals by their share of consumed sessions (edge case)', () => {
    // A bono with 10 consumed sessions: 6 attended by prof-a, 4 by prof-b.
    const sessions: SessionForAttribution[] = [
      ...Array.from({ length: 6 }, (_, i) => ({ id: `a-session-${i}`, professionalId: 'prof-a' })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: `b-session-${i}`, professionalId: 'prof-b' })),
    ];
    const bonoItems: BonoItemForAttribution[] = sessions.map((s) => ({ bonoId: 'bono-1', sessionId: s.id }));
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 500, sessionId: null, invoiceId: 'inv-1' }];
    const invoiceItems: InvoiceItemForAttribution[] = [
      { invoiceId: 'inv-1', total: 500, sessionId: null, bonoId: 'bono-1' },
    ];

    const result = attributePaymentsToProfessionals(payments, sessions, invoiceItems, bonoItems);

    expect(result.byProfessional['prof-a']).toBe(300); // 500 * 6/10
    expect(result.byProfessional['prof-b']).toBe(200); // 500 * 4/10
    expect(result.unattributed).toBe(0);
  });

  it('marks a payment as unattributed when its session cannot be resolved', () => {
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 40, sessionId: 'missing-session', invoiceId: null }];

    const result = attributePaymentsToProfessionals(payments, [], [], []);

    expect(result.byProfessional).toEqual({});
    expect(result.unattributed).toBe(40);
  });

  it('marks an invoice line with neither session nor bono as unattributed', () => {
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 25, sessionId: null, invoiceId: 'inv-1' }];
    const invoiceItems: InvoiceItemForAttribution[] = [
      { invoiceId: 'inv-1', total: 25, sessionId: null, bonoId: null },
    ];

    const result = attributePaymentsToProfessionals(payments, [], invoiceItems, []);

    expect(result.unattributed).toBe(25);
  });

  it('marks a payment with no session_id and no invoice_id as unattributed', () => {
    const payments: PaymentForAttribution[] = [{ id: 'p1', amount: 15, sessionId: null, invoiceId: null }];

    const result = attributePaymentsToProfessionals(payments, [], [], []);

    expect(result.unattributed).toBe(15);
  });
});

describe('calculateCompensationAmount', () => {
  it('returns the fixed amount for type=fixed regardless of collected total', () => {
    expect(calculateCompensationAmount('fixed', 500, 40, 10000)).toBe(500);
  });

  it('returns the percentage of the collected total for type=percentage', () => {
    expect(calculateCompensationAmount('percentage', 0, 40, 1000)).toBe(400);
  });

  it('returns fixed + percentage for type=mixed', () => {
    expect(calculateCompensationAmount('mixed', 200, 10, 1000)).toBe(300);
  });

  it('rounds to two decimals', () => {
    expect(calculateCompensationAmount('percentage', 0, 33.33, 100)).toBe(33.33);
  });
});
