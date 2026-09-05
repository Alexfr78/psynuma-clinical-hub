import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";


import { cn } from "@/lib/utils";
import { Icon } from '@/components/ui/icon';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // `rounded-sm` resolves to `calc(var(--radius) - 4px)` in this theme's
      // tailwind config (--radius is 0.75rem, a value tuned for cards/buttons),
      // i.e. 8px — half of this 16px box, rendering a full circle instead of a
      // softly rounded square. That makes an unchecked checkbox visually
      // identical to an unchecked radio button. `rounded` (Tailwind's
      // unmodified 4px default) keeps a small, deliberate corner instead.
      "peer h-4 w-4 shrink-0 rounded border border-primary ring-offset-background data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}>
      {/* Deliberately smaller than the h-4 w-4 box: a same-size glyph has zero
          margin and relies entirely on the font's internal padding, which is
          thin/fragile for the outlined "check" glyph. `filled` gives it a
          bolder stroke so it reads clearly at 16px. */}
      <Icon name="check" filled className="h-3 w-3" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
