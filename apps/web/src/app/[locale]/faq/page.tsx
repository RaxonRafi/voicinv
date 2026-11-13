import { type Metadata } from 'next';

import { FaqList, PageIntro, WaitlistSection } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/faq'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return pageMetadata(locale, 'faq', getContent(locale).faq);
}

export default async function FaqPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  const { faq } = getContent(locale);
  return (
    <>
      <PageIntro title={faq.title} intro={faq.intro} width="narrow" />
      <FaqList locale={locale} />
      <WaitlistSection locale={locale} tone="canvas" />
    </>
  );
}
