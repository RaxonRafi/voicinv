import { type Metadata } from 'next';

import { LegalDocument } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/privacy'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return pageMetadata(locale, 'privacy', getContent(locale).privacy);
}

export default async function PrivacyPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  return <LegalDocument locale={locale} document={getContent(locale).privacy} />;
}
