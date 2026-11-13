import { getNumberFormat } from './number-format.js';

// Dates are stored as UTC epoch milliseconds and displayed in the device's locale and time zone
// (AGENTS.md §15). `Intl.DateTimeFormat` is available in Node, browsers and Hermes.

export type DateStyle = 'long' | 'medium' | 'short';

export interface FormatDateOptions {
  style?: DateStyle;
  /** IANA time zone. Defaults to the device's time zone. */
  timeZone?: string;
}

// Creating an Intl formatter is expensive, and lists format many dates per frame, so each
// distinct (locale, style, time zone, with/without time) formatter is created once.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(
  locale: string,
  style: DateStyle,
  timeZone: string | undefined,
  withTime: boolean,
): Intl.DateTimeFormat {
  const intlLocale = getNumberFormat(locale).intlLocale;
  const key = `${intlLocale}|${style}|${timeZone ?? ''}|${withTime ? 't' : 'd'}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlLocale, {
      dateStyle: style,
      ...(withTime ? { timeStyle: 'short' as const } : {}),
      ...(timeZone ? { timeZone } : {}),
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

function toDate(value: number | Date): Date {
  const date = typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date');
  return date;
}

/** Formats a point in time as a calendar date, e.g. "12 November 2026". */
export function formatDate(
  value: number | Date,
  locale: string,
  { style = 'medium', timeZone }: FormatDateOptions = {},
): string {
  return formatterFor(locale, style, timeZone, false).format(toDate(value));
}

/** Formats a point in time as date and time, e.g. "12 Nov 2026, 6:35 PM". */
export function formatDateTime(
  value: number | Date,
  locale: string,
  { style = 'medium', timeZone }: FormatDateOptions = {},
): string {
  return formatterFor(locale, style, timeZone, true).format(toDate(value));
}

/** Formats a calendar date given as `YYYY-MM-DD`, independent of any time zone. */
export function formatCalendarDate(
  isoDate: string,
  locale: string,
  style: DateStyle = 'long',
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`formatCalendarDate expects YYYY-MM-DD, received "${isoDate}"`);
  const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDate(date, locale, { style, timeZone: 'UTC' });
}
