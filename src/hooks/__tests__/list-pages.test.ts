import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  requests: [] as { url: URL; init: RequestInit }[],
  rows: [] as Record<string, unknown>[],
  total: 1234,
  admin: false,
  allRows: false,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-query')>(),
  useQuery: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({}),
}));
vi.mock('../useAuth', () => ({ useAuth: () => ({
  profile: { center_id: 'center' }, user: { id: 'professional' }, isAdmin: state.admin,
}) }));
vi.mock('../useCenter', () => ({ useCenter: () => ({ centerId: 'center', center: { id: 'center' } }) }));
vi.mock('../useCancellationCharges', () => ({ createCancellationChargeForSessionCancellation: vi.fn() }));
vi.mock('../useCancellationPolicy', () => ({ resolvePatientCancellationPolicyForSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://pagination.invalid', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      state.requests.push({ url, init: init ?? {} });
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? 1000);
      const rows = state.allRows ? state.rows.slice(offset, offset + limit) : state.rows;
      return new Response(init?.method === 'HEAD' ? null : JSON.stringify(rows), {
        status: 200, headers: { 'content-type': 'application/json', 'content-range': `0-9/${state.total}` },
      });
    } },
  }) };
});

import { useExpenses, useExpensesPage, useExpenseStats } from '../useExpenses';
import { useBonosPage, useBonoListStats } from '../useBonos';
import { useNotificationsPage, useNotificationCounts, usePendingNotifications } from '../useNotifications';
import { useConsentsPage } from '../useConsents';
import { useAssessmentsPage, useAssessmentCounts } from '../useAssessments';
import { useIntakeRequestsPage } from '../useIntakeRequests';
import { useSessionsPage, fetchSessionList } from '../useSessions';
import { useRecordingsPage } from '../useRecordings';
import { useAuditLogsPage, useAuditAnomalyCount } from '../useAuditLogs';

import { useInvoices, useInvoicesPage, useInvoicesAnalytics, useInvoiceStats, useInvoiceOrphanCount } from '../useInvoices';
import { usePayments, usePaymentsPage, usePaymentsAnalytics, usePaymentStats } from '../usePayments';
import { useDebts, useDebtsPage } from '../useDebts';
import { useVerifactuEventsPage, useVerifactuEventStats, fetchVerifactuEventList } from '../useVerifactuEvents';

interface QueryOptions {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  placeholderData?: unknown;
}
const options = (result: unknown) => result as QueryOptions;
const params = () => state.requests[state.requests.length - 1].url.searchParams;
const range = { from: 1000, to: 1009 };

beforeEach(() => {
  state.requests = [];
  state.rows = [];
  state.total = 1234;
  state.admin = false;
  state.allRows = false;
});

describe('consultas paginadas', () => {
  it.each([
    ['invoices', () => useInvoicesPage({}, range), 'invoice_number.desc,id.asc'],
    ['debts', () => useDebtsPage({}, range), 'created_at.desc,id.asc'],
    ['payments', () => usePaymentsPage({}, range), 'payment_date.desc,id.asc'],
    ['verifactu-events', () => useVerifactuEventsPage({}, range), 'created_at.desc,id.asc'],
    ['expenses', () => useExpensesPage({}, range), 'expense_date.desc,id.asc'],
    ['bonos', () => useBonosPage({}, range), 'created_at.desc,id.asc'],
    ['notifications', () => useNotificationsPage({}, range), 'created_at.desc,id.asc'],
    ['consents', () => useConsentsPage({ pendingAt: '2026-09-30T10:00:00.000Z' }, range), 'created_at.desc,id.asc'],
    ['assessments', () => useAssessmentsPage({ tab: 'completed' }, range), 'created_at.desc,id.asc'],
    ['intake-requests', () => useIntakeRequestsPage({}, range), 'created_at.desc,id.asc'],
    ['sessions', () => useSessionsPage({}, range), 'session_date.desc,start_time.desc,id.asc'],
    ['recordings', () => useRecordingsPage(range), 'created_at.desc,id.asc'],
    ['audit-logs', () => useAuditLogsPage({}, range), 'seq.desc,id.asc'],
  ])('%s conserva total, prefijo de invalidación, rango y desempate', async (key, hook, order) => {
    const query = options(hook());
    expect(query.queryKey.slice(0, 2)).toEqual([key, 'page']);
    expect(query.placeholderData).toBeTypeOf('function');
    expect(await query.queryFn()).toEqual({ rows: [], total: 1234 });
    expect(params().get('offset')).toBe('1000');
    expect(params().get('limit')).toBe('10');
    expect(params().get('order')).toBe(order);
    expect(new Headers(state.requests[state.requests.length - 1].init.headers).get('prefer')).toContain('count=exact');
  });

  it('comparte los filtros de gastos sin paginar el hook antiguo', async () => {
    const filters = { month: '2024-02', categoryId: 'category', supplierId: 'supplier', professionalId: 'professional', status: 'paid' as const, kind: 'variable' as const };
    await options(useExpenses(filters)).queryFn();
    const original = new URLSearchParams(params());
    expect(original.has('limit')).toBe(false);
    await options(useExpensesPage(filters, range)).queryFn();
    for (const [key, value] of original) {
      if (key !== 'order') expect(params().getAll(key)).toContain(value);
    }
    expect(params().getAll('expense_date')).toEqual(['gte.2024-02-01', 'lte.2024-02-29']);
  });

  it('intersecta estado y pestaña sin sustituir filtros en los contadores', async () => {
    await options(useNotificationsPage({ status: 'sent', tab: 'pending', type: 'email' }, range)).queryFn();
    expect(params().getAll('status')).toEqual(['eq.sent', 'eq.pending']);
    expect(params().get('type')).toBe('eq.email');
    state.requests = [];
    await options(useNotificationCounts({ status: 'sent', type: 'email' })).queryFn();
    expect(state.requests).toHaveLength(4);
    for (const request of state.requests) {
      expect(request.init.method).toBe('HEAD');
      expect(request.url.searchParams.getAll('status')).toContain('eq.sent');
      expect(request.url.searchParams.has('limit')).toBe(false);
    }
  });

  it('filtra expiración antes del rango y normaliza la respuesta de evaluación', async () => {
    const now = '2026-09-30T10:00:00.000Z';
    await options(useConsentsPage({ pendingAt: now }, range)).queryFn();
    expect(params().get('expires_at')).toBe(`gte.${now}`);
    state.rows = [{ id: 'assessment', response: [{ id: 'response' }] }];
    const result = await options(useAssessmentsPage({ tab: 'pending', now }, range)).queryFn();
    expect(params().get('expires_at')).toBe(`gt.${now}`);
    expect(result).toEqual({ rows: [{ id: 'assessment', response: { id: 'response' } }], total: 1234 });
    await options(useAssessmentCounts(now)).queryFn();
    // Entrecomillada: ':' y '.' son reservados dentro de un or() de PostgREST.
    expect(params().get('or')).toContain(`expires_at.lte."${now}"`);
    expect(state.requests[state.requests.length - 1].init.method).toBe('HEAD');
  });

  it('mantiene bonos compartidos e importes más allá de 1000 filas', async () => {
    await options(useBonosPage({ patientId: 'patient', status: 'active' }, range)).queryFn();
    expect(params().get('or')).toBe('(patient_id.eq.patient,shared_with_patient_id.eq.patient)');
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, (_, id) => ({ id, status: 'active', total_sessions: 10, used_sessions: 2, total_price: 25, created_at: new Date().toISOString() }));
    expect(await options(useBonoListStats('patient')).queryFn()).toMatchObject({ active: 1003, pendingSessions: 8024, monthlyRevenue: 25075 });
  });

  it('conserva filtros de solicitudes', async () => {
    await options(useIntakeRequestsPage({ type: 'referral', status: 'pending', search: 'Ana' }, range)).queryFn();
    expect(params().get('request_type')).toBe('eq.referral');
    expect(params().get('status')).toBe('eq.pending');
    expect(params().get('or')).toBe('(first_name.ilike.%Ana%,last_name.ilike.%Ana%,email.ilike.%Ana%)');
  });

  it('los importes de gastos incluyen todos los bloques', async () => {
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, () => ({
      amount: 25, paid_amount: 0, status: 'pending', due_date: '2020-01-01', expense_date: '2026-09-01',
    }));
    expect(await options(useExpenseStats('2026-09')).queryFn()).toEqual({
      totalPending: 25075, totalPaidThisMonth: 0, overdueCount: 1003, overdueAmount: 25075,
    });
  });

  it('procesar pendientes conserva el conjunto completo y la fecha de corte', async () => {
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, (_, id) => ({ id }));
    expect(await options(usePendingNotifications()).queryFn()).toHaveLength(1003);
    expect(state.requests).toHaveLength(3);
    expect(new Set(state.requests.map(r => r.url.searchParams.get('scheduled_for'))).size).toBe(1);
    expect(params().get('order')).toBe('scheduled_for.asc,id.asc');
  });

  it('excluye bloqueos y aplica cada término al paciente antes de paginar', async () => {
    await options(useSessionsPage({ search: 'Ana a_*%', professionalId: 'professional', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-30' }, range)).queryFn();
    expect(params().get('select')).toContain('sessions_patient_id_fkey!inner');
    expect(params().get('blocked_patient')).toBe('is.null');
    expect(params().get('blocked_patient.first_name')).toBe('like.[Bloqueado]%');
    expect(params().getAll('status')).toEqual(['neq.cancelled', 'neq.blocked', 'eq.completed']);
    expect(params().getAll('patient.or')).toHaveLength(2);
    expect(params().getAll('patient.or')[1]).toContain('imatch.');
    expect(params().getAll('session_date')).toEqual(['gte.2026-09-01', 'lte.2026-09-30']);
  });

  it('el CSV de sesiones recorre todos los bloques', async () => {
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, (_, id) => ({ id: String(id) }));
    expect(await fetchSessionList({})).toHaveLength(1003);
    expect(state.requests.map(r => r.url.searchParams.get('offset'))).toEqual(['0', '500', '1000']);
  });

  it('mantiene el ámbito profesional de grabaciones', async () => {
    await options(useRecordingsPage(range)).queryFn();
    expect(params().get('professional_id')).toBe('eq.professional');
    expect(params().get('created_at')).toMatch(/^gte\./);
    state.admin = true;
    await options(useRecordingsPage(range)).queryFn();
    expect(params().has('professional_id')).toBe(false);
  });

  it('cuenta anomalías sin el límite interno de 1000 del RPC', async () => {
    expect(await options(useAuditAnomalyCount('2026-09-01', '2026-09-30')).queryFn()).toBe(1234);
    expect(params().get('p_limit')).toBe('2147483647');
    expect(params().get('p_anomalous_only')).toBe('true');
    expect(state.requests[state.requests.length - 1].init.method).toBe('HEAD');
  });
});

describe('busqueda calculada y conjuntos completos', () => {
  it.each([
    ['invoices', useInvoicesPage],
    ['debts', useDebtsPage],
    ['payments', usePaymentsPage],
    ['verifactu-events', useVerifactuEventsPage],
  ])('%s busca el termino completo y neutraliza caracteres especiales', async (_key, hook) => {
    await options(hook({ search: '  Ana Garcia  ' }, range)).queryFn();
    expect(params().get('search_text')).toBe('ilike.*Ana Garcia*');
    await options(hook({ search: '  Ana*%_,("test")  ' }, range)).queryFn();
    expect(params().get('search_text')).toBe('ilike.*Ana,("test")*');
    expect(params().has('or')).toBe(false);
    expect(params().get('offset')).toBe('1000');
    expect(params().get('limit')).toBe('10');
    expect(new Headers(state.requests[state.requests.length - 1].init.headers).get('prefer')).toContain('count=exact');
    await options(hook({ search: '*%_' }, range)).queryFn();
    expect(params().get('search_text')).toBe('ilike.');
    await options(hook({ search: '   ' }, range)).queryFn();
    expect(params().has('search_text')).toBe(false);
    await options(hook({ search: String.raw`a\b` }, range)).queryFn();
    expect(params().get('search_text')).toBe(String.raw`ilike.*a\\b*`);
  });

  it('comparte filtros de facturas y mantiene las pesta?as y el orden', async () => {
    const filters = { patientId: 'p', startDate: '2026-09-01', endDate: '2026-09-30', status: 'paid', sortBy: 'issue_date' as const, sortDirection: 'asc' as const };
    await options(useInvoices(filters)).queryFn();
    const oldParams = new URLSearchParams(params());
    expect(oldParams.has('limit')).toBe(false);
    await options(useInvoicesPage(filters, range)).queryFn();
    for (const [key, value] of oldParams) if (key !== 'order' && key !== 'select') expect(params().getAll(key)).toContain(value);
    expect(params().get('order')).toBe('issue_date.asc,id.asc');
    await options(useInvoicesPage({ status: 'verifactu_pending' }, range)).queryFn();
    expect(params().get('verifactu_pending')).toBe('eq.true');
    expect(params().has('status')).toBe(false);
    await options(useInvoiceOrphanCount(filters)).queryFn();
    expect(state.requests[state.requests.length - 1].init.method).toBe('HEAD');
    expect(params().getAll('status')).toEqual(['eq.paid', 'in.(issued,paid)']);
    expect(params().getAll('or')).toEqual([
      '(verifactu_registration_id.is.null,verifactu_registration_id.eq."")',
      '(verifactu_pending.is.null,verifactu_pending.eq.false)',
      '(invoice_number.is.null,invoice_number.not.like.BORRADOR-*)',
    ]);
    expect(params().has('limit')).toBe(false);
  });

  it('excluye facturas invalidadas o canceladas sin perder deudas sin factura', async () => {
    await options(useDebtsPage({}, range)).queryFn();
    expect(params().get('select')).toContain('excluded_invoice:invoices()');
    expect(params().get('excluded_invoice.or')).toBe('(is_valid.eq.false,status.eq.cancelled)');
    expect(params().get('excluded_invoice')).toBe('is.null');
    expect(params().get('status')).toBe('in.(pending,partial)');
    await options(useDebtsPage({ patientId: 'p', status: 'paid' }, range)).queryFn();
    expect(params().get('patient_id')).toBe('eq.p');
    expect(params().get('status')).toBe('eq.paid');
    await options(useDebts()).queryFn();
    expect(params().has('limit')).toBe(false);
  });

  it('mantiene filtros de pagos sin paginar el hook compartido', async () => {
    const filters = { patientId: 'p', startDate: '2026-09-01', endDate: '2026-09-30' };
    await options(usePayments(filters)).queryFn();
    const oldParams = new URLSearchParams(params());
    expect(oldParams.has('limit')).toBe(false);
    await options(usePaymentsPage(filters, range)).queryFn();
    for (const [key, value] of oldParams) if (key !== 'order' && key !== 'select') expect(params().getAll(key)).toContain(value);
  });

  it('cuenta todos los eventos con los mismos filtros y conserva las exportaciones completas', async () => {
    const filters = { eventType: 'error', search: 'invoice', startDate: new Date('2026-09-01T12:00:00Z'), endDate: new Date('2026-09-30T12:00:00Z') };
    expect(await options(useVerifactuEventStats(filters)).queryFn()).toEqual({ total: 1234, today: 1234, rfGenerated: 1234, errors: 1234 });
    expect(state.requests).toHaveLength(4);
    for (const request of state.requests) {
      expect(request.init.method).toBe('HEAD');
      expect(request.url.searchParams.get('center_id')).toBe('eq.center');
      expect(request.url.searchParams.get('search_text')).toBe('ilike.*invoice*');
      expect(request.url.searchParams.getAll('event_type')).toContain('eq.error');
      expect(request.url.searchParams.getAll('created_at').length).toBeGreaterThanOrEqual(2);
      expect(request.url.searchParams.has('limit')).toBe(false);
    }
    state.requests = [];
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, (_, id) => ({ id: String(id) }));
    expect(await fetchVerifactuEventList(filters, 'center')).toHaveLength(1003);
    expect(state.requests.map(r => r.url.searchParams.get('offset'))).toEqual(['0', '500', '1000']);
  });

  it('graficos y estadisticas financieras incluyen mas de 1000 filas', async () => {
    state.allRows = true;
    state.rows = Array.from({ length: 1003 }, (_, id) => ({ id: String(id), total: 25, amount: 25, status: 'paid', refunded_amount: 0, retention_amount: 0, payment_method: 'cash' }));
    expect(await options(useInvoicesAnalytics({})).queryFn()).toHaveLength(1003);
    expect(await options(usePaymentsAnalytics({})).queryFn()).toHaveLength(1003);
    expect(await options(useInvoiceStats()).queryFn()).toMatchObject({ count: 1003, totalPaid: 25075 });
    expect(await options(usePaymentStats()).queryFn()).toMatchObject({ grossCount: 1003, grossAmount: 25075 });
  });
});
