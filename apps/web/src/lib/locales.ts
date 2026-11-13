/** Languages the landing site is published in. The first one is the default. */
export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** BCP 47 tags used for number, money and date formatting. */
export const INTL_LOCALE: Readonly<Record<Locale, string>> = {
  en: 'en',
  bn: 'bn-BD',
};

/** Each language's own name, shown in the language switcher. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
  en: 'English',
  bn: 'বাংলা',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** The other published language (the site has exactly two). */
export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'bn' : 'en';
}

/**
 * Picks the best published language for a visitor from their browser language list
 * (`navigator.languages`). Falls back to the default language.
 */
export function preferredLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base !== undefined && isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
