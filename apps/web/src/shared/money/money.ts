// Money is always an integer number of minor units (paisa, cents). Nothing in this module ever
// creates a fractional number: multiplication and division go through BigInt and are rounded
// half away from zero (AGENTS.md §1 rule 7).

/** An integer amount of minor units. May be negative (e.g. a ledger payment entry). */
export type MinorUnits = number;

/** Quantities are stored as thousandths (`qtyMilli` = quantity × 1000), so 1.5 kg is 1500. */
export const QUANTITY_SCALE = 1000;

/** Decimal places of the currencies VoiceLedger supports in v1. */
export const DEFAULT_CURRENCY_EXPONENT = 2;

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

export function isMinorUnits(value: unknown): value is MinorUnits {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Throws unless `value` is a safe integer. Use at every boundary where money enters. */
export function assertMinorUnits(value: unknown, label = 'amount'): asserts value is MinorUnits {
  if (!isMinorUnits(value)) {
    throw new RangeError(
      `${label} must be an integer number of minor units, received ${String(value)}`,
    );
  }
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, received ${String(value)}`);
  }
}

function toSafeNumber(value: bigint): MinorUnits {
  if (value > MAX || value < -MAX) {
    throw new RangeError('Money calculation exceeded the safe integer range');
  }
  return Number(value);
}

/** Integer division rounded half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('Cannot divide money by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = (2n * n + d) / (2n * d);
  return negative ? -quotient : quotient;
}

export function add(...amounts: readonly MinorUnits[]): MinorUnits {
  let total = 0n;
  for (const amount of amounts) {
    assertMinorUnits(amount);
    total += BigInt(amount);
  }
  return toSafeNumber(total);
}

export function sum(amounts: Iterable<MinorUnits>): MinorUnits {
  return add(...amounts);
}

export function subtract(amount: MinorUnits, ...subtrahends: readonly MinorUnits[]): MinorUnits {
  assertMinorUnits(amount);
  let total = BigInt(amount);
  for (const subtrahend of subtrahends) {
    assertMinorUnits(subtrahend);
    total -= BigInt(subtrahend);
  }
  return toSafeNumber(total);
}

export function negate(amount: MinorUnits): MinorUnits {
  assertMinorUnits(amount);
  return amount === 0 ? 0 : -amount;
}

/**
 * Price of a quantity: `unitPrice × qtyMilli / 1000`, rounded half away from zero.
 * Example: 1.5 kg at 80.00 → `multiplyByQuantity(8000, 1500)` = 12000.
 */
export function multiplyByQuantity(unitPrice: MinorUnits, qtyMilli: number): MinorUnits {
  assertMinorUnits(unitPrice, 'unitPrice');
  assertInteger(qtyMilli, 'qtyMilli');
  return toSafeNumber(divideRounded(BigInt(unitPrice) * BigInt(qtyMilli), BigInt(QUANTITY_SCALE)));
}

/**
 * A fraction of an amount, e.g. "paid half" → `fraction(total, 1, 2)`.
 * Rounded half away from zero.
 */
export function fraction(amount: MinorUnits, numerator: number, denominator: number): MinorUnits {
  assertMinorUnits(amount);
  assertInteger(numerator, 'numerator');
  assertInteger(denominator, 'denominator');
  return toSafeNumber(divideRounded(BigInt(amount) * BigInt(numerator), BigInt(denominator)));
}

export function compare(a: MinorUnits, b: MinorUnits): -1 | 0 | 1 {
  assertMinorUnits(a);
  assertMinorUnits(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function min(a: MinorUnits, b: MinorUnits): MinorUnits {
  return compare(a, b) <= 0 ? a : b;
}

export function max(a: MinorUnits, b: MinorUnits): MinorUnits {
  return compare(a, b) >= 0 ? a : b;
}

/** Limits `amount` to the inclusive range `[low, high]`. */
export function clamp(amount: MinorUnits, low: MinorUnits, high: MinorUnits): MinorUnits {
  return max(low, min(amount, high));
}

/**
 * Exact decimal text of an amount, e.g. `250050` → `"2500.50"`. Always ASCII, no grouping.
 * This is the only bridge from minor units to a decimal representation.
 */
export function toDecimalString(amount: MinorUnits, exponent = DEFAULT_CURRENCY_EXPONENT): string {
  assertMinorUnits(amount);
  const sign = amount < 0 ? '-' : '';
  const digits = String(Math.abs(amount));
  if (exponent === 0) return `${sign}${digits}`;
  const padded = digits.padStart(exponent + 1, '0');
  return `${sign}${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
}

/**
 * Parses plain decimal text into an integer scaled by `10^scale`, without floating point.
 * Accepts ASCII digits only, an optional leading minus and at most `scale` decimal places.
 */
function parseScaled(text: string, scale: number): number | null {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, sign = '', whole = '', decimals = ''] = match;
  if (decimals.length > scale) return null;
  const value = BigInt(`${whole}${decimals.padEnd(scale, '0')}`);
  if (value > MAX) return null;
  const result = Number(value);
  return sign === '-' && result !== 0 ? -result : result;
}

/**
 * Parses an amount typed or spoken as a decimal, e.g. `"2500.5"` → `250050`.
 * Returns null when the text is not a valid amount. Callers convert localized digits and strip
 * grouping first (see `parseLocalizedDecimal` in the format module).
 */
export function fromDecimalString(
  text: string,
  exponent = DEFAULT_CURRENCY_EXPONENT,
): MinorUnits | null {
  return parseScaled(text.trim(), exponent);
}

/** Parses a quantity such as `"1.5"` into thousandths (`1500`). Null when invalid or negative. */
export function quantityFromDecimalString(text: string): number | null {
  const value = parseScaled(text.trim(), 3);
  return value === null || value < 0 ? null : value;
}

/** Exact decimal text of a quantity without trailing zeros: `1500` → `"1.5"`, `2000` → `"2"`. */
export function quantityToDecimalString(qtyMilli: number): string {
  assertInteger(qtyMilli, 'qtyMilli');
  const text = toDecimalString(qtyMilli, 3);
  return text.replace(/\.?0+$/, '');
}
