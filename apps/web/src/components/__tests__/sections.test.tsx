import { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { getContent } from '@/content';
import { LOCALES } from '@/lib/locales';

import { Hero, HowItWorks } from '../home-sections';
import {
  DownloadPanel,
  FaqList,
  FeatureGroups,
  LegalDocument,
  PricingPlans,
} from '../page-sections';
import { VoiceDemo } from '../voice-demo';

/** Server-renders a section and returns its HTML with tags removed, for text assertions. */
function render(element: ReactElement): { html: string; text: string } {
  const html = renderToStaticMarkup(element);
  return { html, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
}

describe.each(LOCALES)('page sections (%s)', (locale) => {
  const content = getContent(locale);

  it('renders the hero with one h1 and both calls to action', () => {
    const { html, text } = render(<Hero locale={locale} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(text).toContain(content.home.hero.title);
    // The trailing slash before `#` is added by Next.js at build time (`trailingSlash: true`).
    expect(html).toMatch(new RegExp(`href="/${locale}/?#waitlist"`));
    expect(html).toContain('href="#how-it-works"');
  });

  it('shows total, paid and due in the voice example, each with a text label', () => {
    const { text } = render(<VoiceDemo locale={locale} />);
    const { demo } = content.home;
    for (const label of [demo.totalLabel, demo.paidLabel, demo.dueLabel, demo.status]) {
      expect(text).toContain(label);
    }
    expect(text).toContain(demo.caption);
  });

  it('numbers the three steps in the language’s own digits', () => {
    const { html, text } = render(<HowItWorks locale={locale} />);
    expect(html.match(/<li/g)).toHaveLength(3);
    expect(text).toContain(locale === 'bn' ? '৩' : '3');
  });

  it('lists every feature group', () => {
    const { text } = render(<FeatureGroups locale={locale} />);
    for (const group of content.features.groups) expect(text).toContain(group.title);
  });

  it('fills the free plan allowance into the pricing copy', () => {
    const { text } = render(<PricingPlans locale={locale} />);
    expect(text).not.toContain('{count}');
    expect(text).toContain(locale === 'bn' ? '৩০' : '30');
    expect(text).toContain(content.pricing.free.name);
    expect(text).toContain(content.pricing.pro.price);
  });

  it('renders every question as a native disclosure with its answer', () => {
    const { html, text } = render(<FaqList locale={locale} />);
    expect(html.match(/<details/g)).toHaveLength(content.faq.items.length);
    expect(text).not.toContain('{count}');
    for (const item of content.faq.items) expect(text).toContain(item.question);
  });

  it('states the download status in words, not only with color', () => {
    const { text } = render(<DownloadPanel locale={locale} />);
    expect(text).toContain(content.download.status);
  });

  it.each(['privacy', 'terms'] as const)('renders the %s document with its date', (key) => {
    const { html, text } = render(<LegalDocument locale={locale} document={content[key]} />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.match(/<h2/g)).toHaveLength(content[key].sections.length);
    expect(text).not.toContain('{date}');
    expect(text).toContain(locale === 'bn' ? '২০২৬' : '2026');
  });
});

describe('design-system usage', () => {
  it('never emits inline styles or raw color values from page sections', () => {
    const { html } = render(
      <>
        <Hero locale="en" />
        <PricingPlans locale="en" />
        <FaqList locale="bn" />
      </>,
    );
    expect(html).not.toMatch(/style="/);
    expect(html).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});
