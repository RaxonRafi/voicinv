import { Mic } from 'lucide-react';
import Link from 'next/link';

import { getContent } from '@/content';
import { fill } from '@/lib/format';
import { LOCALE_NAMES, type Locale, otherLocale } from '@/lib/locales';
import { appHome, appSignUpPath, pagePath } from '@/lib/routes';

import { LocaleSwitch } from './locale-switch';
import { NavLinks } from './nav-links';
import { ButtonLink, Container } from './ui';

/** Id of the `<main>` element, target of the skip link. */
export const MAIN_CONTENT_ID = 'main-content';

/** Product name with its mark, linking to the home page. */
export function Wordmark({ locale }: { locale: Locale }) {
  return (
    <Link
      href={pagePath(locale, 'home')}
      className="inline-flex min-h-12 items-center gap-2 rounded-md text-heading text-text-primary"
    >
      <span className="inline-flex size-8 items-center justify-center rounded-md bg-action-primary text-text-on-action">
        <Mic aria-hidden="true" className="size-5" />
      </span>
      {getContent(locale).meta.siteName}
    </Link>
  );
}

export function SiteHeader({ locale }: { locale: Locale }) {
  const { nav } = getContent(locale);
  return (
    <header className="border-b border-border-default bg-bg-surface">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:rounded-md focus:bg-bg-raised focus:px-4 focus:py-3 focus:text-body-strong focus:text-text-primary focus:shadow-md"
      >
        {nav.skipToContent}
      </a>
      <Container className="flex flex-wrap items-center justify-between gap-x-6 py-2">
        <Wordmark locale={locale} />
        <div className="order-2 flex flex-wrap items-center gap-2 md:order-3">
          <LocaleSwitch
            locale={locale}
            label={fill(nav.switchLanguage, { language: LOCALE_NAMES[otherLocale(locale)] })}
          />
          <ButtonLink variant="secondary" href={appHome(locale)}>
            {nav.openApp}
          </ButtonLink>
          {/* On phones the hero's own button sits right below, so this one would only add a row. */}
          <span className="hidden sm:inline-flex">
            <ButtonLink href={appSignUpPath(locale)}>{nav.getStarted}</ButtonLink>
          </span>
        </div>
        <NavLinks
          label={nav.mainLabel}
          className="order-3 w-full md:order-2 md:w-auto"
          items={[
            { href: pagePath(locale, 'features'), label: nav.features },
            { href: pagePath(locale, 'pricing'), label: nav.pricing },
            { href: pagePath(locale, 'download'), label: nav.download },
            { href: pagePath(locale, 'faq'), label: nav.faq },
          ]}
        />
      </Container>
    </header>
  );
}
