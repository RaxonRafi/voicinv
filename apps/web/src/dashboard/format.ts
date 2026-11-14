import {
  formatDate,
  formatDateTime,
  formatInteger,
  formatMoney,
  formatQuantity,
  getCurrency,
  getNumberFormat,
  type MinorUnits,
  Money,
  parseMoneyInput,
  parseQuantityInput,
  Quantity,
} from '@/domain';
import { type Locale } from '@/lib/locales';

// Every number, amount and date the web app shows goes through these (AGENTS.md §7.2 rule 5):
// the locale's own digits and grouping, the shop's currency, the browser's time zone.

export interface Formatters {
  locale: Locale;
  currency: string;
  money(amount: MinorUnits): string;
  /** An amount without its currency symbol, e.g. in a table column that names it. */
  amount(amount: MinorUnits): string;
  integer(value: number): string;
  quantity(qtyMilli: number): string;
  date(value: number): string;
  dateTime(value: number): string;
  /** "Saturday, Nov 14". */
  weekdayDate(value: number): string;
  /** "Nov 14". */
  dayMonth(value: number): string;
  /** "3:45 PM". */
  time(value: number): string;
  /** Parses a typed amount into minor units; null when it is not one. */
  parseMoney(text: string): MinorUnits | null;
  /** Text to put in an amount field for a stored amount ("2500.5", never "2,500.50"). */
  moneyInput(amount: MinorUnits | null): string;
  parseQuantity(text: string): number | null;
  quantityInput(qtyMilli: number | null): string;
  /** The currency's symbol, shown inside amount fields. */
  symbol: string;
}

const intlCache = new Map<string, Intl.DateTimeFormat>();

function intl(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = intlCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(getNumberFormat(locale).intlLocale, options);
    intlCache.set(key, formatter);
  }
  return formatter;
}

export function createFormatters(locale: Locale, currency: string): Formatters {
  const { exponent, symbol } = getCurrency(currency);
  return {
    locale,
    currency,
    symbol,
    money: (amount) => formatMoney(amount, { locale, currency }),
    amount: (amount) => formatMoney(amount, { locale, currency, showSymbol: false }),
    integer: (value) => formatInteger(value, locale),
    quantity: (qtyMilli) => formatQuantity(qtyMilli, locale),
    date: (value) => formatDate(value, locale),
    dateTime: (value) => formatDateTime(value, locale),
    weekdayDate: (value) =>
      intl(locale, { weekday: 'long', month: 'short', day: 'numeric' }).format(value),
    dayMonth: (value) => intl(locale, { month: 'short', day: 'numeric' }).format(value),
    time: (value) => intl(locale, { hour: 'numeric', minute: '2-digit' }).format(value),
    parseMoney: (text) => parseMoneyInput(text, locale, currency),
    moneyInput: (amount) => {
      if (amount === null) return '';
      const text = Money.toDecimalString(amount, exponent);
      return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
    },
    parseQuantity: (text) => parseQuantityInput(text, locale),
    quantityInput: (qtyMilli) => (qtyMilli === null ? '' : Quantity.toDecimalString(qtyMilli)),
  };
}

/** Midnight at the start of the day containing `value`, in the browser's time zone. */
export function startOfDay(value: number): number {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "today", "yesterday" or null for an older day. */
export function relativeDay(value: number, now: number): 'today' | 'yesterday' | null {
  const day = startOfDay(value);
  const today = startOfDay(now);
  if (day === today) return 'today';
  // One calendar day back (not 24 h), so clock changes cannot shift it.
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === yesterday.getTime() ? 'yesterday' : null;
}
