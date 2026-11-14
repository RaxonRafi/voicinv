import { type Metadata } from 'next';

import { DownloadPanel } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/download'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return pageMetadata(locale, 'download', getContent(locale).download);
}

export default async function DownloadPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  return <DownloadPanel locale={locale} />;
}
