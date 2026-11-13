import '../globals.css';

import { type Metadata } from 'next';

import { MAIN_CONTENT_ID, SiteFooter, SiteHeader } from '@/components';
import { LOCALES } from '@/lib/locales';
import { requireLocale } from '@/lib/page-metadata';
import { SITE_URL } from '@/lib/site-config';

// Only the published languages exist; every other `/<segment>/` is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const metadata: Metadata = { metadataBase: new URL(SITE_URL) };

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = requireLocale((await params).locale);
  return (
    <html lang={locale}>
      <body className="flex min-h-dvh flex-col">
        <SiteHeader locale={locale} />
        <main id={MAIN_CONTENT_ID} className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
