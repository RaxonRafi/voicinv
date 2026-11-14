import { type Metadata } from 'next';

import { Hero, Highlights, HowItWorks, GetStartedSection } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  const { home, meta } = getContent(locale);
  return pageMetadata(locale, 'home', { title: home.title, description: meta.description });
}

export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const locale = requireLocale((await params).locale);
  return (
    <>
      <Hero locale={locale} />
      <HowItWorks locale={locale} />
      <Highlights locale={locale} />
      <GetStartedSection locale={locale} />
    </>
  );
}
