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
