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

describe('query keys de la fase 2', () => {
  it('qk.activeCancellationPolicy.all conserva el prefijo original', () => {
    expect(qk.activeCancellationPolicy.all).toEqual(['active-cancellation-policy']);
  });

  it('qk.activeCancellationPolicy.byCenter conserva la clave original', () => {
    expect(qk.activeCancellationPolicy.byCenter('centerId-1')).toEqual(['active-cancellation-policy', 'centerId-1']);
  });

  it('qk.aiDocumentDefaults.all conserva el prefijo original', () => {
    expect(qk.aiDocumentDefaults.all).toEqual(['ai-document-defaults']);
  });

  it('qk.aiDocumentDefaults.byCenter conserva la clave original', () => {
    expect(qk.aiDocumentDefaults.byCenter('centerId-1')).toEqual(['ai-document-defaults', 'centerId-1']);
  });

  it('qk.aiDocumentTypes.all conserva el prefijo original', () => {
    expect(qk.aiDocumentTypes.all).toEqual(['ai-document-types']);
  });

  it('qk.aiDocumentTypes.list conserva la clave original', () => {
    expect(qk.aiDocumentTypes.list('centerId-1', 'session')).toEqual(['ai-document-types', 'centerId-1', 'session']);
  });

  it('qk.aiDocumentTypes.byCenter conserva la clave original', () => {
    expect(qk.aiDocumentTypes.byCenter('centerId-1')).toEqual(['ai-document-types', 'centerId-1']);
  });

  it('qk.aiDocuments.all conserva el prefijo original', () => {
    expect(qk.aiDocuments.all).toEqual(['ai-documents']);
  });

  it('qk.aiDocuments.transcriptAvailability conserva la clave original', () => {
    expect(qk.aiDocuments.transcriptAvailability('sessionId-1')).toEqual(['ai-documents', 'transcript-availability', 'sessionId-1']);
  });

  it('qk.aiDocuments.session conserva la clave original', () => {
    expect(qk.aiDocuments.session('sessionId-1')).toEqual(['ai-documents', 'session', 'sessionId-1']);
  });

  it('qk.aiDocuments.patient conserva la clave original', () => {
    expect(qk.aiDocuments.patient('patientId-1')).toEqual(['ai-documents', 'patient', 'patientId-1']);
  });

  it('qk.aiPromptVersions.all conserva el prefijo original', () => {
    expect(qk.aiPromptVersions.all).toEqual(['ai-prompt-versions']);
  });

  it('qk.aiPromptVersions.list conserva la clave original', () => {
    expect(qk.aiPromptVersions.list('documentTypeId-1', 'centerId-1')).toEqual(['ai-prompt-versions', 'documentTypeId-1', 'centerId-1']);
  });

  it('qk.aiPromptVersions.byDocumentType conserva la clave original', () => {
    expect(qk.aiPromptVersions.byDocumentType('documentTypeId-1')).toEqual(['ai-prompt-versions', 'documentTypeId-1']);
  });

  it('qk.aiPromptVersionsProfessionals.all conserva el prefijo original', () => {
    expect(qk.aiPromptVersionsProfessionals.all).toEqual(['ai-prompt-versions-professionals']);
  });

  it('qk.aiPromptVersionsProfessionals.byProfessionalIds conserva la clave original', () => {
    expect(qk.aiPromptVersionsProfessionals.byProfessionalIds(['id-1', 'id-2'])).toEqual(['ai-prompt-versions-professionals', ['id-1', 'id-2']]);
  });

  it('qk.aiPromptVersionsSessionTypes.all conserva el prefijo original', () => {
    expect(qk.aiPromptVersionsSessionTypes.all).toEqual(['ai-prompt-versions-session-types']);
  });

  it('qk.aiPromptVersionsSessionTypes.bySessionTypeIds conserva la clave original', () => {
    expect(qk.aiPromptVersionsSessionTypes.bySessionTypeIds(['id-1', 'id-2'])).toEqual(['ai-prompt-versions-session-types', ['id-1', 'id-2']]);
  });

  it('qk.alertRules.all conserva el prefijo original', () => {
    expect(qk.alertRules.all).toEqual(['alert-rules']);
  });

  it('qk.alertRules.byTemplate conserva la clave original', () => {
    expect(qk.alertRules.byTemplate('templateId-1')).toEqual(['alert-rules', 'templateId-1']);
  });

  it('qk.appChangesPending.all conserva el prefijo original', () => {
    expect(qk.appChangesPending.all).toEqual(['app-changes-pending']);
  });

  it('qk.appVersions.all conserva el prefijo original', () => {
    expect(qk.appVersions.all).toEqual(['app-versions']);
  });

  it('qk.assessmentDetail.all conserva el prefijo original', () => {
    expect(qk.assessmentDetail.all).toEqual(['assessment-detail']);
  });

  it('qk.assessmentDetail.byAssessment conserva la clave original', () => {
    expect(qk.assessmentDetail.byAssessment('assessmentId-1')).toEqual(['assessment-detail', 'assessmentId-1']);
  });

  it('qk.assessmentTemplates.all conserva el prefijo original', () => {
    expect(qk.assessmentTemplates.all).toEqual(['assessment-templates']);
  });

  it('qk.assessmentTemplates.byCenter conserva la clave original', () => {
    expect(qk.assessmentTemplates.byCenter('centerId-1')).toEqual(['assessment-templates', 'centerId-1']);
  });

  it('qk.assessments.all conserva el prefijo original', () => {
    expect(qk.assessments.all).toEqual(['assessments']);
  });

  it('qk.assessments.page conserva la clave original', () => {
    expect(qk.assessments.page({}, 20, 20, 'centerId-1')).toEqual(['assessments', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.assessments.counts conserva la clave original', () => {
    expect(qk.assessments.counts('now-1', 'centerId-1')).toEqual(['assessments', 'counts', 'now-1', 'centerId-1']);
  });

  it('qk.assessments.list conserva la clave original', () => {
    expect(qk.assessments.list('centerId-1', 'patientId-1')).toEqual(['assessments', 'centerId-1', 'patientId-1']);
  });

  it('qk.auditAnomalyCount.all conserva el prefijo original', () => {
    expect(qk.auditAnomalyCount.all).toEqual(['audit-anomaly-count']);
  });

  it('qk.auditAnomalyCount.list conserva la clave original', () => {
    expect(qk.auditAnomalyCount.list('from-1', 'to-1', 'centerId-1')).toEqual(['audit-anomaly-count', 'from-1', 'to-1', 'centerId-1']);
  });

  it('qk.auditLogs.all conserva el prefijo original', () => {
    expect(qk.auditLogs.all).toEqual(['audit-logs']);
  });

  it('qk.auditLogs.page conserva la clave original', () => {
    expect(qk.auditLogs.page({}, 20, 20, 'centerId-1')).toEqual(['audit-logs', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.autoregistroEntries.all conserva el prefijo original', () => {
    expect(qk.autoregistroEntries.all).toEqual(['autoregistro-entries']);
  });

  it('qk.autoregistroEntries.list conserva la clave original', () => {
    expect(qk.autoregistroEntries.list('centerId-1', 'patientId-1', 'templateId-1')).toEqual(['autoregistro-entries', 'centerId-1', 'patientId-1', 'templateId-1']);
  });

  it('qk.autoregistroLinks.all conserva el prefijo original', () => {
    expect(qk.autoregistroLinks.all).toEqual(['autoregistro-links']);
  });

  it('qk.autoregistroLinks.list conserva la clave original', () => {
    expect(qk.autoregistroLinks.list('centerId-1', 'patientId-1')).toEqual(['autoregistro-links', 'centerId-1', 'patientId-1']);
  });

  it('qk.autoregistroTemplates.all conserva el prefijo original', () => {
    expect(qk.autoregistroTemplates.all).toEqual(['autoregistro-templates']);
  });

  it('qk.autoregistroTemplates.byCenter conserva la clave original', () => {
    expect(qk.autoregistroTemplates.byCenter('centerId-1')).toEqual(['autoregistro-templates', 'centerId-1']);
  });

  it('qk.availability.all conserva el prefijo original', () => {
    expect(qk.availability.all).toEqual(['availability']);
  });

  it('qk.availability.byProfessional conserva la clave original', () => {
    expect(qk.availability.byProfessional('professionalId-1')).toEqual(['availability', 'professionalId-1']);
  });

  it('qk.availability.byProfessionals conserva la clave original', () => {
    expect(qk.availability.byProfessionals(['id-1', 'id-2'])).toEqual(['availability', 'all', ['id-1', 'id-2']]);
  });

  it('qk.billableEvent.all conserva el prefijo original', () => {
    expect(qk.billableEvent.all).toEqual(['billable-event']);
  });

  it('qk.billableEvent.bySession conserva la clave original', () => {
    expect(qk.billableEvent.bySession('sessionId-1')).toEqual(['billable-event', 'session', 'sessionId-1']);
  });

  it('qk.billableEventInvoices.all conserva el prefijo original', () => {
    expect(qk.billableEventInvoices.all).toEqual(['billable-event-invoices']);
  });

  it('qk.billableEventInvoices.byBillableEvent conserva la clave original', () => {
    expect(qk.billableEventInvoices.byBillableEvent('billableEventId-1')).toEqual(['billable-event-invoices', 'billableEventId-1']);
  });

  it('qk.bono.all conserva el prefijo original', () => {
    expect(qk.bono.all).toEqual(['bono']);
  });

  it('qk.bono.byBono conserva la clave original', () => {
    expect(qk.bono.byBono('bonoId-1')).toEqual(['bono', 'bonoId-1']);
  });

  it('qk.bonoPaymentStatus.all conserva el prefijo original', () => {
    expect(qk.bonoPaymentStatus.all).toEqual(['bono-payment-status']);
  });

  it('qk.bonoPaymentStatus.byBono conserva la clave original', () => {
    expect(qk.bonoPaymentStatus.byBono('bonoId-1')).toEqual(['bono-payment-status', 'bonoId-1']);
  });

  it('qk.bonoTemplates.all conserva el prefijo original', () => {
    expect(qk.bonoTemplates.all).toEqual(['bono-templates']);
  });

  it('qk.calendarEvents.all conserva el prefijo original', () => {
    expect(qk.calendarEvents.all).toEqual(['calendar-events']);
  });

  it('qk.calendarEvents.list conserva la clave original', () => {
    expect(qk.calendarEvents.list('professionalId-1', 'rangeStart-1', 'rangeEnd-1')).toEqual(['calendar-events', 'professionalId-1', 'rangeStart-1', 'rangeEnd-1']);
  });

  it('qk.canInvoiceSession.all conserva el prefijo original', () => {
    expect(qk.canInvoiceSession.all).toEqual(['can-invoice-session']);
  });

  it('qk.canInvoiceSession.bySession conserva la clave original', () => {
    expect(qk.canInvoiceSession.bySession('sessionId-1')).toEqual(['can-invoice-session', 'sessionId-1']);
  });

  it('qk.center.all conserva el prefijo original', () => {
    expect(qk.center.all).toEqual(['center']);
  });

  it('qk.center.byCenter conserva la clave original', () => {
    expect(qk.center.byCenter('centerId-1')).toEqual(['center', 'centerId-1']);
  });

  it('qk.communicationTemplate.all conserva el prefijo original', () => {
    expect(qk.communicationTemplate.all).toEqual(['communication-template']);
  });

  it('qk.communicationTemplate.list conserva la clave original', () => {
    expect(qk.communicationTemplate.list('centerId-1', 'email', 'notification')).toEqual(['communication-template', 'centerId-1', 'email', 'notification']);
  });

  it('qk.communicationTemplates.all conserva el prefijo original', () => {
    expect(qk.communicationTemplates.all).toEqual(['communication-templates']);
  });

  it('qk.communicationTemplates.byCenter conserva la clave original', () => {
    expect(qk.communicationTemplates.byCenter('centerId-1')).toEqual(['communication-templates', 'centerId-1']);
  });

  it('qk.compensationAgreement.all conserva el prefijo original', () => {
    expect(qk.compensationAgreement.all).toEqual(['compensation-agreement']);
  });

  it('qk.compensationAgreement.byProfessional conserva la clave original', () => {
    expect(qk.compensationAgreement.byProfessional('professionalId-1')).toEqual(['compensation-agreement', 'professionalId-1']);
  });

  it('qk.compensationAgreementHistory.all conserva el prefijo original', () => {
    expect(qk.compensationAgreementHistory.all).toEqual(['compensation-agreement-history']);
  });

  it('qk.compensationAgreementHistory.byProfessional conserva la clave original', () => {
    expect(qk.compensationAgreementHistory.byProfessional('professionalId-1')).toEqual(['compensation-agreement-history', 'professionalId-1']);
  });

  it('qk.compensationPreview.all conserva el prefijo original', () => {
    expect(qk.compensationPreview.all).toEqual(['compensation-preview']);
  });

  it('qk.compensationPreview.list conserva la clave original', () => {
    expect(qk.compensationPreview.list('professionalId-1', 'periodStart-1', 'periodEnd-1')).toEqual(['compensation-preview', 'professionalId-1', 'periodStart-1', 'periodEnd-1']);
  });

  it('qk.conflictingSessions.all conserva el prefijo original', () => {
    expect(qk.conflictingSessions.all).toEqual(['conflicting-sessions']);
  });

  it('qk.conflictingSessions.list conserva la clave original', () => {
    expect(qk.conflictingSessions.list('centerId-1', 'startDate-1', 'endDate-1', 'professionalId-1')).toEqual(['conflicting-sessions', 'centerId-1', 'startDate-1', 'endDate-1', 'professionalId-1']);
  });

  it('qk.consentDetail.all conserva el prefijo original', () => {
    expect(qk.consentDetail.all).toEqual(['consent-detail']);
  });

  it('qk.consentDetail.byConsent conserva la clave original', () => {
    expect(qk.consentDetail.byConsent('consentId-1')).toEqual(['consent-detail', 'consentId-1']);
  });

  it('qk.consentSignatures.all conserva el prefijo original', () => {
    expect(qk.consentSignatures.all).toEqual(['consent-signatures']);
  });

  it('qk.consentSignatures.byConsent conserva la clave original', () => {
    expect(qk.consentSignatures.byConsent('consentId-1')).toEqual(['consent-signatures', 'consentId-1']);
  });

  it('qk.consentTemplates.all conserva el prefijo original', () => {
    expect(qk.consentTemplates.all).toEqual(['consent-templates']);
  });

  it('qk.consentTemplates.byCenter conserva la clave original', () => {
    expect(qk.consentTemplates.byCenter('centerId-1')).toEqual(['consent-templates', 'centerId-1']);
  });

  it('qk.consents.all conserva el prefijo original', () => {
    expect(qk.consents.all).toEqual(['consents']);
  });

  it('qk.consents.recordingReady conserva la clave original', () => {
    expect(qk.consents.recordingReady('patientId-1', 'sessionId-1')).toEqual(['consents', 'recording-ready', 'patientId-1', 'sessionId-1']);
  });

  it('qk.consents.page conserva la clave original', () => {
    expect(qk.consents.page({}, 20, 20, 'centerId-1')).toEqual(['consents', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.consents.list conserva la clave original', () => {
    expect(qk.consents.list('centerId-1', 'patientId-1')).toEqual(['consents', 'centerId-1', 'patientId-1']);
  });

  it('qk.coupleCancellation.all conserva el prefijo original', () => {
    expect(qk.coupleCancellation.all).toEqual(['couple-cancellation']);
  });

  it('qk.coupleCancellation.byToken conserva la clave original', () => {
    expect(qk.coupleCancellation.byToken('token-1')).toEqual(['couple-cancellation', 'token-1']);
  });

  it('qk.coupleCancellationPending.all conserva el prefijo original', () => {
    expect(qk.coupleCancellationPending.all).toEqual(['couple-cancellation-pending']);
  });

  it('qk.coupleCancellationPending.bySession conserva la clave original', () => {
    expect(qk.coupleCancellationPending.bySession('sessionId-1')).toEqual(['couple-cancellation-pending', 'sessionId-1']);
  });

  it('qk.customPriceHistory.all conserva el prefijo original', () => {
    expect(qk.customPriceHistory.all).toEqual(['custom-price-history']);
  });

  it('qk.customPriceHistory.byCustomPrice conserva la clave original', () => {
    expect(qk.customPriceHistory.byCustomPrice('customPriceId-1')).toEqual(['custom-price-history', 'customPriceId-1']);
  });

  it('qk.dashboardStats.all conserva el prefijo original', () => {
    expect(qk.dashboardStats.all).toEqual(['dashboard-stats']);
  });

  it('qk.expense.all conserva el prefijo original', () => {
    expect(qk.expense.all).toEqual(['expense']);
  });

  it('qk.expense.by conserva la clave original', () => {
    expect(qk.expense.by('id-1')).toEqual(['expense', 'id-1']);
  });

  it('qk.expenseCategories.all conserva el prefijo original', () => {
    expect(qk.expenseCategories.all).toEqual(['expense-categories']);
  });

  it('qk.expenseCategories.list conserva la clave original', () => {
    expect(qk.expenseCategories.list('centerId-1', false)).toEqual(['expense-categories', 'centerId-1', false]);
  });

  it('qk.expenseIncomeStatement.all conserva el prefijo original', () => {
    expect(qk.expenseIncomeStatement.all).toEqual(['expense-income-statement']);
  });

  it('qk.expenseIncomeStatement.list conserva la clave original', () => {
    expect(qk.expenseIncomeStatement.list('centerId-1', 'start-1', 'end-1')).toEqual(['expense-income-statement', 'centerId-1', 'start-1', 'end-1']);
  });

  it('qk.expenseRecurringTemplates.all conserva el prefijo original', () => {
    expect(qk.expenseRecurringTemplates.all).toEqual(['expense-recurring-templates']);
  });

  it('qk.expenseRecurringTemplates.byCenter conserva la clave original', () => {
    expect(qk.expenseRecurringTemplates.byCenter('centerId-1')).toEqual(['expense-recurring-templates', 'centerId-1']);
  });

  it('qk.expenseStats.all conserva el prefijo original', () => {
    expect(qk.expenseStats.all).toEqual(['expense-stats']);
  });

  it('qk.expenseStats.list conserva la clave original', () => {
    expect(qk.expenseStats.list('centerId-1', 'effectiveMonth-1')).toEqual(['expense-stats', 'centerId-1', 'effectiveMonth-1']);
  });

  it('qk.expenses.all conserva el prefijo original', () => {
    expect(qk.expenses.all).toEqual(['expenses']);
  });

  it('qk.expenses.page conserva la clave original', () => {
    expect(qk.expenses.page({}, 20, 20, 'centerId-1')).toEqual(['expenses', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.expenses.list conserva la clave original', () => {
    expect(qk.expenses.list('centerId-1', {})).toEqual(['expenses', 'centerId-1', {}]);
  });

  it('qk.expensesPendingThisMonth.all conserva el prefijo original', () => {
    expect(qk.expensesPendingThisMonth.all).toEqual(['expenses-pending-this-month']);
  });

  it('qk.expensesPendingThisMonth.byCenter conserva la clave original', () => {
    expect(qk.expensesPendingThisMonth.byCenter('centerId-1')).toEqual(['expenses-pending-this-month', 'centerId-1']);
  });

  it('qk.expensesVatBook.all conserva el prefijo original', () => {
    expect(qk.expensesVatBook.all).toEqual(['expenses-vat-book']);
  });

  it('qk.expensesVatBook.list conserva la clave original', () => {
    expect(qk.expensesVatBook.list('centerId-1', 'start-1', 'end-1')).toEqual(['expenses-vat-book', 'centerId-1', 'start-1', 'end-1']);
  });

  it('qk.googleCalendarHealth.all conserva el prefijo original', () => {
    expect(qk.googleCalendarHealth.all).toEqual(['google-calendar-health']);
  });

  it('qk.googleCalendarHealth.byUser conserva la clave original', () => {
    expect(qk.googleCalendarHealth.byUser('userId-1')).toEqual(['google-calendar-health', 'userId-1']);
  });

  it('qk.googleDriveConnection.all conserva el prefijo original', () => {
    expect(qk.googleDriveConnection.all).toEqual(['google-drive-connection']);
  });

  it('qk.googleDriveConnection.byCenter conserva la clave original', () => {
    expect(qk.googleDriveConnection.byCenter('centerId-1')).toEqual(['google-drive-connection', 'centerId-1']);
  });

  it('qk.intakeRequests.all conserva el prefijo original', () => {
    expect(qk.intakeRequests.all).toEqual(['intake-requests']);
  });

  it('qk.intakeRequests.page conserva la clave original', () => {
    expect(qk.intakeRequests.page({}, 20, 20, 'centerId-1')).toEqual(['intake-requests', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.intakeRequests.counts conserva la clave original', () => {
    expect(qk.intakeRequests.counts('centerId-1', {})).toEqual(['intake-requests', 'centerId-1', 'counts', {}]);
  });

  it('qk.intakeRequests.list conserva la clave original', () => {
    expect(qk.intakeRequests.list('centerId-1', {})).toEqual(['intake-requests', 'centerId-1', {}]);
  });

  it('qk.intakeRequests.byCenter conserva la clave original', () => {
    expect(qk.intakeRequests.byCenter('centerId-1')).toEqual(['intake-requests', 'centerId-1']);
  });

  it('qk.intakeRequests.pages conserva la clave original', () => {
    expect(qk.intakeRequests.pages()).toEqual(['intake-requests', 'page']);
  });

  it('qk.invoice.all conserva el prefijo original', () => {
    expect(qk.invoice.all).toEqual(['invoice']);
  });

  it('qk.invoice.byInvoice conserva la clave original', () => {
    expect(qk.invoice.byInvoice('invoiceId-1')).toEqual(['invoice', 'invoiceId-1']);
  });

  it('qk.invoiceItems.all conserva el prefijo original', () => {
    expect(qk.invoiceItems.all).toEqual(['invoice-items']);
  });

  it('qk.invoiceItems.byInvoice conserva la clave original', () => {
    expect(qk.invoiceItems.byInvoice('invoiceId-1')).toEqual(['invoice-items', 'invoiceId-1']);
  });

  it('qk.invoiceSeriesUsage.all conserva el prefijo original', () => {
    expect(qk.invoiceSeriesUsage.all).toEqual(['invoice-series-usage']);
  });

  it('qk.invoiceSeriesUsage.bySeries conserva la clave original', () => {
    expect(qk.invoiceSeriesUsage.bySeries('seriesId-1')).toEqual(['invoice-series-usage', 'seriesId-1']);
  });

  it('qk.invoiceTypeCorrectionContext.all conserva el prefijo original', () => {
    expect(qk.invoiceTypeCorrectionContext.all).toEqual(['invoice-type-correction-context']);
  });

  it('qk.invoiceTypeCorrectionContext.byInvoice conserva la clave original', () => {
    expect(qk.invoiceTypeCorrectionContext.byInvoice('invoiceId-1')).toEqual(['invoice-type-correction-context', 'invoiceId-1']);
  });

  it('qk.locationSchedules.all conserva el prefijo original', () => {
    expect(qk.locationSchedules.all).toEqual(['location-schedules']);
  });

  it('qk.locationSchedules.byLocation conserva la clave original', () => {
    expect(qk.locationSchedules.byLocation('locationId-1')).toEqual(['location-schedules', 'locationId-1']);
  });

  it('qk.locationSchedules.byLocations conserva la clave original', () => {
    expect(qk.locationSchedules.byLocations(['id-1', 'id-2'])).toEqual(['location-schedules', 'all', ['id-1', 'id-2']]);
  });

  it('qk.locationSchedules.allSchedules conserva la clave original', () => {
    expect(qk.locationSchedules.allSchedules()).toEqual(['location-schedules', 'all']);
  });

  it('qk.locations.all conserva el prefijo original', () => {
    expect(qk.locations.all).toEqual(['locations']);
  });

  it('qk.locations.byCenter conserva la clave original', () => {
    expect(qk.locations.byCenter('centerId-1')).toEqual(['locations', 'centerId-1']);
  });

  it('qk.notifications.all conserva el prefijo original', () => {
    expect(qk.notifications.all).toEqual(['notifications']);
  });

  it('qk.notifications.page conserva la clave original', () => {
    expect(qk.notifications.page({}, 20, 20, 'centerId-1')).toEqual(['notifications', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.notifications.counts conserva la clave original', () => {
    expect(qk.notifications.counts({}, 'centerId-1')).toEqual(['notifications', 'counts', {}, 'centerId-1']);
  });

  it('qk.notifications.list conserva la clave original', () => {
    expect(qk.notifications.list('centerId-1', {})).toEqual(['notifications', 'centerId-1', {}]);
  });

  it('qk.notifications.pending conserva la clave original', () => {
    expect(qk.notifications.pending('centerId-1')).toEqual(['notifications', 'pending', 'centerId-1']);
  });

  it('qk.oauthConnections.all conserva el prefijo original', () => {
    expect(qk.oauthConnections.all).toEqual(['oauth-connections']);
  });

  it('qk.oauthConnections.byProfessional conserva la clave original', () => {
    expect(qk.oauthConnections.byProfessional('professionalId-1')).toEqual(['oauth-connections', 'professionalId-1']);
  });

  it('qk.onlineLocationExists.all conserva el prefijo original', () => {
    expect(qk.onlineLocationExists.all).toEqual(['online-location-exists']);
  });

  it('qk.onlineLocationExists.byCenter conserva la clave original', () => {
    expect(qk.onlineLocationExists.byCenter('centerId-1')).toEqual(['online-location-exists', 'centerId-1']);
  });

  it('qk.patient.all conserva el prefijo original', () => {
    expect(qk.patient.all).toEqual(['patient']);
  });

  it('qk.patient.byPatient conserva la clave original', () => {
    expect(qk.patient.byPatient('patientId-1')).toEqual(['patient', 'patientId-1']);
  });

  it('qk.patientAiReportsContact.all conserva el prefijo original', () => {
    expect(qk.patientAiReportsContact.all).toEqual(['patient-ai-reports-contact']);
  });

  it('qk.patientAiReportsContact.byPatient conserva la clave original', () => {
    expect(qk.patientAiReportsContact.byPatient('patientId-1')).toEqual(['patient-ai-reports-contact', 'patientId-1']);
  });

  it('qk.patientAiReportsSessions.all conserva el prefijo original', () => {
    expect(qk.patientAiReportsSessions.all).toEqual(['patient-ai-reports-sessions']);
  });

  it('qk.patientAiReportsSessions.list conserva la clave original', () => {
    expect(qk.patientAiReportsSessions.list('patientId-1', ['id-1', 'id-2'])).toEqual(['patient-ai-reports-sessions', 'patientId-1', ['id-1', 'id-2']]);
  });

  it('qk.patientBonos.all conserva el prefijo original', () => {
    expect(qk.patientBonos.all).toEqual(['patient-bonos']);
  });

  it('qk.patientBonos.byPatient conserva la clave original', () => {
    expect(qk.patientBonos.byPatient('patientId-1')).toEqual(['patient-bonos', 'patientId-1']);
  });

  it('qk.patientConsentPurposes.all conserva el prefijo original', () => {
    expect(qk.patientConsentPurposes.all).toEqual(['patient-consent-purposes']);
  });

  it('qk.patientConsentPurposes.byPatient conserva la clave original', () => {
    expect(qk.patientConsentPurposes.byPatient('patientId-1')).toEqual(['patient-consent-purposes', 'patientId-1']);
  });

  it('qk.patientConsentStatus.all conserva el prefijo original', () => {
    expect(qk.patientConsentStatus.all).toEqual(['patient-consent-status']);
  });

  it('qk.patientConsentStatus.channels conserva la clave original', () => {
    expect(qk.patientConsentStatus.channels('patientId-1')).toEqual(['patient-consent-status', 'patientId-1', 'channel_whatsapp', 'channel_email']);
  });

  it('qk.patientConsentStatus.bySessionPurposes conserva la clave original', () => {
    expect(qk.patientConsentStatus.bySessionPurposes('consentPatientId-1', 'sessionId-1', ['ai_processing', 'report_generation', 'channel_whatsapp', 'channel_email'])).toEqual(['patient-consent-status', 'consentPatientId-1', 'sessionId-1', ...['ai_processing', 'report_generation', 'channel_whatsapp', 'channel_email']]);
  });

  it('qk.patientCustomPrices.all conserva el prefijo original', () => {
    expect(qk.patientCustomPrices.all).toEqual(['patient-custom-prices']);
  });

  it('qk.patientCustomPrices.byPatient conserva la clave original', () => {
    expect(qk.patientCustomPrices.byPatient('patientId-1')).toEqual(['patient-custom-prices', 'patientId-1']);
  });

  it('qk.patientInvoices.all conserva el prefijo original', () => {
    expect(qk.patientInvoices.all).toEqual(['patient-invoices']);
  });

  it('qk.patientInvoices.byPatient conserva la clave original', () => {
    expect(qk.patientInvoices.byPatient('patientId-1')).toEqual(['patient-invoices', 'patientId-1']);
  });

  it('qk.patientPartner.all conserva el prefijo original', () => {
    expect(qk.patientPartner.all).toEqual(['patient-partner']);
  });

  it('qk.patientPartner.byPatient conserva la clave original', () => {
    expect(qk.patientPartner.byPatient('patientId-1')).toEqual(['patient-partner', 'patientId-1']);
  });

  it('qk.patientResultsByCode.all conserva el prefijo original', () => {
    expect(qk.patientResultsByCode.all).toEqual(['patient-results-by-code']);
  });

  it('qk.patientResultsByCode.list conserva la clave original', () => {
    expect(qk.patientResultsByCode.list('patientId-1', 'templateCode-1')).toEqual(['patient-results-by-code', 'patientId-1', 'templateCode-1']);
  });

  it('qk.patientSessionCompanions.all conserva el prefijo original', () => {
    expect(qk.patientSessionCompanions.all).toEqual(['patient-session-companions']);
  });

  it('qk.patientSessionCompanions.list conserva la clave original', () => {
    expect(qk.patientSessionCompanions.list('patientId-1', ['id-1', 'id-2'])).toEqual(['patient-session-companions', 'patientId-1', ['id-1', 'id-2']]);
  });

  it('qk.patientSessionHistory.all conserva el prefijo original', () => {
    expect(qk.patientSessionHistory.all).toEqual(['patient-session-history']);
  });

  it('qk.patientSessionHistory.byPatient conserva la clave original', () => {
    expect(qk.patientSessionHistory.byPatient('patientId-1')).toEqual(['patient-session-history', 'patientId-1']);
  });

  it('qk.patientSessionSummaries.all conserva el prefijo original', () => {
    expect(qk.patientSessionSummaries.all).toEqual(['patient-session-summaries']);
  });

  it('qk.patientSessions.all conserva el prefijo original', () => {
    expect(qk.patientSessions.all).toEqual(['patient-sessions']);
  });

  it('qk.patientSessions.byPatient conserva la clave original', () => {
    expect(qk.patientSessions.byPatient('patientId-1')).toEqual(['patient-sessions', 'patientId-1']);
  });

  it('qk.patientStats.all conserva el prefijo original', () => {
    expect(qk.patientStats.all).toEqual(['patient-stats']);
  });

  it('qk.patientStats.byPatient conserva la clave original', () => {
    expect(qk.patientStats.byPatient('id-1')).toEqual(['patient-stats', 'id-1']);
  });

  it('qk.patientTariffAssignment.all conserva el prefijo original', () => {
    expect(qk.patientTariffAssignment.all).toEqual(['patient-tariff-assignment']);
  });

  it('qk.patientTariffAssignment.byPatient conserva la clave original', () => {
    expect(qk.patientTariffAssignment.byPatient('patientId-1')).toEqual(['patient-tariff-assignment', 'patientId-1']);
  });

  it('qk.patients.all conserva el prefijo original', () => {
    expect(qk.patients.all).toEqual(['patients']);
  });

  it('qk.patients.list conserva la clave original', () => {
    expect(qk.patients.list({})).toEqual(['patients', {}]);
  });

  it('qk.patients.page conserva la clave original', () => {
    expect(qk.patients.page({}, 20, 20)).toEqual(['patients', 'page', {}, 20, 20]);
  });

  it('qk.pendingApprovals.all conserva el prefijo original', () => {
    expect(qk.pendingApprovals.all).toEqual(['pending-approvals']);
  });

  it('qk.pendingApprovals.byCenter conserva la clave original', () => {
    expect(qk.pendingApprovals.byCenter('centerId-1')).toEqual(['pending-approvals', 'centerId-1']);
  });

  it('qk.pendingBillableEvents.all conserva el prefijo original', () => {
    expect(qk.pendingBillableEvents.all).toEqual(['pending-billable-events']);
  });

  it('qk.pendingBillableEvents.byPatient conserva la clave original', () => {
    expect(qk.pendingBillableEvents.byPatient('patientId-1')).toEqual(['pending-billable-events', 'patientId-1']);
  });

  it('qk.platformVerifactuSoftwareInfo.all conserva el prefijo original', () => {
    expect(qk.platformVerifactuSoftwareInfo.all).toEqual(['platform-verifactu-software-info']);
  });

  it('qk.plaudConnection.all conserva el prefijo original', () => {
    expect(qk.plaudConnection.all).toEqual(['plaud-connection']);
  });

  it('qk.plaudConnection.byCenter conserva la clave original', () => {
    expect(qk.plaudConnection.byCenter('centerId-1')).toEqual(['plaud-connection', 'centerId-1']);
  });

  it('qk.plaudGenerationConsent.all conserva el prefijo original', () => {
    expect(qk.plaudGenerationConsent.all).toEqual(['plaud-generation-consent']);
  });

  it('qk.plaudGenerationConsent.byPatient conserva la clave original', () => {
    expect(qk.plaudGenerationConsent.byPatient('patientId-1')).toEqual(['plaud-generation-consent', 'patientId-1']);
  });

  it('qk.plaudRecordings.all conserva el prefijo original', () => {
    expect(qk.plaudRecordings.all).toEqual(['plaud-recordings']);
  });

  it('qk.plaudRecordings.list conserva la clave original', () => {
    expect(qk.plaudRecordings.list('needs_review', 'centerId-1')).toEqual(['plaud-recordings', 'needs_review', 'centerId-1']);
  });

  it('qk.plaudRecordingsCount.all conserva el prefijo original', () => {
    expect(qk.plaudRecordingsCount.all).toEqual(['plaud-recordings-count']);
  });

  it('qk.plaudRecordingsCount.byCenter conserva la clave original', () => {
    expect(qk.plaudRecordingsCount.byCenter('centerId-1')).toEqual(['plaud-recordings-count', 'centerId-1']);
  });

  it('qk.plaudRecordingsPendingCount.all conserva el prefijo original', () => {
    expect(qk.plaudRecordingsPendingCount.all).toEqual(['plaud-recordings-pending-count']);
  });

  it('qk.plaudRecordingsPendingCount.byCenter conserva la clave original', () => {
    expect(qk.plaudRecordingsPendingCount.byCenter('centerId-1')).toEqual(['plaud-recordings-pending-count', 'centerId-1']);
  });

  it('qk.plaudSessionSearch.all conserva el prefijo original', () => {
    expect(qk.plaudSessionSearch.all).toEqual(['plaud-session-search']);
  });

  it('qk.plaudSessionSearch.list conserva la clave original', () => {
    expect(qk.plaudSessionSearch.list('centerId-1', 'search-1')).toEqual(['plaud-session-search', 'centerId-1', 'search-1']);
  });

  it('qk.professional.all conserva el prefijo original', () => {
    expect(qk.professional.all).toEqual(['professional']);
  });

  it('qk.professional.byProfessional conserva la clave original', () => {
    expect(qk.professional.byProfessional('professionalId-1')).toEqual(['professional', 'professionalId-1']);
  });

  it('qk.professionalIntegrations.all conserva el prefijo original', () => {
    expect(qk.professionalIntegrations.all).toEqual(['professional-integrations']);
  });

  it('qk.professionalIntegrations.byProfessional conserva la clave original', () => {
    expect(qk.professionalIntegrations.byProfessional('professionalId-1')).toEqual(['professional-integrations', 'professionalId-1']);
  });

  it('qk.professionals.all conserva el prefijo original', () => {
    expect(qk.professionals.all).toEqual(['professionals']);
  });

  it('qk.professionals.byCenter conserva la clave original', () => {
    expect(qk.professionals.byCenter('centerId-1')).toEqual(['professionals', 'centerId-1']);
  });

  it('qk.professionals.withRoles conserva la clave original', () => {
    expect(qk.professionals.withRoles('centerId-1')).toEqual(['professionals', 'with-roles', 'centerId-1']);
  });

  it('qk.publicAssessment.all conserva el prefijo original', () => {
    expect(qk.publicAssessment.all).toEqual(['public-assessment']);
  });

  it('qk.publicAssessment.byToken conserva la clave original', () => {
    expect(qk.publicAssessment.byToken('token-1')).toEqual(['public-assessment', 'token-1']);
  });

  it('qk.publicAutoregistro.all conserva el prefijo original', () => {
    expect(qk.publicAutoregistro.all).toEqual(['public-autoregistro']);
  });

  it('qk.publicAutoregistro.byToken conserva la clave original', () => {
    expect(qk.publicAutoregistro.byToken('token-1')).toEqual(['public-autoregistro', 'token-1']);
  });

  it('qk.publicAutoregistroEntries.all conserva el prefijo original', () => {
    expect(qk.publicAutoregistroEntries.all).toEqual(['public-autoregistro-entries']);
  });

  it('qk.publicAutoregistroEntries.byToken conserva la clave original', () => {
    expect(qk.publicAutoregistroEntries.byToken('token-1')).toEqual(['public-autoregistro-entries', 'token-1']);
  });

  it('qk.publicBonoTemplates.all conserva el prefijo original', () => {
    expect(qk.publicBonoTemplates.all).toEqual(['public-bono-templates']);
  });

  it('qk.publicBonoTemplates.byToken conserva la clave original', () => {
    expect(qk.publicBonoTemplates.byToken('token-1')).toEqual(['public-bono-templates', 'token-1']);
  });

  it('qk.publicBonoTemplatesSession.all conserva el prefijo original', () => {
    expect(qk.publicBonoTemplatesSession.all).toEqual(['public-bono-templates-session']);
  });

  it('qk.publicBonoTemplatesSession.byToken conserva la clave original', () => {
    expect(qk.publicBonoTemplatesSession.byToken('token-1')).toEqual(['public-bono-templates-session', 'token-1']);
  });

  it('qk.publicConsent.all conserva el prefijo original', () => {
    expect(qk.publicConsent.all).toEqual(['public-consent']);
  });

  it('qk.publicConsent.byToken conserva la clave original', () => {
    expect(qk.publicConsent.byToken('token-1')).toEqual(['public-consent', 'token-1']);
  });

  it('qk.publicCoupleMembers.all conserva el prefijo original', () => {
    expect(qk.publicCoupleMembers.all).toEqual(['public-couple-members']);
  });

  it('qk.publicCoupleMembers.byToken conserva la clave original', () => {
    expect(qk.publicCoupleMembers.byToken('token-1')).toEqual(['public-couple-members', 'token-1']);
  });

  it('qk.publicCouplePartner.all conserva el prefijo original', () => {
    expect(qk.publicCouplePartner.all).toEqual(['public-couple-partner']);
  });

  it('qk.publicCouplePartner.list conserva la clave original', () => {
    expect(qk.publicCouplePartner.list('sessionToken-1', 'debtToken-1')).toEqual(['public-couple-partner', 'sessionToken-1', 'debtToken-1']);
  });

  it('qk.publicDebt.all conserva el prefijo original', () => {
    expect(qk.publicDebt.all).toEqual(['public-debt']);
  });

  it('qk.publicDebt.byToken conserva la clave original', () => {
    expect(qk.publicDebt.byToken('token-1')).toEqual(['public-debt', 'token-1']);
  });

  it('qk.publicInvoice.all conserva el prefijo original', () => {
    expect(qk.publicInvoice.all).toEqual(['public-invoice']);
  });

  it('qk.publicInvoice.byToken conserva la clave original', () => {
    expect(qk.publicInvoice.byToken('token-1')).toEqual(['public-invoice', 'token-1']);
  });

  it('qk.publicPatientReport.all conserva el prefijo original', () => {
    expect(qk.publicPatientReport.all).toEqual(['public-patient-report']);
  });

  it('qk.publicPatientReport.byToken conserva la clave original', () => {
    expect(qk.publicPatientReport.byToken('token-1')).toEqual(['public-patient-report', 'token-1']);
  });

  it('qk.publicSession.all conserva el prefijo original', () => {
    expect(qk.publicSession.all).toEqual(['public-session']);
  });

  it('qk.publicSession.byToken conserva la clave original', () => {
    expect(qk.publicSession.byToken('token-1')).toEqual(['public-session', 'token-1']);
  });

  it('qk.publicSession.portalSlug cuelga de la clave de la cita', () => {
    expect(qk.publicSession.portalSlug('token-1')).toEqual(['public-session', 'token-1', 'portal-slug']);
  });

  it('qk.pendingSignup.byToken', () => {
    expect(qk.pendingSignup.byToken('t')).toEqual(['pending-signup', 't']);
  });

  it('qk.recordings.all conserva el prefijo original', () => {
    expect(qk.recordings.all).toEqual(['recordings']);
  });

  it('qk.recordings.page conserva la clave original', () => {
    expect(qk.recordings.page({ centerId: 'center-1', userId: 'user-1', isAdmin: false }, 20, 20)).toEqual(['recordings', 'page', { centerId: 'center-1', userId: 'user-1', isAdmin: false }, 20, 20]);
  });

  it('qk.recurringSeries.all conserva el prefijo original', () => {
    expect(qk.recurringSeries.all).toEqual(['recurring-series']);
  });

  it('qk.recurringSeries.bySeries conserva la clave original', () => {
    expect(qk.recurringSeries.bySeries('seriesId-1')).toEqual(['recurring-series', 'seriesId-1']);
  });

  it('qk.referralPartners.all conserva el prefijo original', () => {
    expect(qk.referralPartners.all).toEqual(['referral-partners']);
  });

  it('qk.referralPartners.byCenter conserva la clave original', () => {
    expect(qk.referralPartners.byCenter('centerId-1')).toEqual(['referral-partners', 'centerId-1']);
  });

  it('qk.referralRequests.all conserva el prefijo original', () => {
    expect(qk.referralRequests.all).toEqual(['referral-requests']);
  });

  it('qk.referralRequests.byCenter conserva la clave original', () => {
    expect(qk.referralRequests.byCenter('centerId-1')).toEqual(['referral-requests', 'centerId-1']);
  });

  it('qk.referralSpecialties.all conserva el prefijo original', () => {
    expect(qk.referralSpecialties.all).toEqual(['referral-specialties']);
  });

  it('qk.referralSpecialties.byCenter conserva la clave original', () => {
    expect(qk.referralSpecialties.byCenter('centerId-1')).toEqual(['referral-specialties', 'centerId-1']);
  });

  it('qk.scheduleExceptions.all conserva el prefijo original', () => {
    expect(qk.scheduleExceptions.all).toEqual(['schedule-exceptions']);
  });

  it('qk.scheduleExceptions.list conserva la clave original', () => {
    expect(qk.scheduleExceptions.list('centerId-1', 'startDate-1', 'endDate-1')).toEqual(['schedule-exceptions', 'centerId-1', 'startDate-1', 'endDate-1']);
  });

  it('qk.session.all conserva el prefijo original', () => {
    expect(qk.session.all).toEqual(['session']);
  });

  it('qk.session.bySession conserva la clave original', () => {
    expect(qk.session.bySession('id-1')).toEqual(['session', 'id-1']);
  });

  it('qk.sessionInvoices.all conserva el prefijo original', () => {
    expect(qk.sessionInvoices.all).toEqual(['session-invoices']);
  });

  it('qk.sessionInvoices.bySession conserva la clave original', () => {
    expect(qk.sessionInvoices.bySession('sessionId-1')).toEqual(['session-invoices', 'sessionId-1']);
  });

  it('qk.sessionParticipants.all conserva el prefijo original', () => {
    expect(qk.sessionParticipants.all).toEqual(['session-participants']);
  });

  it('qk.sessionParticipants.bySession conserva la clave original', () => {
    expect(qk.sessionParticipants.bySession('sessionId-1')).toEqual(['session-participants', 'sessionId-1']);
  });

  it('qk.sessionTypeLimit.all conserva el prefijo original', () => {
    expect(qk.sessionTypeLimit.all).toEqual(['session-type-limit']);
  });

  it('qk.sessionTypeLimit.list conserva la clave original', () => {
    expect(qk.sessionTypeLimit.list('patientId-1', 'sessionTypeId-1', 'date-1', 'excludeSessionId-1')).toEqual(['session-type-limit', 'patientId-1', 'sessionTypeId-1', 'date-1', 'excludeSessionId-1']);
  });

  it('qk.sessionTypes.all conserva el prefijo original', () => {
    expect(qk.sessionTypes.all).toEqual(['session-types']);
  });

  it('qk.sessionTypes.byCenter conserva la clave original', () => {
    expect(qk.sessionTypes.byCenter('centerId-1')).toEqual(['session-types', 'centerId-1']);
  });

  it('qk.sessionTypesAll.all conserva el prefijo original', () => {
    expect(qk.sessionTypesAll.all).toEqual(['session-types-all']);
  });

  it('qk.sessionTypesAll.byCenter conserva la clave original', () => {
    expect(qk.sessionTypesAll.byCenter('centerId-1')).toEqual(['session-types-all', 'centerId-1']);
  });

  it('qk.sessions.all conserva el prefijo original', () => {
    expect(qk.sessions.all).toEqual(['sessions']);
  });

  it('qk.sessions.recordableToday conserva la clave original', () => {
    expect(qk.sessions.recordableToday('userId-1')).toEqual(['sessions', 'today', 'recordable', 'userId-1']);
  });

  it('qk.sessions.page conserva la clave original', () => {
    expect(qk.sessions.page({}, 20, 20, 'centerId-1')).toEqual(['sessions', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.sessions.stats conserva la clave original', () => {
    expect(qk.sessions.stats({}, 'centerId-1')).toEqual(['sessions', 'stats', {}, 'centerId-1']);
  });

  it('qk.sessions.byDateRange conserva la clave original', () => {
    expect(qk.sessions.byDateRange('startDate-1', 'endDate-1', 'professionalId-1')).toEqual(['sessions', 'startDate-1', 'endDate-1', 'professionalId-1']);
  });

  it('qk.sessions.today conserva la clave original', () => {
    expect(qk.sessions.today()).toEqual(['sessions', 'today']);
  });

  it('qk.sessions.detail conserva la clave original', () => {
    expect(qk.sessions.detail('selectedSessionId-1')).toEqual(['sessions', 'detail', 'selectedSessionId-1']);
  });

  it('qk.specialDays.all conserva el prefijo original', () => {
    expect(qk.specialDays.all).toEqual(['special-days']);
  });

  it('qk.specialDays.byCenter conserva la clave original', () => {
    expect(qk.specialDays.byCenter('centerId-1')).toEqual(['special-days', 'centerId-1']);
  });

  it('qk.stripeDiagnostics.all conserva el prefijo original', () => {
    expect(qk.stripeDiagnostics.all).toEqual(['stripe-diagnostics']);
  });

  it('qk.stripeDiagnostics.list conserva la clave original', () => {
    expect(qk.stripeDiagnostics.list('userId-1', 20)).toEqual(['stripe-diagnostics', 'userId-1', 20]);
  });

  it('qk.supplier.all conserva el prefijo original', () => {
    expect(qk.supplier.all).toEqual(['supplier']);
  });

  it('qk.supplier.by conserva la clave original', () => {
    expect(qk.supplier.by('id-1')).toEqual(['supplier', 'id-1']);
  });

  it('qk.suppliers.all conserva el prefijo original', () => {
    expect(qk.suppliers.all).toEqual(['suppliers']);
  });

  it('qk.suppliers.list conserva la clave original', () => {
    expect(qk.suppliers.list('centerId-1', {})).toEqual(['suppliers', 'centerId-1', {}]);
  });

  it('qk.tariffPlanItems.all conserva el prefijo original', () => {
    expect(qk.tariffPlanItems.all).toEqual(['tariff-plan-items']);
  });

  it('qk.tariffPlanItems.byPlan conserva la clave original', () => {
    expect(qk.tariffPlanItems.byPlan('planId-1')).toEqual(['tariff-plan-items', 'planId-1']);
  });

  it('qk.transcriptText.all conserva el prefijo original', () => {
    expect(qk.transcriptText.all).toEqual(['transcript-text']);
  });

  it('qk.transcriptText.byTranscript conserva la clave original', () => {
    expect(qk.transcriptText.byTranscript('transcriptId-1')).toEqual(['transcript-text', 'transcriptId-1']);
  });

  it('qk.transcriptionAnalysisPatientId.all conserva el prefijo original', () => {
    expect(qk.transcriptionAnalysisPatientId.all).toEqual(['transcription-analysis-patient-id']);
  });

  it('qk.transcriptionAnalysisPatientId.bySession conserva la clave original', () => {
    expect(qk.transcriptionAnalysisPatientId.bySession('sessionId-1')).toEqual(['transcription-analysis-patient-id', 'sessionId-1']);
  });

  it('qk.transcriptionIssues.all conserva el prefijo original', () => {
    expect(qk.transcriptionIssues.all).toEqual(['transcription-issues']);
  });

  it('qk.transcriptionIssues.list conserva la clave original', () => {
    expect(qk.transcriptionIssues.list('centerId-1', 'userId-1', false)).toEqual(['transcription-issues', 'centerId-1', 'userId-1', false]);
  });

  it('qk.unbilledSessions.all conserva el prefijo original', () => {
    expect(qk.unbilledSessions.all).toEqual(['unbilled-sessions']);
  });

  it('qk.unbilledSessions.byPatient conserva la clave original', () => {
    expect(qk.unbilledSessions.byPatient('patientId-1')).toEqual(['unbilled-sessions', 'patientId-1']);
  });

  it('qk.verifactuEvents.all conserva el prefijo original', () => {
    expect(qk.verifactuEvents.all).toEqual(['verifactu-events']);
  });

  it('qk.verifactuEvents.list conserva la clave original', () => {
    expect(qk.verifactuEvents.list('centerId-1', {})).toEqual(['verifactu-events', 'centerId-1', {}]);
  });

  it('qk.verifactuEvents.page conserva la clave original', () => {
    expect(qk.verifactuEvents.page({}, 20, 20, 'centerId-1')).toEqual(['verifactu-events', 'page', {}, 20, 20, 'centerId-1']);
  });

  it('qk.verifactuEvents.stats conserva la clave original', () => {
    expect(qk.verifactuEvents.stats({}, 'centerId-1')).toEqual(['verifactu-events', 'stats', {}, 'centerId-1']);
  });

  it('qk.whatsappMessages.all conserva el prefijo original', () => {
    expect(qk.whatsappMessages.all).toEqual(['whatsapp-messages']);
  });

  it('qk.whatsappMessages.byCenter conserva la clave original', () => {
    expect(qk.whatsappMessages.byCenter('centerId-1')).toEqual(['whatsapp-messages', 'centerId-1']);
  });

  it('qk.whatsappSession.all conserva el prefijo original', () => {
    expect(qk.whatsappSession.all).toEqual(['whatsapp-session']);
  });

  it('qk.whatsappSession.byCenter conserva la clave original', () => {
    expect(qk.whatsappSession.byCenter('centerId-1')).toEqual(['whatsapp-session', 'centerId-1']);
  });

  it('conserva posiciones undefined en sesiones paginadas', () => {
    expect(qk.sessions.page(undefined, 0, 19, undefined)).toEqual(['sessions', 'page', undefined, 0, 19, undefined]);
  });

  it('conserva el centro null y los filtros undefined de gastos', () => {
    expect(qk.expenses.list(null, undefined)).toEqual(['expenses', null, undefined]);
  });

  it('conserva ambos tokens null de pareja', () => {
    expect(qk.publicCouplePartner.list(null, null)).toEqual(['public-couple-partner', null, null]);
  });

  it('conserva posiciones undefined y finalidades vacias', () => {
    expect(qk.patientConsentStatus.bySessionPurposes(undefined, undefined, [])).toEqual(['patient-consent-status', undefined, undefined]);
  });

  it('conserva la exclusion null y los argumentos undefined', () => {
    expect(qk.sessionTypeLimit.list(undefined, undefined, undefined, null)).toEqual(['session-type-limit', undefined, undefined, undefined, null]);
  });

  it('conserva los campos undefined del objeto de grabaciones', () => {
    expect(qk.recordings.page({ centerId: undefined, userId: undefined, isAdmin: false }, 0, 19)).toEqual(['recordings', 'page', { centerId: undefined, userId: undefined, isAdmin: false }, 0, 19]);
  });

  it('conserva el ambito all con centro undefined', () => {
    expect(qk.aiDocumentTypes.list(undefined, 'all')).toEqual(['ai-document-types', undefined, 'all']);
  });

  it('conserva filtros undefined y centro null en recuentos', () => {
    expect(qk.notifications.counts(undefined, null)).toEqual(['notifications', 'counts', undefined, null]);
  });
});
