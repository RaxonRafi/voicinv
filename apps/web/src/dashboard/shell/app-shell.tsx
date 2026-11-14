'use client';

import {
  ChartColumn,
  House,
  type LucideIcon,
  Package,
  ReceiptText,
  SlidersHorizontal,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, Suspense } from 'react';

import { Button, cx, Notice, Spinner, ToastRegion } from '@/components';
import { getContent } from '@/content';
import { pagePath } from '@/lib/routes';

import { useApp, useOnline } from '../app-context';
import { type AppScreen, screenOf, sectionOf } from '../routes';
import { AuthScreen, RecoveryCodeDialog } from '../screens/auth-screen';
import { PrintHost } from '../documents/print';
import { useTheme } from './theme';

interface NavItem {
  screen: AppScreen;
  label: string;
  Glyph: LucideIcon;
}

function Navigation({ items, current }: { items: readonly NavItem[]; current: AppScreen }) {
  const { t, path } = useApp();
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-(--vl-z-sticky) border-t border-border-default bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:inset-y-0 lg:right-auto lg:w-64 lg:border-t-0 lg:border-r lg:pb-0 print:hidden"
    >
      <div className="hidden px-6 pt-6 pb-4 lg:block">
        <Link
          href={path('home')}
          className="inline-flex min-h-12 items-center gap-3 rounded-lg text-heading text-text-primary"
        >
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-action-primary to-action-primary-end text-text-on-action">
            <ReceiptText aria-hidden="true" className="size-5" />
          </span>
          VoiceLedger
        </Link>
      </div>
      <ul className="mx-auto flex max-w-xl justify-around px-1 py-1 lg:max-w-none lg:flex-col lg:gap-1 lg:px-3">
        {items.map(({ screen, label, Glyph }) => {
          const selected = screen === current;
          return (
            <li
              key={screen}
              className={cx(
                'min-w-0 flex-1 lg:flex-none',
                screen === 'settings' && 'hidden lg:block',
              )}
            >
              <Link
                href={path(screen)}
                aria-current={selected ? 'page' : undefined}
                className={cx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 text-caption-strong',
                  'lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:text-body-strong',
                  'transition-colors duration-(--vl-duration-fast) ease-standard',
                  selected ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                  selected && 'lg:bg-bg-accent',
                )}
              >
                <span
                  className={cx(
                    'inline-flex h-8 w-14 items-center justify-center rounded-full lg:h-auto lg:w-auto',
                    selected ? 'bg-bg-accent text-text-link' : '',
                  )}
                >
                  <Glyph aria-hidden="true" className="size-6" />
                </span>
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StatusBanner() {
  const { t, state, store } = useApp();
  const online = useOnline();
  if (!online) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-3 rounded-xl bg-status-warning-bg p-4 text-body text-text-primary">
          <WifiOff aria-hidden="true" className="size-6 shrink-0 text-status-warning" />
          {t.shell.offline}
        </div>
      </div>
    );
  }
  if (state.errorCode !== null && !state.syncing) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Notice
          tone="warning"
          action={
            <Button variant="ghost" onClick={() => void store.sync()}>
              {t.common.retry}
            </Button>
          }
        >
          {t.shell.syncFailed}
        </Notice>
      </div>
    );
  }
  return null;
}

/**
 * The frame of the signed-in web app. Until a session is resumed it shows a spinner; without
 * one, the sign-in screen; when the records cannot be fetched, a way to try again. Only a
 * ready shop gets the navigation and the screen itself.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale, state, store, storage } = useApp();
  const pathname = usePathname();
  useTheme(storage);

  const items: NavItem[] = [
    { screen: 'home', label: t.nav.home, Glyph: House },
    { screen: 'invoices', label: t.nav.invoices, Glyph: ReceiptText },
    { screen: 'customers', label: t.nav.customers, Glyph: UsersRound },
    { screen: 'products', label: t.nav.products, Glyph: Package },
    { screen: 'reports', label: t.nav.reports, Glyph: ChartColumn },
    { screen: 'settings', label: t.nav.settings, Glyph: SlidersHorizontal },
  ];

  let body: ReactNode;
  if (state.phase === 'starting' || state.phase === 'loading') {
    body = (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner label={t.shell.loading} />
      </main>
    );
  } else if (state.phase === 'signedOut') {
    body = <AuthScreen />;
  } else if (state.phase === 'failed') {
    body = (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-4 px-4">
        <h1 className="text-title text-text-primary">{t.shell.loadFailedTitle}</h1>
        <Notice tone="danger">
          {state.errorCode === 'NETWORK'
            ? t.errors.api.NETWORK
            : `${t.shell.loadFailedBody} (${state.errorCode ?? t.errors.api.generic})`}
        </Notice>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void store.reload()}>{t.common.retry}</Button>
          <Button variant="secondary" onClick={() => void store.signOut()}>
            {t.settings.signOut}
          </Button>
        </div>
      </main>
    );
  } else {
    body = (
      <>
        <Navigation items={items} current={sectionOf(screenOf(pathname))} />
        <main className="min-h-dvh pb-24 lg:pb-0 lg:pl-64">
          <StatusBanner />
          <Suspense fallback={<Spinner label={t.common.loading} />}>{children}</Suspense>
          <p className="px-4 pt-4 pb-8 text-center text-caption text-text-secondary">
            <Link href={pagePath(locale, 'home')} className="underline underline-offset-4">
              {t.shell.aboutLink}
            </Link>{' '}
            · {getContent(locale).meta.siteName}
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      {body}
      <ToastRegion />
      <RecoveryCodeDialog />
      <PrintHost />
    </>
  );
}
