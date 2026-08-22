import { CalendarDays, CircleUserRound, Home, WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PortalMainSection = 'home' | 'appointments' | 'payments' | 'account';

interface PortalNavigationProps {
  activeSection: PortalMainSection;
  onSelect: (section: PortalMainSection) => void;
}

const items = [
  { id: 'home' as const, label: 'Inicio', icon: Home },
  { id: 'appointments' as const, label: 'Citas', icon: CalendarDays },
  { id: 'payments' as const, label: 'Pagos', icon: WalletCards },
  { id: 'account' as const, label: 'Mi cuenta', icon: CircleUserRound },
];

export function PortalNavigation({ activeSection, onSelect }: PortalNavigationProps) {
  return (
    <>
      <nav aria-label="Secciones del portal" className="hidden rounded-xl border bg-card p-1.5 shadow-sm md:block">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => {
            const Icon = item.icon;
            const selected = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      <nav
        aria-label="Secciones del portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-2 pt-2 shadow-[0_-8px_24px_-16px_hsl(var(--foreground)/0.35)] backdrop-blur supports-[backdrop-filter]:bg-card/90 md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          {items.map((item) => {
            const Icon = item.icon;
            const selected = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'bg-primary/10 text-primary' : 'text-muted-foreground active:bg-muted',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
