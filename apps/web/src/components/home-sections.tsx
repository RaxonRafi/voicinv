import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

import { getContent } from '@/content';
import { formatNumber } from '@/lib/format';
import { type Locale } from '@/lib/locales';
import { pagePath, waitlistPath } from '@/lib/routes';

import { ButtonLink, Card, Heading, IconTile, Section, Text } from './ui';
import { VoiceDemo } from './voice-demo';

/** Id of the "how it works" section, target of the hero's secondary button. */
const HOW_IT_WORKS_ID = 'how-it-works';

export function Hero({ locale }: { locale: Locale }) {
  const { hero } = getContent(locale).home;
  return (
    <Section labelledBy="hero-title">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Text size="label">{hero.eyebrow}</Text>
          <Heading level={1} id="hero-title">
            {hero.title}
          </Heading>
          <Text>{hero.subtitle}</Text>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={waitlistPath(locale)}>{hero.primaryCta}</ButtonLink>
            <ButtonLink variant="secondary" href={`#${HOW_IT_WORKS_ID}`}>
              {hero.secondaryCta}
            </ButtonLink>
          </div>
          <ul className="flex flex-col gap-2">
            {hero.points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-body text-text-primary">
                <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-status-success" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <VoiceDemo locale={locale} />
      </div>
    </Section>
  );
}

export function HowItWorks({ locale }: { locale: Locale }) {
  const { steps } = getContent(locale).home;
  return (
    <Section id={HOW_IT_WORKS_ID} tone="sunken" labelledBy="steps-title">
      <div className="flex flex-col gap-8">
        <Heading level={2} id="steps-title">
          {steps.title}
        </Heading>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.items.map((step, index) => (
            <li key={step.title}>
              <Card className="flex h-full flex-col gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-12 items-center justify-center rounded-full bg-action-primary text-amount text-text-on-action"
                >
                  {formatNumber(locale, index + 1)}
                </span>
                <Heading level={3}>{step.title}</Heading>
                <Text>{step.body}</Text>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

export function Highlights({ locale }: { locale: Locale }) {
  const { highlights } = getContent(locale).home;
  return (
    <Section labelledBy="highlights-title">
      <div className="flex flex-col gap-8">
        <Heading level={2} id="highlights-title">
          {highlights.title}
        </Heading>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {highlights.items.map((item) => (
            <li key={item.title}>
              <Card className="flex h-full flex-col gap-3">
                <IconTile name={item.icon} />
                <Heading level={3}>{item.title}</Heading>
                <Text>{item.body}</Text>
              </Card>
            </li>
          ))}
        </ul>
        <Link
          href={pagePath(locale, 'features')}
          className="inline-flex min-h-12 items-center gap-2 self-start text-body-strong text-text-link underline underline-offset-4"
        >
          {highlights.allFeatures}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
      </div>
    </Section>
  );
}
