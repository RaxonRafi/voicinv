import { type Metadata } from 'next';

import { LegalDocument } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/terms'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return pageMetadata(locale, 'terms', getContent(locale).terms);
}

export default async function TermsPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  return <LegalDocument locale={locale} document={getContent(locale).terms} />;
}
