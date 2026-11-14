import { type Metadata } from 'next';

import { FeatureGroups, PageIntro, GetStartedSection } from '@/components';
import { getContent } from '@/content';
import { pageMetadata, requireLocale } from '@/lib/page-metadata';

type Props = PageProps<'/[locale]/features'>;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = requireLocale((await params).locale);
  return pageMetadata(locale, 'features', getContent(locale).features);
}

export default async function FeaturesPage({ params }: Props) {
  const locale = requireLocale((await params).locale);
  const { features } = getContent(locale);
  return (
    <>
      <PageIntro title={features.title} intro={features.intro} />
      <FeatureGroups locale={locale} />
      <GetStartedSection locale={locale} tone="canvas" />
    </>
  );
}
