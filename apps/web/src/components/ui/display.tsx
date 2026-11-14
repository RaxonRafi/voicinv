import { LoaderCircle } from 'lucide-react';
import { type ReactNode } from 'react';

import { cx } from './cx';

interface OverlineProps {
  children: ReactNode;
  /** Renders as a heading of this level instead of plain text. */
  level?: 2 | 3;
  className?: string;
}

/** Small uppercase label above a group of content ("CUSTOMER", "TOP PRODUCTS"). */
export function Overline({ children, level, className }: OverlineProps) {
  const Tag = level === undefined ? 'p' : (`h${level}` as const);
  return (
    <Tag className={cx('text-overline text-text-secondary uppercase', className)}>{children}</Tag>
  );
}

const TILE_SIZE = { md: 'size-12 text-body-strong', lg: 'size-16 text-heading' } as const;
const TILE_SHAPE = { square: 'rounded-xl', round: 'rounded-full' } as const;
const TILE_TONE = {
  /** Tinted background, for products, invoices and settings rows. */
  soft: 'bg-bg-sunken text-text-link',
  /** The action gradient, for people and the app's own mark. */
  solid: 'bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action',
  success: 'bg-status-success-bg text-status-success',
} as const;

interface TileProps {
  /** An icon, or one letter (the initial of a name). Decorative: the row names the thing. */
  children: ReactNode;
  size?: keyof typeof TILE_SIZE;
  shape?: keyof typeof TILE_SHAPE;
  tone?: keyof typeof TILE_TONE;
}

/** Leading mark of a list row or header: an icon or an initial on a tinted tile. */
export function Tile({ children, size = 'md', shape = 'square', tone = 'soft' }: TileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center',
        TILE_SIZE[size],
        TILE_SHAPE[shape],
        TILE_TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  /** `glass` sits on a hero card; `surface` stands alone on the page. */
  tone?: 'glass' | 'surface';
  valueTone?: 'primary' | 'paid' | 'due';
}

const VALUE_TONE = {
  primary: 'text-text-primary',
  paid: 'text-money-paid',
  due: 'text-money-due',
} as const;

/** A labelled figure. Amounts use tabular numerals so columns of them line up. */
export function StatTile({ label, value, tone = 'surface', valueTone = 'primary' }: StatTileProps) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-col gap-1 rounded-xl p-3 sm:p-4',
        tone === 'glass' ? 'bg-bg-surface/60' : 'bg-bg-surface shadow-sm',
      )}
    >
      <span className="text-label text-text-secondary">{label}</span>
      <span className={cx('text-amount tabular-nums wrap-anywhere', VALUE_TONE[valueTone])}>
        {value}
      </span>
    </div>
  );
}

interface ProgressBarProps {
  /** Share that is filled, as whole percent from 0 to 100. */
  percent: number;
  /** Text alternative, e.g. "Collected ৳100 of ৳150". */
  label: string;
  tone?: 'action' | 'strong';
}

/**
 * Horizontal bar showing a share of a whole. Drawn as an image with a text alternative; the
 * numbers it stands for are always printed next to it as well.
 */
export function ProgressBar({ percent, label, tone = 'action' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <svg
      role="img"
      aria-label={label}
      className={cx('h-2 w-full', tone === 'strong' ? 'text-text-primary' : 'text-action-primary')}
    >
      <rect width="100%" height="100%" rx="4" className="fill-bg-surface/60" />
      <rect width={`${clamped}%`} height="100%" rx="4" fill="currentColor" />
    </svg>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  /** A button or link that fixes the emptiness. */
  action?: ReactNode;
}

/** Shown in place of a list that has nothing to show yet. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-bg-surface p-8 text-center shadow-sm">
      {icon ? (
        <Tile tone="success" shape="round">
          {icon}
        </Tile>
      ) : null}
      <p className="text-heading text-text-primary">{title}</p>
      {body ? <p className="text-body text-text-secondary">{body}</p> : null}
      {action}
    </div>
  );
}

/** Indeterminate progress, with a label for screen readers and people waiting. */
export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-12 text-text-secondary">
      <LoaderCircle aria-hidden="true" className="size-8 motion-safe:animate-spin" />
      <p className="text-body">{label}</p>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  tone?: keyof typeof VALUE_TONE;
  strong?: boolean;
}

/** One line of a totals list: label on the left, figure on the right. */
export function SummaryRow({ label, value, tone = 'primary', strong = false }: SummaryRowProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt
        className={cx(
          strong ? 'text-body-strong text-text-primary' : 'text-body text-text-secondary',
        )}
      >
        {label}
      </dt>
      <dd
        className={cx(
          'tabular-nums',
          strong ? 'text-amount' : 'text-body-strong',
          VALUE_TONE[tone],
        )}
      >
        {value}
      </dd>
    </div>
  );
}
