import type { SessionListFilters } from '@/hooks/useSessions';
import type { PatientFilters } from '@/hooks/usePatients';
import type { ExpenseFilters } from '@/hooks/useExpenses';
import type { AiDocumentScope } from '@/types/ai-documents';
import type { TemplateChannel } from '@/hooks/useCommunicationTemplates';
import type { TemplateType } from '@/hooks/useCommunicationTemplates';
import type { ConsentPurpose } from '@/lib/consent-verification';
import type { Database } from '@/integrations/supabase/types';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { InvoiceListFilters } from '@/hooks/useInvoices';
import type { DebtListFilters } from '@/hooks/useDebts';
import type { PaymentListFilters } from '@/hooks/usePayments';
import type { CustomPriceTargetType } from '@/hooks/useCustomPrices';
import type { CancellationCharge } from '@/hooks/useCancellationCharges';

type CenterId = string | null | undefined;
type BonoFilters = { patientId?: string; status?: string };

// Conserva las formas existentes, incluidos los filtros y centros ausentes.
export const qk = {
  invoices: {
    all: ['invoices'] as const,
    list: (filters: InvoiceListFilters | undefined) =>
      ['invoices', filters] as const,
    page: (filters: InvoiceListFilters, from: number, to: number, centerId: CenterId) =>
      ['invoices', 'page', filters, from, to, centerId] as const,
    analytics: (filters: InvoiceListFilters, centerId: CenterId) =>
      ['invoices', 'analytics', filters, centerId] as const,
    orphanCount: (filters: InvoiceListFilters, centerId: CenterId) =>
      ['invoices', 'orphan-count', filters, centerId] as const,
  },
  invoiceSeries: {
    all: ['invoice-series'] as const,
    list: (centerId: CenterId, showArchived: boolean) =>
      ['invoice-series', centerId, showArchived] as const,
    byCenter: (centerId: CenterId) =>
      ['invoice-series', centerId] as const,
  },
  invoiceStats: {
    all: ['invoice-stats'] as const,
  },
  debts: {
    all: ['debts'] as const,
    list: (filters: DebtListFilters | undefined) =>
      ['debts', filters] as const,
    page: (filters: DebtListFilters, from: number, to: number, centerId: CenterId) =>
      ['debts', 'page', filters, from, to, centerId] as const,
  },
  debtStats: {
    all: ['debt-stats'] as const,
  },
  payments: {
    all: ['payments'] as const,
    list: (filters: PaymentListFilters | undefined) =>
      ['payments', filters] as const,
    page: (filters: PaymentListFilters, from: number, to: number, centerId: CenterId) =>
      ['payments', 'page', filters, from, to, centerId] as const,
    analytics: (filters: PaymentListFilters, centerId: CenterId) =>
      ['payments', 'analytics', filters, centerId] as const,
  },
  paymentStats: {
    all: ['payment-stats'] as const,
  },
  sessionPaymentStatus: {
    all: ['session-payment-status'] as const,
    bySession: (sessionId: string | undefined) =>
      ['session-payment-status', sessionId] as const,
  },
  sessionInvoiceStatus: {
    all: ['session-invoice-status'] as const,
    bySession: (sessionId: string | undefined) =>
      ['session-invoice-status', sessionId] as const,
  },
  billableEvents: {
    all: ['billable-events'] as const,
  },
  bonos: {
    all: ['bonos'] as const,
    list: (filters: BonoFilters | undefined) =>
      ['bonos', filters] as const,
    page: (filters: BonoFilters, from: number, to: number, centerId: CenterId) =>
      ['bonos', 'page', filters, from, to, centerId] as const,
    stats: (patientId: string | undefined, centerId: CenterId) =>
      ['bonos', 'stats', patientId, centerId] as const,
  },
  patientActiveBonos: {
    all: ['patient-active-bonos'] as const,
    byPatient: (patientId: string | undefined) =>
      ['patient-active-bonos', patientId] as const,
  },
  bonoSessions: {
    all: ['bono-sessions'] as const,
    byBono: (bonoId: string | undefined) =>
      ['bono-sessions', bonoId] as const,
  },
  resolvedPrice: {
    all: ['resolved-price'] as const,
    byPatient: (patientId: string | undefined, targetType: CustomPriceTargetType | undefined, targetId: string | undefined, referenceDate: string | undefined) =>
      ['resolved-price', patientId, targetType, targetId, referenceDate] as const,
  },
  tariffPlans: {
    all: ['tariff-plans'] as const,
    byCenter: (centerId: CenterId) =>
      ['tariff-plans', centerId] as const,
  },
  cancellationCharges: {
    all: ['cancellation-charges'] as const,
    list: (centerId: CenterId, status: CancellationCharge['status']) =>
      ['cancellation-charges', centerId, status] as const,
  },
  activeCancellationPolicy: {
    all: ['active-cancellation-policy'] as const,
    byCenter: (centerId: CenterId) =>
      ['active-cancellation-policy', centerId] as const,
  },
  aiDocumentDefaults: {
    all: ['ai-document-defaults'] as const,
    byCenter: (centerId: CenterId) =>
      ['ai-document-defaults', centerId] as const,
  },
  aiDocumentTypes: {
    all: ['ai-document-types'] as const,
    list: (centerId: CenterId, scope: AiDocumentScope | 'all') =>
      ['ai-document-types', centerId, scope] as const,
    byCenter: (centerId: CenterId) =>
      ['ai-document-types', centerId] as const,
  },
  aiDocuments: {
    all: ['ai-documents'] as const,
    transcriptAvailability: (sessionId: string | null | undefined) =>
      ['ai-documents', 'transcript-availability', sessionId] as const,
    session: (sessionId: string | null | undefined) =>
      ['ai-documents', 'session', sessionId] as const,
    patient: (patientId: string | null | undefined) =>
      ['ai-documents', 'patient', patientId] as const,
  },
  aiPromptVersions: {
    all: ['ai-prompt-versions'] as const,
    list: (documentTypeId: string | null | undefined, centerId: CenterId) =>
      ['ai-prompt-versions', documentTypeId, centerId] as const,
    byDocumentType: (documentTypeId: string | null | undefined) =>
      ['ai-prompt-versions', documentTypeId] as const,
  },
  aiPromptVersionsProfessionals: {
    all: ['ai-prompt-versions-professionals'] as const,
    byProfessionalIds: (professionalIds: readonly string[]) =>
      ['ai-prompt-versions-professionals', professionalIds] as const,
  },
  aiPromptVersionsSessionTypes: {
    all: ['ai-prompt-versions-session-types'] as const,
    bySessionTypeIds: (sessionTypeIds: readonly string[]) =>
      ['ai-prompt-versions-session-types', sessionTypeIds] as const,
  },
  alertRules: {
    all: ['alert-rules'] as const,
    byTemplate: (templateId: string | null | undefined) =>
      ['alert-rules', templateId] as const,
  },
  appChangesPending: {
    all: ['app-changes-pending'] as const,
  },
  appVersions: {
    all: ['app-versions'] as const,
  },
  assessmentDetail: {
    all: ['assessment-detail'] as const,
    byAssessment: (assessmentId: string | null | undefined) =>
      ['assessment-detail', assessmentId] as const,
  },
  assessmentTemplates: {
    all: ['assessment-templates'] as const,
    byCenter: (centerId: CenterId) =>
      ['assessment-templates', centerId] as const,
  },
  assessments: {
    all: ['assessments'] as const,
    page: (filters: { patientId?: string; tab?: string; now?: string } | undefined, from: number, to: number, centerId: CenterId) =>
      ['assessments', 'page', filters, from, to, centerId] as const,
    counts: (now: string | null | undefined, centerId: CenterId) =>
      ['assessments', 'counts', now, centerId] as const,
    list: (centerId: CenterId, patientId: string | null | undefined) =>
      ['assessments', centerId, patientId] as const,
  },
  auditAnomalyCount: {
    all: ['audit-anomaly-count'] as const,
    list: (from: string | null | undefined, to: string | null | undefined, centerId: CenterId) =>
      ['audit-anomaly-count', from, to, centerId] as const,
  },
  auditLogs: {
    all: ['audit-logs'] as const,
    page: (filters: Omit<Database['public']['Functions']['get_audit_logs']['Args'], 'p_limit' | 'p_offset'> | undefined, from: number, to: number, centerId: CenterId) =>
      ['audit-logs', 'page', filters, from, to, centerId] as const,
  },
  autoregistroEntries: {
    all: ['autoregistro-entries'] as const,
    list: (centerId: CenterId, patientId: string | null | undefined, templateId: string | null | undefined) =>
      ['autoregistro-entries', centerId, patientId, templateId] as const,
  },
  autoregistroLinks: {
    all: ['autoregistro-links'] as const,
    list: (centerId: CenterId, patientId: string | null | undefined) =>
      ['autoregistro-links', centerId, patientId] as const,
  },
  autoregistroTemplates: {
    all: ['autoregistro-templates'] as const,
    byCenter: (centerId: CenterId) =>
      ['autoregistro-templates', centerId] as const,
  },
  availability: {
    all: ['availability'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['availability', professionalId] as const,
    byProfessionals: (professionalIds: readonly string[]) =>
      ['availability', 'all', professionalIds] as const,
  },
  billableEvent: {
    all: ['billable-event'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['billable-event', 'session', sessionId] as const,
  },
  billableEventInvoices: {
    all: ['billable-event-invoices'] as const,
    byBillableEvent: (billableEventId: string | null | undefined) =>
      ['billable-event-invoices', billableEventId] as const,
  },
  bono: {
    all: ['bono'] as const,
    byBono: (bonoId: string | null | undefined) =>
      ['bono', bonoId] as const,
  },
  bonoPaymentStatus: {
    all: ['bono-payment-status'] as const,
    byBono: (bonoId: string | null | undefined) =>
      ['bono-payment-status', bonoId] as const,
  },
  bonoTemplates: {
    all: ['bono-templates'] as const,
  },
  calendarEvents: {
    all: ['calendar-events'] as const,
    list: (professionalId: string | null | undefined, rangeStart: string | null | undefined, rangeEnd: string | null | undefined) =>
      ['calendar-events', professionalId, rangeStart, rangeEnd] as const,
  },
  canInvoiceSession: {
    all: ['can-invoice-session'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['can-invoice-session', sessionId] as const,
  },
  center: {
    all: ['center'] as const,
    byCenter: (centerId: CenterId) =>
      ['center', centerId] as const,
  },
  communicationTemplate: {
    all: ['communication-template'] as const,
    list: (centerId: CenterId, channel: TemplateChannel, templateType: TemplateType) =>
      ['communication-template', centerId, channel, templateType] as const,
  },
  communicationTemplates: {
    all: ['communication-templates'] as const,
    byCenter: (centerId: CenterId) =>
      ['communication-templates', centerId] as const,
  },
  compensationAgreement: {
    all: ['compensation-agreement'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['compensation-agreement', professionalId] as const,
  },
  compensationAgreementHistory: {
    all: ['compensation-agreement-history'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['compensation-agreement-history', professionalId] as const,
  },
  compensationPreview: {
    all: ['compensation-preview'] as const,
    list: (professionalId: string | null | undefined, periodStart: string | null | undefined, periodEnd: string | null | undefined) =>
      ['compensation-preview', professionalId, periodStart, periodEnd] as const,
  },
  conflictingSessions: {
    all: ['conflicting-sessions'] as const,
    list: (centerId: CenterId, startDate: string | null | undefined, endDate: string | null | undefined, professionalId: string | null | undefined) =>
      ['conflicting-sessions', centerId, startDate, endDate, professionalId] as const,
  },
  consentDetail: {
    all: ['consent-detail'] as const,
    byConsent: (consentId: string | null | undefined) =>
      ['consent-detail', consentId] as const,
  },
  consentSignatures: {
    all: ['consent-signatures'] as const,
    byConsent: (consentId: string | null | undefined) =>
      ['consent-signatures', consentId] as const,
  },
  consentTemplates: {
    all: ['consent-templates'] as const,
    byCenter: (centerId: CenterId) =>
      ['consent-templates', centerId] as const,
  },
  consents: {
    all: ['consents'] as const,
    recordingReady: (patientId: string | null | undefined, sessionId: string | null | undefined) =>
      ['consents', 'recording-ready', patientId, sessionId] as const,
    page: (filters: { pendingAt?: string; } | undefined, from: number, to: number, centerId: CenterId) =>
      ['consents', 'page', filters, from, to, centerId] as const,
    list: (centerId: CenterId, patientId: string | null | undefined) =>
      ['consents', centerId, patientId] as const,
  },
  coupleCancellation: {
    all: ['couple-cancellation'] as const,
    byToken: (token: string | null | undefined) =>
      ['couple-cancellation', token] as const,
  },
  coupleCancellationPending: {
    all: ['couple-cancellation-pending'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['couple-cancellation-pending', sessionId] as const,
  },
  customPriceHistory: {
    all: ['custom-price-history'] as const,
    byCustomPrice: (customPriceId: string | null | undefined) =>
      ['custom-price-history', customPriceId] as const,
  },
  dashboardStats: {
    all: ['dashboard-stats'] as const,
  },
  expense: {
    all: ['expense'] as const,
    by: (id: string | null | undefined) =>
      ['expense', id] as const,
  },
  expenseCategories: {
    all: ['expense-categories'] as const,
    list: (centerId: CenterId, includeInactive: boolean) =>
      ['expense-categories', centerId, includeInactive] as const,
  },
  expenseIncomeStatement: {
    all: ['expense-income-statement'] as const,
    list: (centerId: CenterId, start: string | null | undefined, end: string | null | undefined) =>
      ['expense-income-statement', centerId, start, end] as const,
  },
  expenseRecurringTemplates: {
    all: ['expense-recurring-templates'] as const,
    byCenter: (centerId: CenterId) =>
      ['expense-recurring-templates', centerId] as const,
  },
  expenseStats: {
    all: ['expense-stats'] as const,
    list: (centerId: CenterId, effectiveMonth: string | null | undefined) =>
      ['expense-stats', centerId, effectiveMonth] as const,
  },
  expenses: {
    all: ['expenses'] as const,
    page: (filters: ExpenseFilters | undefined, from: number, to: number, centerId: CenterId) =>
      ['expenses', 'page', filters, from, to, centerId] as const,
    list: (centerId: CenterId, filters: ExpenseFilters | undefined) =>
      ['expenses', centerId, filters] as const,
  },
  expensesPendingThisMonth: {
    all: ['expenses-pending-this-month'] as const,
    byCenter: (centerId: CenterId) =>
      ['expenses-pending-this-month', centerId] as const,
  },
  expensesVatBook: {
    all: ['expenses-vat-book'] as const,
    list: (centerId: CenterId, start: string | null | undefined, end: string | null | undefined) =>
      ['expenses-vat-book', centerId, start, end] as const,
  },
  googleCalendarHealth: {
    all: ['google-calendar-health'] as const,
    byUser: (userId: string | null | undefined) =>
      ['google-calendar-health', userId] as const,
  },
  googleDriveConnection: {
    all: ['google-drive-connection'] as const,
    byCenter: (centerId: CenterId) =>
      ['google-drive-connection', centerId] as const,
  },
  intakeRequests: {
    all: ['intake-requests'] as const,
    page: (filters: { type?: 'waitlist' | 'referral' | null; status?: 'pending' | 'contacted' | 'converted' | 'cancelled' | null; search?: string } | undefined, from: number, to: number, centerId: CenterId) =>
      ['intake-requests', 'page', filters, from, to, centerId] as const,
    counts: (centerId: CenterId, filters: { type?: 'waitlist' | 'referral' | null; status?: 'pending' | 'contacted' | 'converted' | 'cancelled' | null; search?: string } | undefined) =>
      ['intake-requests', centerId, 'counts', filters] as const,
    list: (centerId: CenterId, filters: { type?: 'waitlist' | 'referral' | null; status?: 'pending' | 'contacted' | 'converted' | 'cancelled' | null; search?: string } | undefined) =>
      ['intake-requests', centerId, filters] as const,
    byCenter: (centerId: CenterId) =>
      ['intake-requests', centerId] as const,
    pages: () =>
      ['intake-requests', 'page'] as const,
  },
  invoice: {
    all: ['invoice'] as const,
    byInvoice: (invoiceId: string | null | undefined) =>
      ['invoice', invoiceId] as const,
  },
  invoiceItems: {
    all: ['invoice-items'] as const,
    byInvoice: (invoiceId: string | null | undefined) =>
      ['invoice-items', invoiceId] as const,
  },
  invoiceSeriesUsage: {
    all: ['invoice-series-usage'] as const,
    bySeries: (seriesId: string | null | undefined) =>
      ['invoice-series-usage', seriesId] as const,
  },
  invoiceTypeCorrectionContext: {
    all: ['invoice-type-correction-context'] as const,
    byInvoice: (invoiceId: string | null | undefined) =>
      ['invoice-type-correction-context', invoiceId] as const,
  },
  locationSchedules: {
    all: ['location-schedules'] as const,
    byLocation: (locationId: string | null | undefined) =>
      ['location-schedules', locationId] as const,
    byLocations: (locationIds: readonly string[]) =>
      ['location-schedules', 'all', locationIds] as const,
    allSchedules: () =>
      ['location-schedules', 'all'] as const,
  },
  locations: {
    all: ['locations'] as const,
    byCenter: (centerId: CenterId) =>
      ['locations', centerId] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    page: (filters: { status?: string; type?: string; patientId?: string; tab?: string } | undefined, from: number, to: number, centerId: CenterId) =>
      ['notifications', 'page', filters, from, to, centerId] as const,
    counts: (filters: { status?: string; type?: string; patientId?: string; tab?: string } | undefined, centerId: CenterId) =>
      ['notifications', 'counts', filters, centerId] as const,
    list: (centerId: CenterId, filters: { status?: string; type?: string; patientId?: string; } | undefined) =>
      ['notifications', centerId, filters] as const,
    pending: (centerId: CenterId) =>
      ['notifications', 'pending', centerId] as const,
  },
  oauthConnections: {
    all: ['oauth-connections'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['oauth-connections', professionalId] as const,
  },
  onlineLocationExists: {
    all: ['online-location-exists'] as const,
    byCenter: (centerId: CenterId) =>
      ['online-location-exists', centerId] as const,
  },
  patient: {
    all: ['patient'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient', patientId] as const,
  },
  patientAiReportsContact: {
    all: ['patient-ai-reports-contact'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-ai-reports-contact', patientId] as const,
  },
  patientAiReportsSessions: {
    all: ['patient-ai-reports-sessions'] as const,
    list: (patientId: string | null | undefined, sessionIds: readonly string[]) =>
      ['patient-ai-reports-sessions', patientId, sessionIds] as const,
  },
  patientBonos: {
    all: ['patient-bonos'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-bonos', patientId] as const,
  },
  patientConsentPurposes: {
    all: ['patient-consent-purposes'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-consent-purposes', patientId] as const,
  },
  patientConsentStatus: {
    all: ['patient-consent-status'] as const,
    channels: (patientId: string | null | undefined) =>
      ['patient-consent-status', patientId, 'channel_whatsapp', 'channel_email'] as const,
    bySessionPurposes: (consentPatientId: string | null | undefined, sessionId: string | null | undefined, purposes: readonly ConsentPurpose[]) =>
      ['patient-consent-status', consentPatientId, sessionId, ...purposes] as const,
  },
  patientCustomPrices: {
    all: ['patient-custom-prices'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-custom-prices', patientId] as const,
  },
  patientInvoices: {
    all: ['patient-invoices'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-invoices', patientId] as const,
  },
  patientPartner: {
    all: ['patient-partner'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-partner', patientId] as const,
  },
  patientResultsByCode: {
    all: ['patient-results-by-code'] as const,
    list: (patientId: string | null | undefined, templateCode: string | null | undefined) =>
      ['patient-results-by-code', patientId, templateCode] as const,
  },
  patientSessionCompanions: {
    all: ['patient-session-companions'] as const,
    list: (patientId: string | null | undefined, sessionIds: readonly string[]) =>
      ['patient-session-companions', patientId, sessionIds] as const,
  },
  patientSessionHistory: {
    all: ['patient-session-history'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-session-history', patientId] as const,
  },
  patientSessionSummaries: {
    all: ['patient-session-summaries'] as const,
  },
  patientSessions: {
    all: ['patient-sessions'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-sessions', patientId] as const,
  },
  patientStats: {
    all: ['patient-stats'] as const,
    byPatient: (id: string | null | undefined) =>
      ['patient-stats', id] as const,
  },
  patientTariffAssignment: {
    all: ['patient-tariff-assignment'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['patient-tariff-assignment', patientId] as const,
  },
  patients: {
    all: ['patients'] as const,
    list: (filters: PatientFilters | undefined) =>
      ['patients', filters] as const,
    page: (filters: PatientFilters | undefined, from: number, to: number) =>
      ['patients', 'page', filters, from, to] as const,
  },
  pendingApprovals: {
    all: ['pending-approvals'] as const,
    byCenter: (centerId: CenterId) =>
      ['pending-approvals', centerId] as const,
  },
  pendingBillableEvents: {
    all: ['pending-billable-events'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['pending-billable-events', patientId] as const,
  },
  platformVerifactuSoftwareInfo: {
    all: ['platform-verifactu-software-info'] as const,
  },
  plaudConnection: {
    all: ['plaud-connection'] as const,
    byCenter: (centerId: CenterId) =>
      ['plaud-connection', centerId] as const,
  },
  plaudGenerationConsent: {
    all: ['plaud-generation-consent'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['plaud-generation-consent', patientId] as const,
  },
  plaudRecordings: {
    all: ['plaud-recordings'] as const,
    list: (scope: 'needs_review' | 'resolved', centerId: CenterId) =>
      ['plaud-recordings', scope, centerId] as const,
  },
  plaudRecordingsCount: {
    all: ['plaud-recordings-count'] as const,
    byCenter: (centerId: CenterId) =>
      ['plaud-recordings-count', centerId] as const,
  },
  plaudRecordingsPendingCount: {
    all: ['plaud-recordings-pending-count'] as const,
    byCenter: (centerId: CenterId) =>
      ['plaud-recordings-pending-count', centerId] as const,
  },
  plaudSessionSearch: {
    all: ['plaud-session-search'] as const,
    list: (centerId: CenterId, search: string | null | undefined) =>
      ['plaud-session-search', centerId, search] as const,
  },
  professional: {
    all: ['professional'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['professional', professionalId] as const,
  },
  professionalIntegrations: {
    all: ['professional-integrations'] as const,
    byProfessional: (professionalId: string | null | undefined) =>
      ['professional-integrations', professionalId] as const,
  },
  professionals: {
    all: ['professionals'] as const,
    byCenter: (centerId: CenterId) =>
      ['professionals', centerId] as const,
    withRoles: (centerId: CenterId) =>
      ['professionals', 'with-roles', centerId] as const,
  },
  publicAssessment: {
    all: ['public-assessment'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-assessment', token] as const,
  },
  publicAutoregistro: {
    all: ['public-autoregistro'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-autoregistro', token] as const,
  },
  publicAutoregistroEntries: {
    all: ['public-autoregistro-entries'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-autoregistro-entries', token] as const,
  },
  publicBonoTemplates: {
    all: ['public-bono-templates'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-bono-templates', token] as const,
  },
  publicBonoTemplatesSession: {
    all: ['public-bono-templates-session'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-bono-templates-session', token] as const,
  },
  publicConsent: {
    all: ['public-consent'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-consent', token] as const,
  },
  publicCoupleMembers: {
    all: ['public-couple-members'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-couple-members', token] as const,
  },
  publicCouplePartner: {
    all: ['public-couple-partner'] as const,
    list: (sessionToken: string | null | undefined, debtToken: string | null | undefined) =>
      ['public-couple-partner', sessionToken, debtToken] as const,
  },
  publicDebt: {
    all: ['public-debt'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-debt', token] as const,
  },
  publicInvoice: {
    all: ['public-invoice'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-invoice', token] as const,
  },
  publicPatientReport: {
    all: ['public-patient-report'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-patient-report', token] as const,
  },
  publicSession: {
    all: ['public-session'] as const,
    byToken: (token: string | null | undefined) =>
      ['public-session', token] as const,
    portalSlug: (token: string | null | undefined) =>
      ['public-session', token, 'portal-slug'] as const,
  },
  pendingSignup: {
    byToken: (token: string | null | undefined) =>
      ['pending-signup', token] as const,
  },
  recordings: {
    all: ['recordings'] as const,
    page: (filters: { centerId: string; userId: string; isAdmin: boolean; } | undefined, from: number, to: number) =>
      ['recordings', 'page', filters, from, to] as const,
  },
  recurringSeries: {
    all: ['recurring-series'] as const,
    bySeries: (seriesId: string | null | undefined) =>
      ['recurring-series', seriesId] as const,
  },
  referralPartners: {
    all: ['referral-partners'] as const,
    byCenter: (centerId: CenterId) =>
      ['referral-partners', centerId] as const,
  },
  referralRequests: {
    all: ['referral-requests'] as const,
    byCenter: (centerId: CenterId) =>
      ['referral-requests', centerId] as const,
  },
  referralSpecialties: {
    all: ['referral-specialties'] as const,
    byCenter: (centerId: CenterId) =>
      ['referral-specialties', centerId] as const,
  },
  scheduleExceptions: {
    all: ['schedule-exceptions'] as const,
    list: (centerId: CenterId, startDate: string | null | undefined, endDate: string | null | undefined) =>
      ['schedule-exceptions', centerId, startDate, endDate] as const,
  },
  session: {
    all: ['session'] as const,
    bySession: (id: string | null | undefined) =>
      ['session', id] as const,
  },
  sessionInvoices: {
    all: ['session-invoices'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['session-invoices', sessionId] as const,
  },
  sessionMemberConfirmations: {
    all: ['session-member-confirmations'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['session-member-confirmations', sessionId] as const,
  },
  sessionParticipants: {
    all: ['session-participants'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['session-participants', sessionId] as const,
  },
  sessionTypeLimit: {
    all: ['session-type-limit'] as const,
    list: (patientId: string | null | undefined, sessionTypeId: string | null | undefined, date: string | null | undefined, excludeSessionId: string | null | undefined) =>
      ['session-type-limit', patientId, sessionTypeId, date, excludeSessionId] as const,
  },
  sessionTypes: {
    all: ['session-types'] as const,
    byCenter: (centerId: CenterId) =>
      ['session-types', centerId] as const,
  },
  sessionTypesAll: {
    all: ['session-types-all'] as const,
    byCenter: (centerId: CenterId) =>
      ['session-types-all', centerId] as const,
  },
  sessions: {
    all: ['sessions'] as const,
    recordableToday: (userId: string | null | undefined) =>
      ['sessions', 'today', 'recordable', userId] as const,
    page: (filters: SessionListFilters | undefined, from: number, to: number, centerId: CenterId) =>
      ['sessions', 'page', filters, from, to, centerId] as const,
    stats: (filters: SessionListFilters | undefined, centerId: CenterId) =>
      ['sessions', 'stats', filters, centerId] as const,
    byDateRange: (startDate: string | null | undefined, endDate: string | null | undefined, professionalId: string | null | undefined) =>
      ['sessions', startDate, endDate, professionalId] as const,
    today: () =>
      ['sessions', 'today'] as const,
    detail: (selectedSessionId: string | null | undefined) =>
      ['sessions', 'detail', selectedSessionId] as const,
  },
  specialDays: {
    all: ['special-days'] as const,
    byCenter: (centerId: CenterId) =>
      ['special-days', centerId] as const,
  },
  stripeDiagnostics: {
    all: ['stripe-diagnostics'] as const,
    list: (userId: string | null | undefined, limit: number) =>
      ['stripe-diagnostics', userId, limit] as const,
  },
  supplier: {
    all: ['supplier'] as const,
    by: (id: string | null | undefined) =>
      ['supplier', id] as const,
  },
  suppliers: {
    all: ['suppliers'] as const,
    list: (centerId: CenterId, filters: { search?: string; activeOnly?: boolean; } | undefined) =>
      ['suppliers', centerId, filters] as const,
  },
  tariffPlanItems: {
    all: ['tariff-plan-items'] as const,
    byPlan: (planId: string | null | undefined) =>
      ['tariff-plan-items', planId] as const,
  },
  transcriptText: {
    all: ['transcript-text'] as const,
    byTranscript: (transcriptId: string | null | undefined) =>
      ['transcript-text', transcriptId] as const,
  },
  transcriptionAnalysisPatientId: {
    all: ['transcription-analysis-patient-id'] as const,
    bySession: (sessionId: string | null | undefined) =>
      ['transcription-analysis-patient-id', sessionId] as const,
  },
  transcriptionIssues: {
    all: ['transcription-issues'] as const,
    list: (centerId: CenterId, userId: string | null | undefined, isAdmin: boolean) =>
      ['transcription-issues', centerId, userId, isAdmin] as const,
  },
  unbilledSessions: {
    all: ['unbilled-sessions'] as const,
    byPatient: (patientId: string | null | undefined) =>
      ['unbilled-sessions', patientId] as const,
  },
  verifactuEvents: {
    all: ['verifactu-events'] as const,
    list: (centerId: CenterId, params: { eventType?: string; startDate?: Date; endDate?: Date; search?: string } | undefined) =>
      ['verifactu-events', centerId, params] as const,
    page: (filters: { eventType?: string; startDate?: Date; endDate?: Date; search?: string } | undefined, from: number, to: number, centerId: CenterId) =>
      ['verifactu-events', 'page', filters, from, to, centerId] as const,
    stats: (filters: { eventType?: string; startDate?: Date; endDate?: Date; search?: string } | undefined, centerId: CenterId) =>
      ['verifactu-events', 'stats', filters, centerId] as const,
  },
  whatsappMessages: {
    all: ['whatsapp-messages'] as const,
    byCenter: (centerId: CenterId) =>
      ['whatsapp-messages', centerId] as const,
  },
  whatsappSession: {
    all: ['whatsapp-session'] as const,
    byCenter: (centerId: CenterId) =>
      ['whatsapp-session', centerId] as const,
  },
} as const;

export const MONEY_KEYS = [
  qk.payments.all,
  qk.paymentStats.all,
  qk.debts.all,
  qk.debtStats.all,
  qk.invoices.all,
] as const;

export const PAYMENT_INVOICE_KEYS = [
  qk.payments.all,
  qk.debts.all,
  qk.invoices.all,
] as const;

export const BONO_KEYS = [
  qk.bonos.all,
  qk.patientActiveBonos.all,
] as const;

export const BONO_DEBT_KEYS = [
  qk.bonoSessions.all,
  qk.debts.all,
  qk.sessionPaymentStatus.all,
  qk.debtStats.all,
] as const;

export const CANCELLATION_MONEY_KEYS = [
  qk.cancellationCharges.all,
  qk.debts.all,
  qk.debtStats.all,
] as const;

export const TARIFF_PRICE_KEYS = [
  qk.tariffPlans.all,
  qk.resolvedPrice.all,
] as const;

export function invalidateKeys(queryClient: QueryClient, keys: readonly QueryKey[]): void {
  keys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}
