import './globals.css';

import { type Metadata } from 'next';

import { ButtonLink, Container, Heading, Text } from '@/components';
import { getContent } from '@/content';
import { DEFAULT_LOCALE, LOCALES } from '@/lib/locales';
import { pagePath } from '@/lib/routes';

export const metadata: Metadata = {
  title: `${getContent(DEFAULT_LOCALE).notFound.title} — ${getContent(DEFAULT_LOCALE).meta.siteName}`,
};

/**
 * 404 page for the whole static site. It is rendered outside the `[locale]` layout, so the
 * visitor's language is unknown here and the message is shown in every published language.
 */
export default function GlobalNotFound() {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="flex min-h-dvh flex-col">
        <main className="flex flex-1 items-center py-16">
          <Container width="narrow" className="flex flex-col gap-12">
            {LOCALES.map((locale, index) => {
              const { notFound } = getContent(locale);
              return (
                <section key={locale} lang={locale} className="flex flex-col items-start gap-4">
                  <Heading level={index === 0 ? 1 : 2} size="display">
                    {notFound.title}
                  </Heading>
                  <Text>{notFound.body}</Text>
                  <ButtonLink
                    variant={index === 0 ? 'primary' : 'secondary'}
                    href={pagePath(locale, 'home')}
                  >
                    {notFound.home}
                  </ButtonLink>
                </section>
              );
            })}
          </Container>
        </main>
      </body>
    </html>
  );
}
