'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isCurrentPage } from '@/lib/routes';

import { cx } from './ui';

export interface NavItem {
  href: string;
  label: string;
}

interface NavLinksProps {
  /** Accessible name of the navigation landmark. */
  label: string;
  items: readonly NavItem[];
  className?: string;
}

/**
 * Row of page links that wraps on narrow screens and at large text sizes. The current page is
 * marked with `aria-current` and an underline, not by color alone.
 */
export function NavLinks({ label, items, className }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex flex-wrap items-center gap-x-1">
        {items.map((item) => {
          const current = isCurrentPage(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-12 items-center rounded-md px-3 text-body underline-offset-8',
                  'transition-colors duration-(--vl-duration-fast) ease-standard hover:text-text-primary hover:underline',
                  current ? 'text-text-primary underline' : 'text-text-secondary',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
