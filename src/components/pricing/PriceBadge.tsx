import { Badge } from '@/components/ui/badge';
import { Clock, Tag, CheckCircle, AlertCircle } from 'lucide-react';
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

  const { pricing_source, is_temporary, valid_to } = resolvedPrice;

  // Determinar si la tarifa ha caducado
  const today = new Date().toISOString().split('T')[0];
  const isExpired = valid_to != null && valid_to < today;

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

  if (is_temporary) {
    return (
      <Badge
        className={cn('gap-1 font-normal text-xs bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100', className)}
        variant="outline"
      >
        <Clock className="h-3 w-3" />
        {compact ? 'Temporal' : `Temporal · hasta ${formatDate(valid_to)}`}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn('gap-1 font-normal text-xs bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100', className)}
      variant="outline"
    >
      <Tag className="h-3 w-3" />
      Tarifa personalizada
    </Badge>
  );
}

/** Badge compacto que solo muestra el importe con su fuente de precio */
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
      {pricing_source === 'custom' && (
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
