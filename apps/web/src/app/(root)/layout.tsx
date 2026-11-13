import '../globals.css';

import { type Metadata } from 'next';
import { type ReactNode } from 'react';

import { getContent } from '@/content';
import { DEFAULT_LOCALE } from '@/lib/locales';
import { languageAlternates } from '@/lib/page-metadata';
import { pagePath } from '@/lib/routes';
import { SITE_URL } from '@/lib/site-config';

const { meta } = getContent(DEFAULT_LOCALE);

// The site root only forwards visitors to a language, so search engines are pointed at the
// default-language home page instead.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: meta.siteName,
  description: meta.description,
  alternates: {
    canonical: pagePath(DEFAULT_LOCALE, 'home'),
    languages: languageAlternates('home'),
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
