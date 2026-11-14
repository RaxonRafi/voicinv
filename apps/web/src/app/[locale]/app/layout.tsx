import { type Metadata } from 'next';

import { getAppContent, getContent } from '@/content';
import { AppShell, DashboardProvider } from '@/dashboard';
import { requireLocale } from '@/lib/page-metadata';

export async function generateMetadata({
  params,
}: LayoutProps<'/[locale]/app'>): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return {
    title: `${getAppContent(locale).nav.home} — ${getContent(locale).meta.siteName}`,
    // The signed-in app has nothing for search engines.
    robots: { index: false, follow: false },
  };
}

/** The signed-in web app: online only, shows the same records as the shop's phones. */
export default async function AppLayout({ children, params }: LayoutProps<'/[locale]/app'>) {
  const locale = requireLocale((await params).locale);
  return (
    <DashboardProvider locale={locale}>
      <AppShell>{children}</AppShell>
    </DashboardProvider>
  );
}
