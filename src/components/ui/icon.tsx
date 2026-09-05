import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders a Material Symbols Outlined glyph (rediseño Stitch).
 *
 * Sizing works differently than the SVG icons it replaces: Material Symbols
 * scale with `font-size`, not `height`/`width`. Since the codebase sizes
 * icons with Tailwind height/width utilities (`h-4 w-4`), we sniff those
 * classes out of `className` and translate them to an equivalent font-size
 * so existing call sites don't need to change their sizing classes.
 */

const SIZE_CLASS_TO_PX: Record<string, number> = {
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 28,
  '8': 32,
  '9': 36,
  '10': 40,
  '12': 48,
  '14': 56,
  '16': 64,
  '20': 80,
  '24': 96,
};

function sizeFromClassName(className?: string): number {
  if (!className) return 16;
  const match = className.match(/(?:^|\s)h-(\d+(?:\.\d+)?)(?:\s|$)/);
  if (match && SIZE_CLASS_TO_PX[match[1]]) {
    return SIZE_CLASS_TO_PX[match[1]];
  }
  return 16;
}

export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Material Symbols glyph name, e.g. "calendar_month" */
  name: string;
  /** Use the filled variant (FILL 1) instead of outlined */
  filled?: boolean;
  /** Explicit pixel size; overrides size sniffed from className (h-4, h-5, ...) */
  size?: number;
}

export function Icon({ name, filled = false, size, className, style, ...props }: IconProps) {
  const px = size ?? sizeFromClassName(className);
  return (
    <span
      translate="no"
      aria-hidden="true"
      className={cn('material-symbols-outlined shrink-0 select-none leading-none align-middle', className)}
      style={{
        fontSize: `${px}px`,
        width: `${px}px`,
        height: `${px}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' ${px}`,
        ...style,
      }}
      {...props}
    >
      {name}
    </span>
  );
}
