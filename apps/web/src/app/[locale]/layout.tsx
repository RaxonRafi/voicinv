import '../globals.css';

import { type Metadata } from 'next';

import { LOCALES } from '@/lib/locales';
import { requireLocale } from '@/lib/page-metadata';
import { SITE_URL } from '@/lib/site-config';

// Only the published languages exist; every other `/<segment>/` is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

/**
 * Root of every page in a language. The public pages (`(site)/`) add the marketing header and
 * footer; the signed-in web app (`app/`) adds its own frame.
 */
export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = requireLocale((await params).locale);
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
