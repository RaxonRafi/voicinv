import Link from 'next/link';
import { type ComponentProps, type ReactNode } from 'react';

import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary';

/**
 * Shared look of buttons and button-like links.
 *
 * States: default, hover/pressed (darker fill), focused (visible focus ring from the global
 * stylesheet), disabled (muted fill, no pointer), loading (pass `disabled` plus a spinner icon).
 * The minimum height is the 48px touch target.
 */
function buttonClasses(variant: ButtonVariant, fullWidth: boolean): string {
  return cx(
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 py-2 text-center',
    'text-body-strong transition-colors duration-(--vl-duration-fast) ease-standard',
    'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
    variant === 'primary' &&
      'bg-action-primary text-text-on-action hover:bg-action-primary-pressed active:bg-action-primary-pressed disabled:bg-action-disabled disabled:text-text-disabled',
    variant === 'secondary' &&
      'border border-border-strong bg-bg-surface text-text-primary hover:bg-bg-sunken active:bg-bg-sunken disabled:border-border-default disabled:text-text-disabled',
    fullWidth && 'w-full',
  );
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  fullWidth?: boolean;
  children: ReactNode;
}

type ButtonProps = ButtonOwnProps & Omit<ComponentProps<'button'>, 'className' | 'children'>;

export function Button({
  variant = 'primary',
  fullWidth = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, fullWidth)} {...rest}>
      {children}
    </button>
  );
}

type ButtonLinkProps = ButtonOwnProps & { href: string };

/** A navigation link that looks like a button. */
export function ButtonLink({
  variant = 'primary',
  fullWidth = false,
  href,
  children,
}: ButtonLinkProps) {
  return (
    <Link href={href} className={buttonClasses(variant, fullWidth)}>
      {children}
    </Link>
  );
}
