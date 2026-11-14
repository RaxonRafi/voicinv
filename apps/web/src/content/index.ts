// Public API of the content module: copy for every published language.
import { type Locale } from '@/lib/locales';

import { appBn } from './app-bn';
import { appEn } from './app-en';
import { type AppContent } from './app-types';
import { bn } from './bn';
import { en } from './en';
import { type SiteContent } from './types';

export type { AppContent } from './app-types';
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
const APP_CONTENT: Readonly<Record<Locale, AppContent>> = { en: appEn, bn: appBn };

/** Copy of the public pages. */
export function getContent(locale: Locale): SiteContent {
  return CONTENT[locale];
}

/** Copy of the signed-in web app. */
export function getAppContent(locale: Locale): AppContent {
  return APP_CONTENT[locale];
}
