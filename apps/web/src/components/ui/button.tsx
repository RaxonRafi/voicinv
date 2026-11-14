import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';

import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary:
    'bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action ' +
    'hover:from-action-primary-pressed active:from-action-primary-pressed ' +
    'disabled:bg-none disabled:bg-action-disabled disabled:text-text-disabled',
  secondary:
    'bg-bg-sunken text-text-primary hover:bg-bg-accent active:bg-bg-accent ' +
    'disabled:bg-action-disabled disabled:text-text-disabled',
  ghost: 'text-text-link hover:bg-bg-sunken active:bg-bg-sunken disabled:text-text-disabled',
  danger:
    'bg-status-danger-bg text-status-danger hover:bg-bg-sunken active:bg-bg-sunken ' +
    'disabled:bg-action-disabled disabled:text-text-disabled',
};

const SIZE: Readonly<Record<ButtonSize, string>> = {
  md: 'min-h-12 rounded-lg px-6',
  lg: 'min-h-14 rounded-xl px-6',
};

/**
 * Shared look of buttons and button-like links.
 *
 * States: default, hover/pressed (darker fill), focused (visible focus ring from the global
 * stylesheet), disabled (muted fill, no pointer) and loading (disabled, with a spinner in place
 * of the icon). The minimum height is the 48px touch target.
 */
export function buttonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  fullWidth: boolean,
): string {
  return cx(
    'inline-flex items-center justify-center gap-2 py-2 text-center text-body-strong',
    'transition-colors duration-(--vl-duration-fast) ease-standard',
    'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
  );
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Icon shown before the label; replaced by a spinner while loading. */
  icon?: ReactNode;
  children: ReactNode;
}

type ButtonProps = ButtonOwnProps & {
  loading?: boolean;
} & Omit<ComponentProps<'button'>, 'className' | 'children'>;

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  type = 'button',
  loading = false,
  disabled,
  icon,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, fullWidth)}
      {...rest}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-5 shrink-0 motion-safe:animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}

type ButtonLinkProps = ButtonOwnProps & { href: string };

/** A navigation link that looks like a button. */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  href,
  icon,
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses(variant, size, fullWidth)}>
      {icon}
      {children}
    </Link>
  );
}
