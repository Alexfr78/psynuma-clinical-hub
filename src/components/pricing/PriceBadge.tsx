import { Badge } from '@/components/ui/badge';
import { Clock, Tag, CheckCircle, AlertCircle, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ResolvedPrice } from '@/hooks/useCustomPrices';

interface PriceBadgeProps {
  resolvedPrice: ResolvedPrice | null | undefined;
  /** Muestra solo el badge de origen sin precio */
  compact?: boolean;
  className?: string;
}

export function PriceBadge({ resolvedPrice, compact = false, className }: PriceBadgeProps) {
  if (!resolvedPrice) return null;

  const { pricing_source, is_temporary, valid_to, tariff_plan_name } = resolvedPrice;

  const today = new Date().toISOString().split('T')[0];
  const isExpired = valid_to != null && valid_to < today;

  // ── Tarifa general (base) ──────────────────────────────────
  if (pricing_source === 'base') {
    return (
      <Badge
        variant="secondary"
        className={cn('gap-1 font-normal text-xs', className)}
      >
        <CheckCircle className="h-3 w-3" />
        Tarifa general
      </Badge>
    );
  }

  // ── Caducada ───────────────────────────────────────────────
  if (isExpired) {
    return (
      <Badge
        variant="outline"
        className={cn('gap-1 font-normal text-xs border-orange-300 text-orange-600 bg-orange-50', className)}
      >
        <AlertCircle className="h-3 w-3" />
        Caducada
      </Badge>
    );
  }

  // ── Plan tarifario asignado ────────────────────────────────
  if (pricing_source === 'tariff_plan') {
    if (is_temporary) {
      return (
        <Badge
          variant="outline"
          className={cn('gap-1 font-normal text-xs border-violet-300 text-violet-700 bg-violet-50', className)}
        >
          <Clock className="h-3 w-3" />
          {compact
            ? (tariff_plan_name ?? 'Tarifa asignada')
            : `${tariff_plan_name ?? 'Tarifa asignada'} · hasta ${formatDate(valid_to)}`}
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className={cn('gap-1 font-normal text-xs border-violet-300 text-violet-700 bg-violet-50', className)}
      >
        <Layers className="h-3 w-3" />
        {tariff_plan_name ?? 'Tarifa asignada'}
      </Badge>
    );
  }

  // ── Excepción manual (custom) ──────────────────────────────
  if (is_temporary) {
    return (
      <Badge
        variant="outline"
        className={cn('gap-1 font-normal text-xs border-blue-300 text-blue-700 bg-blue-50', className)}
      >
        <Clock className="h-3 w-3" />
        {compact ? 'Exc. temporal' : `Excepción · hasta ${formatDate(valid_to)}`}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-normal text-xs border-emerald-300 text-emerald-700 bg-emerald-50', className)}
    >
      <Tag className="h-3 w-3" />
      Excepción manual
    </Badge>
  );
}

/** Badge + precio aplicado con tachado del precio base si difiere */
interface PriceDisplayProps {
  resolvedPrice: ResolvedPrice | null | undefined;
  className?: string;
}

export function PriceDisplay({ resolvedPrice, className }: PriceDisplayProps) {
  if (!resolvedPrice) return null;

  const { applied_price, base_price, pricing_source } = resolvedPrice;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-semibold">{applied_price.toFixed(2)} €</span>
      {pricing_source !== 'base' && base_price != null && applied_price !== base_price && (
        <span className="text-xs text-muted-foreground line-through">{base_price.toFixed(2)} €</span>
      )}
      <PriceBadge resolvedPrice={resolvedPrice} compact />
    </div>
  );
}

function formatDate(date: string | null): string {
  if (!date) return '';
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}
