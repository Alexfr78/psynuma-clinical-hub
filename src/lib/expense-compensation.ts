/**
 * Pure logic for attributing collected/invoiced money to professionals and
 * computing their variable/fixed/mixed compensation for a period.
 *
 * This mirrors the SQL in `calculate_professional_variable_amount` /
 * `_calculate_professional_variable_amount_internal` (see the expenses
 * module migration) so the proration algorithm — including the edge case of
 * a bono whose sessions are split across two professionals — can be unit
 * tested without a database. The edge functions and the SQL RPC are the
 * source of truth for production numbers; this module exists to make the
 * algorithm itself reviewable and testable in isolation.
 */

export type CompensationType = 'fixed' | 'percentage' | 'mixed';

export interface PaymentForAttribution {
  id: string;
  amount: number;
  sessionId: string | null;
  invoiceId: string | null;
}

export interface SessionForAttribution {
  id: string;
  professionalId: string;
}

export interface InvoiceItemForAttribution {
  invoiceId: string;
  total: number;
  sessionId: string | null;
  bonoId: string | null;
}

export interface BonoItemForAttribution {
  bonoId: string;
  sessionId: string | null;
}

export interface AttributionResult {
  /** Amount attributed to each professional_id. */
  byProfessional: Record<string, number>;
  /** Amount that could not be attributed to any professional (surfaced to the admin). */
  unattributed: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Attributes a set of payments (already filtered to the desired period and
 * status by the caller) to the professionals whose sessions generated them.
 *
 * Rules (in order), matching section 5 / 2.4 of the design doc:
 * 1. payment.sessionId set -> 100% to that session's professional.
 * 2. payment.invoiceId set (session_id null) -> split the payment across the
 *    invoice's line items proportionally to each item's `total`, then:
 *    a. item.sessionId set -> that professional gets the item's share.
 *    b. item.bonoId set -> the share is prorated across the professionals
 *       who have attended sessions consumed from that bono, proportional to
 *       each professional's session count within the bono.
 *    c. neither -> unattributable.
 * 3. Neither sessionId nor invoiceId -> unattributable.
 */
export function attributePaymentsToProfessionals(
  payments: PaymentForAttribution[],
  sessions: SessionForAttribution[],
  invoiceItems: InvoiceItemForAttribution[],
  bonoItems: BonoItemForAttribution[],
): AttributionResult {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const itemsByInvoice = new Map<string, InvoiceItemForAttribution[]>();
  for (const item of invoiceItems) {
    const list = itemsByInvoice.get(item.invoiceId) ?? [];
    list.push(item);
    itemsByInvoice.set(item.invoiceId, list);
  }

  // Professional session-count per bono (only sessions actually consumed, i.e. session_id set).
  const sessionCountByBonoAndProfessional = new Map<string, Map<string, number>>();
  const totalSessionCountByBono = new Map<string, number>();
  for (const bonoItem of bonoItems) {
    if (!bonoItem.sessionId) continue;
    const session = sessionById.get(bonoItem.sessionId);
    if (!session) continue;
    totalSessionCountByBono.set(bonoItem.bonoId, (totalSessionCountByBono.get(bonoItem.bonoId) ?? 0) + 1);
    const perProf = sessionCountByBonoAndProfessional.get(bonoItem.bonoId) ?? new Map<string, number>();
    perProf.set(session.professionalId, (perProf.get(session.professionalId) ?? 0) + 1);
    sessionCountByBonoAndProfessional.set(bonoItem.bonoId, perProf);
  }

  const byProfessional: Record<string, number> = {};
  let unattributed = 0;

  const addToProfessional = (professionalId: string, amount: number) => {
    byProfessional[professionalId] = (byProfessional[professionalId] ?? 0) + amount;
  };

  for (const payment of payments) {
    if (payment.sessionId) {
      const session = sessionById.get(payment.sessionId);
      if (session) {
        addToProfessional(session.professionalId, payment.amount);
      } else {
        unattributed += payment.amount;
      }
      continue;
    }

    if (payment.invoiceId) {
      const items = itemsByInvoice.get(payment.invoiceId) ?? [];
      const invoiceTotal = items.reduce((sum, item) => sum + item.total, 0);

      if (items.length === 0 || invoiceTotal === 0) {
        unattributed += payment.amount;
        continue;
      }

      for (const item of items) {
        const itemShare = payment.amount * (item.total / invoiceTotal);

        if (item.sessionId) {
          const session = sessionById.get(item.sessionId);
          if (session) {
            addToProfessional(session.professionalId, itemShare);
          } else {
            unattributed += itemShare;
          }
          continue;
        }

        if (item.bonoId) {
          const totalBonoSessions = totalSessionCountByBono.get(item.bonoId) ?? 0;
          const perProf = sessionCountByBonoAndProfessional.get(item.bonoId);
          if (totalBonoSessions > 0 && perProf) {
            for (const [professionalId, count] of perProf.entries()) {
              addToProfessional(professionalId, itemShare * (count / totalBonoSessions));
            }
          } else {
            unattributed += itemShare;
          }
          continue;
        }

        // Line item has neither a session nor a bono reference.
        unattributed += itemShare;
      }
      continue;
    }

    // Payment with neither session_id nor invoice_id.
    unattributed += payment.amount;
  }

  const rounded: Record<string, number> = {};
  for (const [professionalId, amount] of Object.entries(byProfessional)) {
    rounded[professionalId] = round2(amount);
  }

  return { byProfessional: rounded, unattributed: round2(unattributed) };
}

/**
 * Computes the compensation amount for a professional given their agreement
 * terms and the collected total already attributed to them for the period.
 */
export function calculateCompensationAmount(
  compensationType: CompensationType,
  fixedAmount: number,
  percentageRate: number,
  collectedTotal: number,
): number {
  if (compensationType === 'fixed') return round2(fixedAmount);
  if (compensationType === 'percentage') return round2((collectedTotal * percentageRate) / 100);
  // mixed
  return round2(fixedAmount + (collectedTotal * percentageRate) / 100);
}
