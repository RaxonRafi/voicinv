'use client';

import { useEffect } from 'react';

import { LOCALE_NAMES, LOCALES, preferredLocale } from '@/lib/locales';
import { pagePath } from '@/lib/routes';

import { ButtonLink } from './ui';

/**
 * Shown at the site root (`/`). Sends the visitor to the language their browser prefers; the
 * links remain as a fallback when scripts are disabled. Nothing is stored or sent anywhere.
 */
export function LanguageChooser() {
  useEffect(() => {
    window.location.replace(pagePath(preferredLocale(navigator.languages), 'home'));
  }, []);

  return (
    <nav aria-label="Language / ভাষা" className="flex flex-wrap justify-center gap-3">
      {LOCALES.map((locale) => (
        <span key={locale} lang={locale}>
          <ButtonLink variant="secondary" href={pagePath(locale, 'home')}>
            {LOCALE_NAMES[locale]}
          </ButtonLink>
        </span>
      ))}
    </nav>
  );
}
