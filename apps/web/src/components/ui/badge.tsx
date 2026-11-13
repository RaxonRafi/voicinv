import { type ReactNode } from 'react';

import { cx } from './cx';

const TONE = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  info: 'bg-status-info-bg text-status-info',
} as const;

interface BadgeProps {
  tone: keyof typeof TONE;
  /** Icon shown before the label. Status is never conveyed by color alone (AGENTS.md §7.2). */
  icon?: ReactNode;
  children: ReactNode;
}

/** Short status label: an icon plus text on a tinted background. */
export function Badge({ tone, icon, children }: BadgeProps) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-3 py-1 text-label', TONE[tone])}
    >
      {icon}
      {children}
    </span>
  );
}
