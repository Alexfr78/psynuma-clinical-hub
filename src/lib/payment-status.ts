// Single source of truth for settlement statuses shown across Cobros / Deudas.
// Unifies labels and badge variants that were previously duplicated per
// component, and includes the 'refunded' state introduced by Stripe refunds
// (previously missing, so refunded debts fell back to "Pendiente").

export type SettlementStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'cancelled';

export interface SettlementStatusDisplay {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

// Debt-oriented labels (feminine: "deuda"). Payment/session screens can add
// their own catalogs following this same shape as they are migrated.
export const DEBT_STATUS_DISPLAY: Record<SettlementStatus, SettlementStatusDisplay> = {
  pending: { label: 'Pendiente', variant: 'destructive' },
  partial: { label: 'Parcial', variant: 'default' },
  paid: { label: 'Pagada', variant: 'outline' },
  refunded: { label: 'Reembolsada', variant: 'secondary' },
  cancelled: { label: 'Cancelada', variant: 'secondary' },
};

export function getDebtStatusDisplay(status: string | null | undefined): SettlementStatusDisplay {
  return DEBT_STATUS_DISPLAY[status as SettlementStatus] ?? DEBT_STATUS_DISPLAY.pending;
}
