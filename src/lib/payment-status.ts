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

// --- Session scheduling status COLOURS (canonical hue per status) ---
// Same hue for the same state across every screen. Each screen picks the
// representation that matches how it renders the status:
//   - badgeClass: coloured pill (use with <Badge variant="outline">)
//   - textClass:  text/icon colour
//   - dotClass:   coloured status dot
export interface SessionStatusDisplay {
  label: string;
  badgeClass: string;
  textClass: string;
  dotClass: string;
}

const SESSION_STATUS_COLORS: Record<string, { badgeClass: string; textClass: string; dotClass: string }> = {
  draft: {
    badgeClass: 'bg-muted text-muted-foreground',
    textClass: 'text-muted-foreground',
    dotClass: 'bg-gray-400',
  },
  scheduled: {
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    textClass: 'text-blue-600 dark:text-blue-400',
    dotClass: 'bg-blue-500',
  },
  confirmed: {
    badgeClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    dotClass: 'bg-green-500',
  },
  completed: {
    badgeClass: 'bg-muted text-muted-foreground',
    textClass: 'text-muted-foreground',
    dotClass: 'bg-gray-500',
  },
  cancelled: {
    badgeClass: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    textClass: 'text-red-600 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
  no_show: {
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    textClass: 'text-orange-600 dark:text-orange-400',
    dotClass: 'bg-orange-500',
  },
  blocked: {
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    textClass: 'text-purple-600 dark:text-purple-400',
    dotClass: 'bg-purple-500',
  },
  rescheduled: {
    badgeClass: 'bg-muted text-muted-foreground',
    textClass: 'text-muted-foreground',
    dotClass: 'bg-gray-400',
  },
  reschedule_requested: {
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    textClass: 'text-amber-600 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
  pending_approval: {
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    textClass: 'text-amber-600 dark:text-amber-400',
    dotClass: 'bg-amber-500',
  },
};

export function getSessionStatusDisplay(status: string | null | undefined): SessionStatusDisplay {
  const key = status ?? '';
  const colors = SESSION_STATUS_COLORS[key] ?? SESSION_STATUS_COLORS.scheduled;
  return { label: getSessionStatusLabel(key), ...colors };
}
