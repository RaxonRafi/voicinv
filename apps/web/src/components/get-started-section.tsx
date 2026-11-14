import { getContent } from '@/content';
import { type Locale } from '@/lib/locales';
import { appHome, appSignUpPath } from '@/lib/routes';

import { ButtonLink, Card, Heading, Section, Text } from './ui';

interface GetStartedSectionProps {
  locale: Locale;
  /** Background band; pick the one that differs from the section above it. */
  tone?: 'canvas' | 'sunken';
}

/** Closing call to action of the public pages: create an account in the web app, or sign in. */
export function GetStartedSection({ locale, tone = 'sunken' }: GetStartedSectionProps) {
  const { getStarted } = getContent(locale);
  return (
    <Section tone={tone} labelledBy="get-started-title">
      <Card
        tone="hero"
        elevation="raised"
        className="flex flex-col gap-6 lg:flex-row lg:items-center"
      >
        <div className="flex flex-1 flex-col gap-3">
          <Heading level={2} id="get-started-title">
            {getStarted.title}
          </Heading>
          <Text tone="primary">{getStarted.body}</Text>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={appSignUpPath(locale)} size="lg">
            {getStarted.create}
          </ButtonLink>
          <ButtonLink href={appHome(locale)} size="lg" variant="secondary">
            {getStarted.signIn}
          </ButtonLink>
        </div>
      </Card>
    </Section>
  );
}
