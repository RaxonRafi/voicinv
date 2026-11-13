import { getContent } from '@/content';
import { type Locale } from '@/lib/locales';
import { pagePath } from '@/lib/routes';
import { CONTACT_EMAIL } from '@/lib/site-config';

import { NavLinks } from './nav-links';
import { Wordmark } from './site-header';
import { Container, Text } from './ui';

export function SiteFooter({ locale }: { locale: Locale }) {
  const { nav, footer } = getContent(locale);
  return (
    <footer className="border-t border-border-default bg-bg-surface py-8">
      <Container className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Wordmark locale={locale} />
          <Text>{footer.tagline}</Text>
        </div>
        <NavLinks
          label={nav.footerLabel}
          className="-mx-3"
          items={[
            { href: pagePath(locale, 'features'), label: nav.features },
            { href: pagePath(locale, 'pricing'), label: nav.pricing },
            { href: pagePath(locale, 'download'), label: nav.download },
            { href: pagePath(locale, 'faq'), label: nav.faq },
            { href: pagePath(locale, 'privacy'), label: nav.privacy },
            { href: pagePath(locale, 'terms'), label: nav.terms },
          ]}
        />
        {CONTACT_EMAIL ? (
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="inline-flex min-h-12 items-center self-start text-body text-text-link underline underline-offset-4"
          >
            {CONTACT_EMAIL}
          </a>
        ) : null}
      </Container>
    </footer>
  );
}
