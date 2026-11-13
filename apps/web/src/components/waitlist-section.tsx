import { getContent } from '@/content';
import { type Locale } from '@/lib/locales';
import { pagePath, WAITLIST_ANCHOR } from '@/lib/routes';

import { Card, Heading, Section, Text } from './ui';
import { WaitlistForm } from './waitlist-form';

interface WaitlistSectionProps {
  locale: Locale;
  /** Background band; pick the one that differs from the section above it. */
  tone?: 'canvas' | 'sunken';
}

/** Waitlist call to action with the signup form. Lives on the home page at `#waitlist`. */
export function WaitlistSection({ locale, tone = 'sunken' }: WaitlistSectionProps) {
  const { waitlist, nav } = getContent(locale);
  return (
    <Section id={WAITLIST_ANCHOR} tone={tone} labelledBy="waitlist-title">
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Heading level={2} id="waitlist-title">
            {waitlist.title}
          </Heading>
          <Text>{waitlist.body}</Text>
        </div>
        <Card elevation="raised">
          <WaitlistForm
            locale={locale}
            copy={waitlist}
            privacy={{ href: pagePath(locale, 'privacy'), label: nav.privacy }}
          />
        </Card>
      </div>
    </Section>
  );
}
