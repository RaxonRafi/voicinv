import {
  assertMinorUnits,
  DEFAULT_CURRENCY_EXPONENT,
  fromDecimalString,
  type MinorUnits,
  quantityFromDecimalString,
  quantityToDecimalString,
  toDecimalString,
} from '../money/money';
import { type NumberingSystem, toAsciiDigits, toLocalDigits } from './numerals';

// The shared number and money formatter (AGENTS.md §7.2 rule 5). It is implemented on plain
// strings instead of `Intl.NumberFormat` so that the web, the API, PDFs and the Hermes engine
// on low-end Android phones all produce exactly the same text.

export interface NumberFormatSpec {
  /** BCP 47 tag handed to `Intl.DateTimeFormat` for dates. */
  intlLocale: string;
  numberingSystem: NumberingSystem;
  /** `thousands`: 1,234,567. `indian`: 12,34,567 (lakh/crore grouping). */
  grouping: 'thousands' | 'indian';
  groupSeparator: string;
  decimalSeparator: string;
  /** Where the currency symbol goes relative to the number. */
  currencyPosition: 'prefix' | 'suffix';
}

/** Number formats by language code. Adding a language is a data-only change. */
export const NUMBER_FORMATS: Readonly<Record<string, NumberFormatSpec>> = {
  en: {
    intlLocale: 'en',
    numberingSystem: 'latn',
    grouping: 'thousands',
    groupSeparator: ',',
    decimalSeparator: '.',
    currencyPosition: 'prefix',
  },
  bn: {
    intlLocale: 'bn-BD',
    numberingSystem: 'beng',
    grouping: 'indian',
    groupSeparator: ',',
    decimalSeparator: '.',
    currencyPosition: 'suffix',
  },
};

export const FALLBACK_LANGUAGE = 'en';

/** Format for a language code or locale tag (`bn`, `bn-BD`). Unknown languages use English. */
export function getNumberFormat(locale: string): NumberFormatSpec {
  const language = locale.toLowerCase().split(/[-_]/)[0] ?? FALLBACK_LANGUAGE;
  const spec = NUMBER_FORMATS[language] ?? NUMBER_FORMATS[FALLBACK_LANGUAGE];
  if (!spec) throw new Error('Fallback number format is missing');
  return spec;
}

export interface CurrencyInfo {
  symbol: string;
  /** Number of decimal places (minor units per major unit = 10^exponent). */
  exponent: number;
}

/** Currencies with a known symbol. Unknown codes are shown by their ISO code. */
export const CURRENCIES: Readonly<Record<string, CurrencyInfo>> = {
  BDT: { symbol: '৳', exponent: 2 },
  INR: { symbol: '₹', exponent: 2 },
  USD: { symbol: '$', exponent: 2 },
  EUR: { symbol: '€', exponent: 2 },
  GBP: { symbol: '£', exponent: 2 },
};

export const DEFAULT_CURRENCY = 'BDT';

export function getCurrency(code: string): CurrencyInfo {
  return CURRENCIES[code] ?? { symbol: code, exponent: DEFAULT_CURRENCY_EXPONENT };
}

function groupDigits(digits: string, spec: NumberFormatSpec): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const size = spec.grouping === 'indian' ? 2 : 3;
  const groups: string[] = [];
  for (let end = head.length; end > 0; end -= size) {
    groups.unshift(head.slice(Math.max(0, end - size), end));
  }
  return [...groups, tail].join(spec.groupSeparator);
}

export interface FormatDecimalOptions {
  useGrouping?: boolean;
}

/**
 * Formats exact ASCII decimal text (`-1234.50`) with the locale's digits, grouping and decimal
 * separator. The value is never converted to a floating-point number.
 */
export function formatDecimal(
  decimal: string,
  locale: string,
  { useGrouping = true }: FormatDecimalOptions = {},
): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match)
    throw new RangeError(`formatDecimal expects plain decimal text, received "${decimal}"`);
  const [, sign = '', whole = '', decimals] = match;
  const spec = getNumberFormat(locale);
  const integerPart = useGrouping ? groupDigits(whole, spec) : whole;
  const text = decimals ? `${integerPart}${spec.decimalSeparator}${decimals}` : integerPart;
  return `${sign}${toLocalDigits(text, spec.numberingSystem)}`;
}

/** Formats a whole number, e.g. a count or an invoice total in a report header. */
export function formatInteger(
  value: number,
  locale: string,
  options?: FormatDecimalOptions,
): string {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`formatInteger expects a safe integer, received ${String(value)}`);
  }
  return formatDecimal(String(value), locale, options);
}

/** Formats a quantity held in thousandths: `1500` → `1.5`, `2000` → `2`. */
export function formatQuantity(qtyMilli: number, locale: string): string {
  return formatDecimal(quantityToDecimalString(qtyMilli), locale);
}

export interface FormatMoneyOptions {
  locale: string;
  /** ISO 4217 code. Defaults to BDT. */
  currency?: string;
  /** `auto` drops ".00" on whole amounts; `always` keeps every decimal place. */
  fractionDigits?: 'auto' | 'always';
  /** Set false for table columns that already name the currency. */
  showSymbol?: boolean;
}

/**
 * Formats an amount in minor units with the currency symbol, e.g. `250050` → `৳2,500.50` (en)
 * or `২,৫০০.৫০৳` (bn). This is the only place money becomes display text.
 */
export function formatMoney(
  amount: MinorUnits,
  {
    locale,
    currency = DEFAULT_CURRENCY,
    fractionDigits = 'auto',
    showSymbol = true,
  }: FormatMoneyOptions,
): string {
  assertMinorUnits(amount);
  const spec = getNumberFormat(locale);
  const { symbol, exponent } = getCurrency(currency);

  let decimal = toDecimalString(Math.abs(amount), exponent);
  if (fractionDigits === 'auto' && exponent > 0 && /\.0+$/.test(decimal)) {
    decimal = decimal.slice(0, decimal.indexOf('.'));
  }
  const number = formatDecimal(decimal, locale);
  const sign = amount < 0 ? '-' : '';
  if (!showSymbol) return `${sign}${number}`;

  // Alphabetic codes (e.g. "NPR") need a space; single symbols such as ৳ do not.
  const gap = /^[A-Za-z]+$/.test(symbol) ? ' ' : '';
  return spec.currencyPosition === 'prefix'
    ? `${sign}${symbol}${gap}${number}`
    : `${sign}${number}${gap}${symbol}`;
}

/** Removes grouping separators and converts localized digits, leaving plain ASCII decimal text. */
function normalizeNumberInput(text: string, locale: string): string {
  const spec = getNumberFormat(locale);
  let normalized = toAsciiDigits(text).trim().split(spec.groupSeparator).join('');
  if (spec.decimalSeparator !== '.') normalized = normalized.replace(spec.decimalSeparator, '.');
  return normalized.replace(/\s+/g, '');
}

/**
 * Parses an amount as a person types it (`"২,৫০০.৫"`, `"2500"`) into minor units.
 * Returns null when the text is not a valid non-negative amount.
 */
export function parseMoneyInput(
  text: string,
  locale: string,
  currency: string = DEFAULT_CURRENCY,
): MinorUnits | null {
  const value = fromDecimalString(
    normalizeNumberInput(text, locale),
    getCurrency(currency).exponent,
  );
  return value === null || value < 0 ? null : value;
}

/** Parses a typed quantity (`"১.৫"`, `"2"`) into thousandths. Null when invalid or negative. */
export function parseQuantityInput(text: string, locale: string): number | null {
  return quantityFromDecimalString(normalizeNumberInput(text, locale));
}
