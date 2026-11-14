'use client';

import { ArrowLeft } from 'lucide-react';
import { type ReactNode } from 'react';

import { cx, IconLink, Spinner } from '@/components';

import { useApp } from '../app-context';

interface ScreenProps {
  title: string;
  /** Where the back arrow leads; screens at the top of a section have none. */
  backHref?: string;
  /** Small line above the title, e.g. today's date on the home screen. */
  eyebrow?: string;
  /** Buttons at the right of the header. */
  actions?: ReactNode;
  /** A bar fixed to the bottom of the screen, e.g. the total and Save of an invoice. */
  footer?: ReactNode;
  /** `wide` gives lists and reports room on large screens. */
  width?: 'narrow' | 'wide';
  children: ReactNode;
}

/** Frame of every screen: a header with the title (the page's one h1) and the content below. */
export function Screen({
  title,
  backHref,
  eyebrow,
  actions,
  footer,
  width = 'narrow',
  children,
}: ScreenProps) {
  const { t } = useApp();
  return (
    <div
      className={cx(
        'mx-auto flex w-full flex-col gap-6 px-4 pt-6 sm:px-6',
        width === 'wide' ? 'max-w-5xl' : 'max-w-3xl',
        footer ? 'pb-36' : 'pb-8',
      )}
    >
      <header className="flex items-start gap-2">
        {backHref ? (
          <div className="-ml-3">
            <IconLink href={backHref} label={t.common.back}>
              <ArrowLeft aria-hidden="true" className="size-6" />
            </IconLink>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col pt-1">
          {eyebrow ? <p className="text-body text-text-secondary">{eyebrow}</p> : null}
          <h1
            className={cx(
              'text-balance text-text-primary wrap-anywhere',
              backHref ? 'text-title' : 'text-display',
            )}
          >
            {title}
          </h1>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
      {footer ? (
        <div className="fixed inset-x-0 bottom-0 z-(--vl-z-sticky) border-t border-border-default bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:left-64 print:hidden">
          <div
            className={cx(
              'mx-auto flex flex-wrap items-center gap-4 px-4 py-3 sm:px-6',
              width === 'wide' ? 'max-w-5xl' : 'max-w-3xl',
            )}
          >
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Placeholder while a screen's record is looked up, or when it no longer exists. */
export function ScreenMessage({
  title,
  backHref,
  message,
}: {
  title: string;
  backHref?: string;
  message?: string;
}) {
  const { t } = useApp();
  return (
    <Screen title={title} backHref={backHref}>
      {message ? (
        <p className="text-body text-text-secondary">{message}</p>
      ) : (
        <Spinner label={t.common.loading} />
      )}
    </Screen>
  );
}
