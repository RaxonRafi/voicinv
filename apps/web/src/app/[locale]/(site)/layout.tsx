import { MAIN_CONTENT_ID, SiteFooter, SiteHeader } from '@/components';
import { requireLocale } from '@/lib/page-metadata';

/** Frame of the public pages: header, main content and footer. */
export default async function SiteLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const locale = requireLocale((await params).locale);
  return (
    <>
      <SiteHeader locale={locale} />
      <main id={MAIN_CONTENT_ID} className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
