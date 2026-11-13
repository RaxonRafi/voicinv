import { Container, Heading, LanguageChooser, Text } from '@/components';
import { getContent } from '@/content';
import { LOCALES } from '@/lib/locales';

/** Site root: forwards to the visitor's language, with both languages offered as links. */
export default function RootPage() {
  return (
    <main className="flex flex-1 items-center py-16">
      <Container width="narrow" className="flex flex-col items-center gap-6 text-center">
        <Heading level={1}>{getContent('en').meta.siteName}</Heading>
        {LOCALES.map((locale) => (
          <div key={locale} lang={locale}>
            <Text>{getContent(locale).footer.tagline}</Text>
          </div>
        ))}
        <LanguageChooser />
      </Container>
    </main>
  );
}
