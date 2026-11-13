// Public API of the content module: copy for every published language.
import { type Locale } from '@/lib/locales';

import { bn } from './bn';
import { en } from './en';
import { type SiteContent } from './types';

export type {
  FaqItem,
  FeatureGroup,
  Highlight,
  IconName,
  LegalDocument,
  LegalSection,
  Plan,
  SiteContent,
  Step,
} from './types';

const CONTENT: Readonly<Record<Locale, SiteContent>> = { en, bn };

export function getContent(locale: Locale): SiteContent {
  return CONTENT[locale];
}
