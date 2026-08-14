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

// --- Session scheduling status LABELS (single source of truth) ---
// Only the label text is centralised here; each screen keeps its own colours/
// variants/icons, which differ intentionally by context. This guarantees the
// wording never drifts between screens.

export const SESSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  scheduled: 'Programada',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
  blocked: 'Bloqueado',
  rescheduled: 'Reprogramada',
  reschedule_requested: 'Reprogramación solicitada',
  pending_approval: 'Pendiente aprobación',
};

export function getSessionStatusLabel(status: string | null | undefined): string {
  return SESSION_STATUS_LABELS[status ?? ''] ?? (status ?? '');
}
