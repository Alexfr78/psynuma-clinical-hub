import { CheckCircle2, CreditCard, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface PaymentStatusIndicatorProps {
  paymentStatus?: string | null;
  price?: number | string | null;
  bonoId?: string | null;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
}

function resolvePaymentState({
  paymentStatus,
  price,
  bonoId,
}: Pick<PaymentStatusIndicatorProps, 'paymentStatus' | 'price' | 'bonoId'>): 'paid' | 'pending' | 'refunded' | null {
  const status = (paymentStatus || '').toLowerCase();
  const amount = Number(price ?? 0);

  if (status === 'refunded') return 'refunded';
  if (status === 'paid' || status === 'bono' || !!bonoId) return 'paid';
  if (amount > 0) return 'pending';
  return null;
}

export function PaymentStatusIndicator({
  paymentStatus,
  price,
  bonoId,
  compact = false,
  showLabel = false,
  className,
}: PaymentStatusIndicatorProps) {
  const state = resolvePaymentState({ paymentStatus, price, bonoId });
  if (!state) return null;

  const isPaid = state === 'paid';
  const isRefunded = state === 'refunded';
  const Icon = isRefunded ? RotateCcw : isPaid ? CheckCircle2 : CreditCard;
  const label = isRefunded ? 'Reembolsado' : isPaid ? 'Pagado' : 'Pago pendiente';

  const content = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border bg-background/90 shadow-sm',
        isRefunded
          ? 'border-slate-500/30 text-slate-700 dark:text-slate-300'
          : isPaid
          ? 'border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 text-amber-700 dark:text-amber-300',
        compact ? 'h-4 min-w-4 px-0.5' : 'h-5 min-w-5 px-1',
        showLabel && 'gap-1.5 rounded-md px-2 text-xs font-medium',
        className,
      )}
      aria-label={label}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {showLabel && <span>{label}</span>}
    </span>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
