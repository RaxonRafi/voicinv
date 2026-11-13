import { type Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getContent } from '@/content';

import { DEFAULT_LOCALE, INTL_LOCALE, isLocale, type Locale, LOCALES } from './locales';
import { type PageKey, pagePath } from './routes';

/** Narrows the `[locale]` route parameter, answering 404 for anything unpublished. */
export function requireLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

/** `hreflang` map of one page in every published language, plus the default. */
export function languageAlternates(page: PageKey): Record<string, string> {
  const languages: Record<string, string> = { 'x-default': pagePath(DEFAULT_LOCALE, page) };
  for (const locale of LOCALES) languages[locale] = pagePath(locale, page);
  return languages;
}

interface PageCopy {
  title: string;
  description: string;
}

/** Title, description, canonical URL and language alternates for a marketing page. */
export function pageMetadata(locale: Locale, page: PageKey, copy: PageCopy): Metadata {
  const { siteName } = getContent(locale).meta;
  const title = page === 'home' ? `${siteName} — ${copy.title}` : `${copy.title} — ${siteName}`;
  return {
    title,
    description: copy.description,
    alternates: { canonical: pagePath(locale, page), languages: languageAlternates(page) },
    openGraph: {
      type: 'website',
      siteName,
      title,
      description: copy.description,
      url: pagePath(locale, page),
      locale: INTL_LOCALE[locale],
    },
  };
}
