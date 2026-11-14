import { type ReactNode } from 'react';

import { cx } from './cx';

const TONE = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  info: 'bg-status-info-bg text-status-info',
  neutral: 'bg-bg-sunken text-money-cancelled',
} as const;

export type BadgeTone = keyof typeof TONE;

interface BadgeProps {
  tone: BadgeTone;
  /** Icon shown before the label. Status is never conveyed by color alone (AGENTS.md §7.2). */
  icon?: ReactNode;
  children: ReactNode;
}

/** Short status label: an icon plus text on a tinted background. */
export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-label whitespace-nowrap',
        TONE[tone],
      )}
    >
      {icon}
      {children}
    </span>
  );
}
