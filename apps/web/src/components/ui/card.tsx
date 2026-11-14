import { type ReactNode } from 'react';

import { cx } from './cx';

interface CardProps {
  children: ReactNode;
  /** `raised` adds a deeper shadow for content that sits above the page (hero illustration). */
  elevation?: 'flat' | 'raised';
  /** `accent` draws a border in the action color, e.g. for the highlighted pricing plan. */
  emphasis?: 'default' | 'accent';
  /** `hero` is the tinted gradient surface used for the headline number of a screen. */
  tone?: 'surface' | 'hero';
  /** `none` lets a list of rows run edge to edge. */
  padding?: 'none' | 'md' | 'lg';
  className?: string;
}

const PADDING = { none: '', md: 'p-4', lg: 'p-6' } as const;

/** Surface that groups related content: soft shadow, large radius. */
export function Card({
  children,
  elevation = 'flat',
  emphasis = 'default',
  tone = 'surface',
  padding = 'lg',
  className,
}: CardProps) {
  return (
    <div
      className={cx(
        'rounded-2xl',
        tone === 'hero'
          ? 'bg-linear-to-br from-bg-hero to-bg-hero-end text-text-primary'
          : 'bg-bg-surface',
        emphasis === 'accent' && 'border-2 border-action-primary',
        elevation === 'raised' ? 'shadow-md' : 'shadow-sm',
        PADDING[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
