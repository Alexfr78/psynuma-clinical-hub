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

// ============================================================
// Advance-payment lifecycle
// ============================================================

export interface AdvancePaymentStateInput {
  paymentStatus?: string | null;
  advancePaymentDueAt?: string | Date | null;
  reminderThresholdHours?: number | null;
  now?: Date;
}

export type AdvancePaymentState = 'paid' | 'not_required' | 'pending' | 'reminder_due' | 'overdue';

export function evaluateAdvancePaymentState(input: AdvancePaymentStateInput): AdvancePaymentState {
  const status = (input.paymentStatus ?? '').toLowerCase();
  if (status === 'paid') return 'paid';
  if (!input.advancePaymentDueAt) return 'not_required';

  const dueAt = input.advancePaymentDueAt instanceof Date
    ? input.advancePaymentDueAt
    : new Date(input.advancePaymentDueAt);
  if (Number.isNaN(dueAt.getTime())) return 'pending';

  const now = input.now ?? new Date();
  if (now.getTime() >= dueAt.getTime()) return 'overdue';

  const threshold = input.reminderThresholdHours ?? 2;
  const reminderAt = new Date(dueAt.getTime() - threshold * 60 * 60 * 1000);
  if (now.getTime() >= reminderAt.getTime()) return 'reminder_due';
  return 'pending';
}

export interface ShouldAutoCancelInput {
  paymentStatus?: string | null;
  advancePaymentDueAt?: string | Date | null;
  autoCancelEnabled?: boolean | null;
  cancellationAlertThresholdHours?: number | null;
  now?: Date;
}

export function shouldAutoCancelForNonPayment(input: ShouldAutoCancelInput): boolean {
  if (!input.autoCancelEnabled) return false;
  if ((input.paymentStatus ?? '').toLowerCase() === 'paid') return false;
  if (!input.advancePaymentDueAt) return false;

  const dueAt = input.advancePaymentDueAt instanceof Date
    ? input.advancePaymentDueAt
    : new Date(input.advancePaymentDueAt);
  if (Number.isNaN(dueAt.getTime())) return false;

  const threshold = input.cancellationAlertThresholdHours ?? 2;
  const now = input.now ?? new Date();
  return now.getTime() >= dueAt.getTime() + threshold * 60 * 60 * 1000;
}

// ============================================================
// Cancellation policy evaluation
// ============================================================

export interface CancellationTier {
  // Hours before the session start. The tier matches when the cancellation
  // happens with FEWER hours of notice than this value.
  hours_before?: number;
  min_hours_before?: number;
  // Penalty as a percentage of the session price (0-100).
  penalty_percentage?: number;
  percentage?: number;
  // Optional fixed amount overrides the percentage when provided.
  fixed_amount?: number;
  label?: string;
}

export interface CancellationPolicyRules {
  tiers?: CancellationTier[];
  thresholds?: CancellationTier[];
  default_penalty_percentage?: number;
  default_percentage?: number;
  grace_minutes?: number;
  no_show_percentage?: number;
  rounding?: 'none' | 'cents' | 'euro';
}

export interface EvaluateCancellationInput {
  rules?: CancellationPolicyRules | null;
  sessionStartsAt: string | Date;
  cancelledAt?: string | Date | null;
  basePrice: number | string | null | undefined;
  isNoShow?: boolean;
}

export interface CancellationEvaluation {
  applies: boolean;
  hoursBefore: number;
  percentage: number;
  amount: number;
  basePrice: number;
  matchedTier: CancellationTier | null;
  reason: 'no_show' | 'tier' | 'default' | 'within_grace' | 'no_policy';
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function roundAmount(value: number, mode: CancellationPolicyRules['rounding']): number {
  if (mode === 'euro') return Math.round(value);
  if (mode === 'none') return value;
  return Math.round(value * 100) / 100;
}

export function evaluateCancellationCharge(input: EvaluateCancellationInput): CancellationEvaluation {
  const basePrice = Math.max(Number(input.basePrice ?? 0) || 0, 0);
  const start = toDate(input.sessionStartsAt);
  const cancelledAt = input.cancelledAt ? toDate(input.cancelledAt) : new Date();
  const hoursBefore = (start.getTime() - cancelledAt.getTime()) / (1000 * 60 * 60);
  const rules = input.rules ?? {};
  const rounding = rules.rounding ?? 'cents';

  const buildResult = (
    percentage: number,
    matchedTier: CancellationTier | null,
    reason: CancellationEvaluation['reason'],
    fixedAmount?: number,
  ): CancellationEvaluation => {
    const rawAmount = typeof fixedAmount === 'number'
      ? fixedAmount
      : (basePrice * percentage) / 100;
    const amount = roundAmount(Math.max(rawAmount, 0), rounding);
    return {
      applies: amount > 0,
      hoursBefore,
      percentage,
      amount,
      basePrice,
      matchedTier,
      reason,
    };
  };

  // No-show overrides tier matching.
  if (input.isNoShow) {
    const pct = rules.no_show_percentage ?? 100;
    return buildResult(pct, null, 'no_show');
  }

  // Grace window: if cancelled enough in advance, no penalty.
  if (rules.grace_minutes && hoursBefore * 60 >= rules.grace_minutes) {
    // Still evaluate tiers — grace_minutes only short-circuits when
    // hours_before tiers are not configured. Skip if tiers exist.
    if (!rules.tiers?.length && !rules.thresholds?.length) {
      return buildResult(0, null, 'within_grace');
    }
  }

  const tiers = (rules.tiers ?? rules.thresholds ?? [])
    .map((t) => ({
      ...t,
      hours_before: t.hours_before ?? t.min_hours_before ?? 0,
      percentage: t.percentage ?? t.penalty_percentage ?? 0,
    }))
    // Sort ascending by hours_before so the SHORTEST notice wins (highest penalty first).
    .sort((a, b) => (a.hours_before ?? 0) - (b.hours_before ?? 0));

  // Pick the lowest-notice tier whose threshold is greater than the actual notice.
  // i.e. cancelled with less notice than `hours_before` ⇒ tier applies.
  let matched: CancellationTier | null = null;
  for (const tier of tiers) {
    if (hoursBefore < (tier.hours_before ?? 0)) {
      matched = tier;
      break;
    }
  }

  if (matched) {
    return buildResult(
      matched.percentage ?? 0,
      matched,
      'tier',
      matched.fixed_amount,
    );
  }

  const defaultPct = rules.default_penalty_percentage ?? rules.default_percentage ?? 0;
  return buildResult(defaultPct, null, defaultPct > 0 ? 'default' : 'no_policy');
}

