export type PaymentMode = 'required_now' | 'in_session' | 'post_session' | 'scheduled_before';

const PAYMENT_MODES = new Set<PaymentMode>([
  'required_now',
  'in_session',
  'post_session',
  'scheduled_before',
]);

export interface ResolvePaymentRulesInput {
  sessionPaymentMode?: string | null;
  patientPaymentMode?: string | null;
  patientRequireAdvancePaymentAlways?: boolean | null;
  centerDefaultPaymentMode?: string | null;
  sessionAdvancePaymentLimitHours?: number | null;
  centerDefaultAdvancePaymentLimitHours?: number | null;
  centerDefaultScheduledHoursBefore?: number | null;
  sessionDate?: string | Date | null;
  startTime?: string | null;
  price?: number | string | null;
}

export interface ResolvedPaymentRules {
  paymentMode: PaymentMode;
  source: 'session' | 'patient' | 'center' | 'fallback';
  paymentStatus: 'pending' | 'paid';
  requiresAdvancePayment: boolean;
  advancePaymentLimitHours: number | null;
  advancePaymentDueAt: string | null;
}

function asPaymentMode(value?: string | null): PaymentMode | null {
  return value && PAYMENT_MODES.has(value as PaymentMode) ? (value as PaymentMode) : null;
}

function resolveMode(input: ResolvePaymentRulesInput): Pick<ResolvedPaymentRules, 'paymentMode' | 'source'> {
  const sessionMode = asPaymentMode(input.sessionPaymentMode);
  if (sessionMode) return { paymentMode: sessionMode, source: 'session' };

  const patientMode = asPaymentMode(input.patientPaymentMode);
  if (patientMode) return { paymentMode: patientMode, source: 'patient' };

  const centerMode = asPaymentMode(input.centerDefaultPaymentMode);
  if (centerMode) return { paymentMode: centerMode, source: 'center' };

  return { paymentMode: 'in_session', source: 'fallback' };
}

function buildSessionDateTime(sessionDate?: string | Date | null, startTime?: string | null): Date | null {
  if (!sessionDate || !startTime) return null;

  const datePart = sessionDate instanceof Date
    ? [
        sessionDate.getFullYear(),
        String(sessionDate.getMonth() + 1).padStart(2, '0'),
        String(sessionDate.getDate()).padStart(2, '0'),
      ].join('-')
    : sessionDate;

  const dateTime = new Date(`${datePart}T${startTime}`);
  return Number.isNaN(dateTime.getTime()) ? null : dateTime;
}

export function resolvePaymentRules(input: ResolvePaymentRulesInput): ResolvedPaymentRules {
  const { paymentMode, source } = resolveMode(input);
  const price = Number(input.price ?? 0);
  const paymentStatus = price > 0 ? 'pending' : 'paid';
  const requiresAdvancePayment = price > 0 && (
    input.patientRequireAdvancePaymentAlways === true
    || paymentMode === 'required_now'
    || paymentMode === 'scheduled_before'
  );

  const advancePaymentLimitHours = requiresAdvancePayment
    ? input.sessionAdvancePaymentLimitHours
      ?? input.centerDefaultAdvancePaymentLimitHours
      ?? input.centerDefaultScheduledHoursBefore
      ?? 12
    : null;

  const sessionDateTime = buildSessionDateTime(input.sessionDate, input.startTime);
  const advancePaymentDueAt = requiresAdvancePayment && sessionDateTime && advancePaymentLimitHours !== null
    ? new Date(sessionDateTime.getTime() - advancePaymentLimitHours * 60 * 60 * 1000).toISOString()
    : null;

  return {
    paymentMode,
    source,
    paymentStatus,
    requiresAdvancePayment,
    advancePaymentLimitHours,
    advancePaymentDueAt,
  };
}
