import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { qk, invalidateKeys, MONEY_KEYS, PAYMENT_INVOICE_KEYS, BONO_KEYS, BONO_DEBT_KEYS, CANCELLATION_MONEY_KEYS, TARIFF_PRICE_KEYS } from '@/lib/query-keys';

describe('query keys de dinero', () => {
  const filters = { patientId: 'patient-1', status: 'pending', search: 'Ana' };
  const range = { from: 20, to: 39 };
  const profile = { center_id: 'center-1' };
  const centerId = 'center-1';
  const patientId = 'patient-1';
  const sessionId = 'session-1';
  const bonoId = 'bono-1';
  const targetType = 'session_type';
  const targetId = 'type-1';
  const referenceDate = '2026-10-01';
  const showArchived = true;
  const status = 'pending_review';

  it('qk.invoices.all conserva la clave original', () => {
    expect(qk.invoices.all).toEqual(['invoices']);
  });

  it('qk.payments.all conserva la clave original', () => {
    expect(qk.payments.all).toEqual(['payments']);
  });

  it('qk.debts.all conserva la clave original', () => {
    expect(qk.debts.all).toEqual(['debts']);
  });

  it('qk.paymentStats.all conserva la clave original', () => {
    expect(qk.paymentStats.all).toEqual(['payment-stats']);
  });

  it('qk.debtStats.all conserva la clave original', () => {
    expect(qk.debtStats.all).toEqual(['debt-stats']);
  });

  it('qk.bonoSessions.byBono conserva la clave original', () => {
    expect(qk.bonoSessions.byBono(bonoId)).toEqual(['bono-sessions', bonoId]);
  });

  it('qk.bonos.all conserva la clave original', () => {
    expect(qk.bonos.all).toEqual(['bonos']);
  });

  it('qk.billableEvents.all conserva la clave original', () => {
    expect(qk.billableEvents.all).toEqual(['billable-events']);
  });

  it('qk.bonoSessions.all conserva la clave original', () => {
    expect(qk.bonoSessions.all).toEqual(['bono-sessions']);
  });

  it('qk.patientActiveBonos.all conserva la clave original', () => {
    expect(qk.patientActiveBonos.all).toEqual(['patient-active-bonos']);
  });

  it('qk.sessionPaymentStatus.all conserva la clave original', () => {
    expect(qk.sessionPaymentStatus.all).toEqual(['session-payment-status']);
  });

  it('qk.patientActiveBonos.byPatient conserva la clave original', () => {
    expect(qk.patientActiveBonos.byPatient(patientId)).toEqual(['patient-active-bonos', patientId]);
  });

  it('qk.bonos.list conserva la clave original', () => {
    expect(qk.bonos.list(filters)).toEqual(['bonos', filters]);
  });

  it('qk.bonos.stats conserva la clave original', () => {
    expect(qk.bonos.stats(patientId, profile?.center_id)).toEqual(['bonos', 'stats', patientId, profile?.center_id]);
  });

  it('qk.bonos.page conserva la clave original', () => {
    expect(qk.bonos.page(filters, range.from, range.to, profile?.center_id)).toEqual(['bonos', 'page', filters, range.from, range.to, profile?.center_id]);
  });

  it('qk.cancellationCharges.all conserva la clave original', () => {
    expect(qk.cancellationCharges.all).toEqual(['cancellation-charges']);
  });

  it('qk.cancellationCharges.list conserva la clave original', () => {
    expect(qk.cancellationCharges.list(profile?.center_id, status)).toEqual(['cancellation-charges', profile?.center_id, status]);
  });

  it('qk.sessionInvoiceStatus.all conserva la clave original', () => {
    expect(qk.sessionInvoiceStatus.all).toEqual(['session-invoice-status']);
  });

  it('qk.invoiceSeries.all conserva la clave original', () => {
    expect(qk.invoiceSeries.all).toEqual(['invoice-series']);
  });

  it('qk.resolvedPrice.all conserva la clave original', () => {
    expect(qk.resolvedPrice.all).toEqual(['resolved-price']);
  });

  it('qk.resolvedPrice.byPatient conserva la clave original', () => {
    expect(qk.resolvedPrice.byPatient(patientId, targetType, targetId, referenceDate)).toEqual(['resolved-price', patientId, targetType, targetId, referenceDate]);
  });

  it('qk.debts.list conserva la clave original', () => {
    expect(qk.debts.list(filters)).toEqual(['debts', filters]);
  });

  it('qk.debts.page conserva la clave original', () => {
    expect(qk.debts.page(filters, range.from, range.to, profile?.center_id)).toEqual(['debts', 'page', filters, range.from, range.to, profile?.center_id]);
  });

  it('qk.invoiceStats.all conserva la clave original', () => {
    expect(qk.invoiceStats.all).toEqual(['invoice-stats']);
  });

  it('qk.sessionInvoiceStatus.bySession conserva la clave original', () => {
    expect(qk.sessionInvoiceStatus.bySession(sessionId)).toEqual(['session-invoice-status', sessionId]);
  });

  it('qk.invoices.list conserva la clave original', () => {
    expect(qk.invoices.list(filters)).toEqual(['invoices', filters]);
  });

  it('qk.invoices.orphanCount conserva la clave original', () => {
    expect(qk.invoices.orphanCount(filters, profile?.center_id)).toEqual(['invoices', 'orphan-count', filters, profile?.center_id]);
  });

  it('qk.invoices.analytics conserva la clave original', () => {
    expect(qk.invoices.analytics(filters, profile?.center_id)).toEqual(['invoices', 'analytics', filters, profile?.center_id]);
  });

  it('qk.invoices.page conserva la clave original', () => {
    expect(qk.invoices.page(filters, range.from, range.to, profile?.center_id)).toEqual(['invoices', 'page', filters, range.from, range.to, profile?.center_id]);
  });

  it('qk.invoiceSeries.byCenter conserva la clave original', () => {
    expect(qk.invoiceSeries.byCenter(centerId)).toEqual(['invoice-series', centerId]);
  });

  it('qk.invoiceSeries.list conserva la clave original', () => {
    expect(qk.invoiceSeries.list(centerId, showArchived)).toEqual(['invoice-series', centerId, showArchived]);
  });

  it('qk.payments.list conserva la clave original', () => {
    expect(qk.payments.list(filters)).toEqual(['payments', filters]);
  });

  it('qk.payments.analytics conserva la clave original', () => {
    expect(qk.payments.analytics(filters, profile?.center_id)).toEqual(['payments', 'analytics', filters, profile?.center_id]);
  });

  it('qk.payments.page conserva la clave original', () => {
    expect(qk.payments.page(filters, range.from, range.to, profile?.center_id)).toEqual(['payments', 'page', filters, range.from, range.to, profile?.center_id]);
  });

  it('qk.sessionPaymentStatus.bySession conserva la clave original', () => {
    expect(qk.sessionPaymentStatus.bySession(sessionId)).toEqual(['session-payment-status', sessionId]);
  });

  it('qk.tariffPlans.all conserva la clave original', () => {
    expect(qk.tariffPlans.all).toEqual(['tariff-plans']);
  });

  it('qk.tariffPlans.byCenter conserva la clave original', () => {
    expect(qk.tariffPlans.byCenter(profile?.center_id)).toEqual(['tariff-plans', profile?.center_id]);
  });

  it('qk.invoices.list conserva posiciones undefined', () => {
    const key = qk.invoices.list(undefined);
    expect(key).toEqual(['invoices', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.invoices.page conserva posiciones undefined', () => {
    const key = qk.invoices.page(filters, range.from, range.to, undefined);
    expect(key).toEqual(['invoices', 'page', filters, range.from, range.to, undefined]);
    expect(key).toHaveLength(6);
  });

  it('qk.debts.list conserva posiciones undefined', () => {
    const key = qk.debts.list(undefined);
    expect(key).toEqual(['debts', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.debts.page conserva posiciones undefined', () => {
    const key = qk.debts.page(filters, range.from, range.to, undefined);
    expect(key).toEqual(['debts', 'page', filters, range.from, range.to, undefined]);
    expect(key).toHaveLength(6);
  });

  it('qk.payments.list conserva posiciones undefined', () => {
    const key = qk.payments.list(undefined);
    expect(key).toEqual(['payments', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.payments.page conserva posiciones undefined', () => {
    const key = qk.payments.page(filters, range.from, range.to, undefined);
    expect(key).toEqual(['payments', 'page', filters, range.from, range.to, undefined]);
    expect(key).toHaveLength(6);
  });

  it('qk.bonos.list conserva posiciones undefined', () => {
    const key = qk.bonos.list(undefined);
    expect(key).toEqual(['bonos', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.bonos.page conserva posiciones undefined', () => {
    const key = qk.bonos.page(filters, range.from, range.to, undefined);
    expect(key).toEqual(['bonos', 'page', filters, range.from, range.to, undefined]);
    expect(key).toHaveLength(6);
  });

  it('qk.invoices.analytics conserva posiciones undefined', () => {
    const key = qk.invoices.analytics(filters, undefined);
    expect(key).toEqual(['invoices', 'analytics', filters, undefined]);
    expect(key).toHaveLength(4);
  });

  it('qk.payments.analytics conserva posiciones undefined', () => {
    const key = qk.payments.analytics(filters, undefined);
    expect(key).toEqual(['payments', 'analytics', filters, undefined]);
    expect(key).toHaveLength(4);
  });

  it('qk.invoices.orphanCount conserva posiciones undefined', () => {
    const key = qk.invoices.orphanCount(filters, undefined);
    expect(key).toEqual(['invoices', 'orphan-count', filters, undefined]);
    expect(key).toHaveLength(4);
  });

  it('qk.invoiceSeries.list conserva posiciones undefined', () => {
    const key = qk.invoiceSeries.list(undefined, showArchived);
    expect(key).toEqual(['invoice-series', undefined, showArchived]);
    expect(key).toHaveLength(3);
  });

  it('qk.invoiceSeries.byCenter conserva posiciones undefined', () => {
    const key = qk.invoiceSeries.byCenter(undefined);
    expect(key).toEqual(['invoice-series', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.bonos.stats conserva posiciones undefined', () => {
    const key = qk.bonos.stats(undefined, undefined);
    expect(key).toEqual(['bonos', 'stats', undefined, undefined]);
    expect(key).toHaveLength(4);
  });

  it('qk.sessionPaymentStatus.bySession conserva posiciones undefined', () => {
    const key = qk.sessionPaymentStatus.bySession(undefined);
    expect(key).toEqual(['session-payment-status', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.sessionInvoiceStatus.bySession conserva posiciones undefined', () => {
    const key = qk.sessionInvoiceStatus.bySession(undefined);
    expect(key).toEqual(['session-invoice-status', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.patientActiveBonos.byPatient conserva posiciones undefined', () => {
    const key = qk.patientActiveBonos.byPatient(undefined);
    expect(key).toEqual(['patient-active-bonos', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.bonoSessions.byBono conserva posiciones undefined', () => {
    const key = qk.bonoSessions.byBono(undefined);
    expect(key).toEqual(['bono-sessions', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.resolvedPrice.byPatient conserva posiciones undefined', () => {
    const key = qk.resolvedPrice.byPatient(undefined, undefined, undefined, undefined);
    expect(key).toEqual(['resolved-price', undefined, undefined, undefined, undefined]);
    expect(key).toHaveLength(5);
  });

  it('qk.tariffPlans.byCenter conserva posiciones undefined', () => {
    const key = qk.tariffPlans.byCenter(undefined);
    expect(key).toEqual(['tariff-plans', undefined]);
    expect(key).toHaveLength(2);
  });

  it('qk.cancellationCharges.list conserva posiciones undefined', () => {
    const key = qk.cancellationCharges.list(undefined, status);
    expect(key).toEqual(['cancellation-charges', undefined, status]);
    expect(key).toHaveLength(3);
  });

  it('conserva centros null y showArchived false', () => {
    expect(qk.invoiceSeries.list(null, false)).toEqual(['invoice-series', null, false]);
    expect(qk.invoices.page(filters, range.from, range.to, null)).toEqual(['invoices', 'page', filters, range.from, range.to, null]);
  });

  it('MONEY_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['payments'], ['payment-stats'], ['debts'], ['debt-stats'], ['invoices']];
    expect(MONEY_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, MONEY_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

  it('PAYMENT_INVOICE_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['payments'], ['debts'], ['invoices']];
    expect(PAYMENT_INVOICE_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, PAYMENT_INVOICE_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

  it('BONO_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['bonos'], ['patient-active-bonos']];
    expect(BONO_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, BONO_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

  it('BONO_DEBT_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['bono-sessions'], ['debts'], ['session-payment-status'], ['debt-stats']];
    expect(BONO_DEBT_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, BONO_DEBT_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

  it('CANCELLATION_MONEY_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['cancellation-charges'], ['debts'], ['debt-stats']];
    expect(CANCELLATION_MONEY_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, CANCELLATION_MONEY_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

  it('TARIFF_PRICE_KEYS invalida exactamente sus prefijos sin esperar', () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockReturnValue(new Promise<void>(() => {}));
    const keys = [['tariff-plans'], ['resolved-price']];
    expect(TARIFF_PRICE_KEYS).toEqual(keys);
    expect(invalidateKeys(queryClient, TARIFF_PRICE_KEYS)).toBeUndefined();
    expect(invalidate.mock.calls).toEqual(keys.map((queryKey) => [{ queryKey }]));
    invalidate.mockRestore();
  });

});
