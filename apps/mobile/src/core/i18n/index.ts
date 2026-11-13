import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { type Script } from '@/core/theme';
import {
  formatDate,
  formatDateTime,
  formatInteger,
  formatMoney,
  formatQuantity,
  type LanguageCode,
  SUPPORTED_LANGUAGES,
} from '@/shared';

import { bn, en } from './locales';

// Every user-facing string goes through i18n, in English and Bengali (AGENTS.md §7.2 rule 8).
// A new language is a new JSON file here plus a number format entry in src/shared — no code.

export const RESOURCES = { en: { translation: en }, bn: { translation: bn } } as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

export function isLanguage(value: string | null | undefined): value is LanguageCode {
  return SUPPORTED_LANGUAGES.some((language) => language === value);
}

/** Picks the interface language: the saved choice, else the device language, else English. */
export function resolveLanguage(
  saved: string | null,
  deviceLanguages: readonly (string | null)[],
): LanguageCode {
  if (isLanguage(saved)) return saved;
  for (const language of deviceLanguages) {
    if (isLanguage(language)) return language;
  }
  return 'en';
}

/** Initializes i18n once at startup. Safe to call again (e.g. in tests). */
export async function initI18n(language: LanguageCode): Promise<void> {
  if (i18next.isInitialized) {
    await i18next.changeLanguage(language);
    return;
  }
  await i18next.use(initReactI18next).init({
    resources: RESOURCES,
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false }, // React Native renders text, not HTML
    returnNull: false,
  });
}

export async function changeLanguage(language: LanguageCode): Promise<void> {
  await i18next.changeLanguage(language);
}

export { useTranslation };

/** The current interface language. Re-renders the caller when it changes. */
export function useLanguage(): LanguageCode {
  const { i18n } = useTranslation();
  return isLanguage(i18n.language) ? i18n.language : 'en';
}

export function scriptOf(language: LanguageCode): Script {
  return language === 'bn' ? 'bengali' : 'latin';
}

export interface Formatters {
  money: (amount: number) => string;
  /** Amount without the currency symbol, for columns that already name the currency. */
  amount: (amount: number) => string;
  integer: (value: number) => string;
  quantity: (qtyMilli: number) => string;
  date: (epochMs: number) => string;
  dateTime: (epochMs: number) => string;
}

/** Formatters bound to a language and currency. Pure, so PDFs and tests can use it directly. */
export function createFormatters(language: LanguageCode, currency: string): Formatters {
  return {
    money: (amount) => formatMoney(amount, { locale: language, currency }),
    amount: (amount) => formatMoney(amount, { locale: language, currency, showSymbol: false }),
    integer: (value) => formatInteger(value, language),
    quantity: (qtyMilli) => formatQuantity(qtyMilli, language),
    date: (epochMs) => formatDate(epochMs, language),
    dateTime: (epochMs) => formatDateTime(epochMs, language),
  };
}

/**
 * Number, money and date formatters for the current interface language. All display of money
 * goes through here (AGENTS.md §7.2 rule 5).
 */
export function useFormatters(currency: string): Formatters {
  return createFormatters(useLanguage(), currency);
}
