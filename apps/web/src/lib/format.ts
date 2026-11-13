import { INTL_LOCALE, type Locale } from './locales';

// Landing-site formatters. The site is a standalone app, so it owns these few helpers instead
// of sharing code with the API or the mobile app.

/** Currency shown in landing-page examples. */
export const DISPLAY_CURRENCY = 'BDT';

/** Formats a whole number with the locale's own digits and grouping. */
export function formatNumber(locale: Locale, value: number): string {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`formatNumber expects a safe integer, received ${value}`);
  }
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/**
 * Formats money held as an integer in minor units (paisa). The amount is handed to
 * `Intl.NumberFormat` as an exact decimal string, so no floating-point value is ever created
 * (AGENTS.md §1 rule 7).
 */
export function formatMoney(locale: Locale, minorUnits: number): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`formatMoney expects integer minor units, received ${minorUnits}`);
  }
  const digits = String(Math.abs(minorUnits)).padStart(3, '0');
  const sign = minorUnits < 0 ? '-' : '';
  const decimal = `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}` as `${number}`;
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: DISPLAY_CURRENCY,
    currencyDisplay: 'narrowSymbol',
    trailingZeroDisplay: 'stripIfInteger',
  }).format(decimal);
}

/** Formats a calendar date given as `YYYY-MM-DD`, e.g. "November 12, 2026". */
export function formatDate(locale: Locale, isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`formatDate expects YYYY-MM-DD, received "${isoDate}"`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

/** Replaces `{name}` placeholders in a translated string. Unknown placeholders throw. */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing value for placeholder {${name}}`);
    return value;
  });
}
