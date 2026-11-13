import { type ReactNode } from 'react';

import { cx } from './cx';

interface CardProps {
  children: ReactNode;
  /** `raised` adds a shadow for content that sits above the page (hero illustration, form). */
  elevation?: 'flat' | 'raised';
  /** `accent` draws a stronger border, e.g. for the highlighted pricing plan. */
  emphasis?: 'default' | 'accent';
  className?: string;
}

/** Surface that groups related content. */
export function Card({ children, elevation = 'flat', emphasis = 'default', className }: CardProps) {
  return (
    <div
      className={cx(
        'rounded-lg border bg-bg-surface p-6',
        emphasis === 'accent' ? 'border-action-primary' : 'border-border-default',
        elevation === 'raised' && 'shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}
