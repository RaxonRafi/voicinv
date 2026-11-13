import { Check, ChevronDown, Clock } from 'lucide-react';
import { type ReactNode } from 'react';

import { getContent, type LegalDocument as LegalDocumentContent, type Plan } from '@/content';
import { fill, formatDate, formatNumber } from '@/lib/format';
import { type Locale } from '@/lib/locales';
import { waitlistPath } from '@/lib/routes';
import { CONTACT_EMAIL, FREE_INVOICES_PER_MONTH, LEGAL_UPDATED_ON } from '@/lib/site-config';

import { Badge, ButtonLink, Card, Heading, IconTile, Section, Text } from './ui';

/** Values available to `{placeholders}` in page copy. */
export function copyValues(locale: Locale): Readonly<Record<string, string>> {
  return { count: formatNumber(locale, FREE_INVOICES_PER_MONTH) };
}

interface PageIntroProps {
  title: string;
  intro: string;
  width?: 'wide' | 'narrow';
  children?: ReactNode;
}

/** Title block at the top of every inner page. */
export function PageIntro({ title, intro, width, children }: PageIntroProps) {
  return (
    <Section labelledBy="page-title" width={width}>
      <div className="flex flex-col gap-4">
        <Heading level={1} id="page-title">
          {title}
        </Heading>
        <Text>{intro}</Text>
        {children}
      </div>
    </Section>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-body text-text-primary">
          <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-status-success" />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function FeatureGroups({ locale }: { locale: Locale }) {
  const { groups } = getContent(locale).features;
  return (
    <Section tone="sunken">
      <ul className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <li key={group.title}>
            <Card className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <IconTile name={group.icon} />
                <Heading level={2} size="heading">
                  {group.title}
                </Heading>
              </div>
              <Text>{group.body}</Text>
              <CheckList items={group.points} />
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface PlanCardProps {
  locale: Locale;
  plan: Plan;
  highlighted: boolean;
  cta: string;
}

function PlanCard({ locale, plan, highlighted, cta }: PlanCardProps) {
  const values = copyValues(locale);
  return (
    <Card
      emphasis={highlighted ? 'accent' : 'default'}
      elevation={highlighted ? 'raised' : 'flat'}
      className="flex h-full flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <Heading level={2}>{plan.name}</Heading>
        <Text>{plan.tagline}</Text>
      </div>
      <Text tone="primary" className="text-body-strong">
        {plan.price}
      </Text>
      <CheckList items={plan.features.map((feature) => fill(feature, values))} />
      <div className="mt-auto pt-2">
        <ButtonLink
          href={waitlistPath(locale)}
          variant={highlighted ? 'primary' : 'secondary'}
          fullWidth
        >
          {cta}
        </ButtonLink>
      </div>
    </Card>
  );
}

export function PricingPlans({ locale }: { locale: Locale }) {
  const { pricing, nav } = getContent(locale);
  return (
    <Section tone="sunken">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2">
          <PlanCard
            locale={locale}
            plan={pricing.free}
            highlighted={false}
            cta={nav.joinWaitlist}
          />
          <PlanCard locale={locale} plan={pricing.pro} highlighted cta={nav.joinWaitlist} />
        </div>
        <Text>{pricing.note}</Text>
      </div>
    </Section>
  );
}

export function DownloadPanel({ locale }: { locale: Locale }) {
  const { download, nav } = getContent(locale);
  return (
    <PageIntro title={download.title} intro={download.intro} width="narrow">
      <div className="flex flex-col items-start gap-6">
        <Badge tone="info" icon={<Clock aria-hidden="true" className="size-4" />}>
          {download.status}
        </Badge>
        <Text>{download.body}</Text>
        <CheckList items={download.points} />
        <ButtonLink href={waitlistPath(locale)}>{nav.joinWaitlist}</ButtonLink>
      </div>
    </PageIntro>
  );
}

export function FaqList({ locale }: { locale: Locale }) {
  const { items } = getContent(locale).faq;
  const values = copyValues(locale);
  return (
    <Section tone="sunken" width="narrow">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.question}>
            {/* Native disclosure: keyboard and screen-reader accessible without any script. */}
            <details className="group rounded-lg border border-border-default bg-bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-4 py-3 text-body-strong text-text-primary [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  aria-hidden="true"
                  className="size-5 shrink-0 text-text-secondary transition-transform duration-(--vl-duration-fast) ease-standard group-open:rotate-180"
                />
              </summary>
              <div className="px-4 pb-4">
                <Text>{fill(item.answer, values)}</Text>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Section>
  );
}

interface LegalDocumentProps {
  locale: Locale;
  document: LegalDocumentContent;
}

export function LegalDocument({ locale, document }: LegalDocumentProps) {
  const { legal } = getContent(locale);
  return (
    <PageIntro title={document.title} intro={document.intro} width="narrow">
      <Text size="label">
        {fill(legal.updated, { date: formatDate(locale, LEGAL_UPDATED_ON) })}
      </Text>
      <div className="flex flex-col gap-8 pt-4">
        {document.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <Heading level={2} size="heading">
              {section.heading}
            </Heading>
            {section.paragraphs.map((paragraph) => (
              <Text key={paragraph}>{paragraph}</Text>
            ))}
          </section>
        ))}
        {CONTACT_EMAIL ? (
          <section className="flex flex-col gap-3">
            <Heading level={2} size="heading">
              {legal.contactHeading}
            </Heading>
            <Text>
              {legal.contactBody}{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-text-link underline underline-offset-4"
              >
                {CONTACT_EMAIL}
              </a>
            </Text>
          </section>
        ) : null}
      </div>
    </PageIntro>
  );
}
