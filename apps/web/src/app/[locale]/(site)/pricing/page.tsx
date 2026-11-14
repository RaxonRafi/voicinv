import { type Metadata } from 'next';

import { copyValues, PageIntro, PricingPlans } from '@/components';
import { getContent } from '@/content';
import { fill } from '@/lib/format';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/pricing'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  const { title, description } = getContent(locale).pricing;
  return pageMetadata(locale, 'pricing', {
    title,
    description: fill(description, copyValues(locale)),
  });
}

export default async function PricingPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  const { pricing } = getContent(locale);
  return (
    <>
      <PageIntro title={pricing.title} intro={pricing.intro} />
      <PricingPlans locale={locale} />
    </>
  );
}
