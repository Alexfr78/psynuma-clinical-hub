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

// --- Bono lifecycle status (distinct from settlement) ---
// Shared by BonoCard and BonoDetailDialog, which previously each kept their own
// identical copy of this map.

export type BonoStatus = 'active' | 'exhausted' | 'expired' | 'cancelled';

export const BONO_STATUS_DISPLAY: Record<BonoStatus, SettlementStatusDisplay> = {
  active: { label: 'Activo', variant: 'default' },
  exhausted: { label: 'Agotado', variant: 'secondary' },
  expired: { label: 'Expirado', variant: 'destructive' },
  cancelled: { label: 'Cancelado', variant: 'outline' },
};

export function getBonoStatusDisplay(status: string | null | undefined): SettlementStatusDisplay {
  return BONO_STATUS_DISPLAY[status as BonoStatus] ?? BONO_STATUS_DISPLAY.active;
}
