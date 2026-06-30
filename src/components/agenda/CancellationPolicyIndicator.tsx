import { AlertTriangle, FileCheck2, FileClock, FileX2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CancellationPolicyIndicatorProps {
  status?: string | null;
  compact?: boolean;
  showLabel?: boolean;
}

const config = {
  signed: {
    label: 'Política firmada',
    icon: FileCheck2,
    className: 'text-green-600 bg-green-500/10 border-green-500/20',
  },
  pending_signature: {
    label: 'Política pendiente de firma',
    icon: FileClock,
    className: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  },
  not_signed: {
    label: 'Sin política firmada',
    icon: FileX2,
    className: 'text-destructive bg-destructive/10 border-destructive/20',
  },
  outdated: {
    label: 'Política anterior firmada',
    icon: AlertTriangle,
    className: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
  },
};

export function CancellationPolicyIndicator({
  status,
  compact = false,
  showLabel = false,
}: CancellationPolicyIndicatorProps) {
  if (!status) return null;
  const item = config[status as keyof typeof config];
  if (!item) return null;

  const Icon = item.icon;
  const content = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border',
        compact ? 'h-4 w-4 rounded-full' : showLabel ? 'h-7 gap-1 rounded-md px-2 text-xs' : 'h-5 w-5 rounded-full',
        item.className,
      )}
      aria-label={item.label}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {showLabel && <span>{item.label}</span>}
    </span>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>{item.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
