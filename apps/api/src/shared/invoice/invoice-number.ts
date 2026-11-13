// Invoice numbers never collide across devices working offline (AGENTS.md §8.4):
//   <shopPrefix>-<deviceCode>-<sequence>   e.g. RS-A-000123
// Each device owns its own sequence, and each device of a shop has its own code.

export const INVOICE_SEQUENCE_DIGITS = 6;

/** Code used by a device that is not registered with an account. */
export const DEFAULT_DEVICE_CODE = 'A';

/** Prefix used when nothing usable can be derived from the shop name. */
export const DEFAULT_SHOP_PREFIX = 'INV';

const SHOP_PREFIX = /^[A-Z0-9]{1,6}$/;
const DEVICE_CODE = /^[A-Z]{1,3}$/;
const INVOICE_NUMBER = /^([A-Z0-9]{1,6})-([A-Z]{1,3})-(\d{6,})$/;

export interface InvoiceNumberParts {
  shopPrefix: string;
  deviceCode: string;
  /** Position in the device's own sequence, starting at 1. */
  sequence: number;
}

export function isShopPrefix(value: string): boolean {
  return SHOP_PREFIX.test(value);
}

export function isDeviceCode(value: string): boolean {
  return DEVICE_CODE.test(value);
}

export function formatInvoiceNumber({
  shopPrefix,
  deviceCode,
  sequence,
}: InvoiceNumberParts): string {
  if (!isShopPrefix(shopPrefix)) throw new RangeError(`Invalid shop prefix "${shopPrefix}"`);
  if (!isDeviceCode(deviceCode)) throw new RangeError(`Invalid device code "${deviceCode}"`);
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError(
      `Invoice sequence must be a positive integer, received ${String(sequence)}`,
    );
  }
  return `${shopPrefix}-${deviceCode}-${String(sequence).padStart(INVOICE_SEQUENCE_DIGITS, '0')}`;
}

export function parseInvoiceNumber(value: string): InvoiceNumberParts | null {
  const match = INVOICE_NUMBER.exec(value);
  if (!match) return null;
  const [, shopPrefix = '', deviceCode = '', digits = ''] = match;
  const sequence = Number(digits);
  if (!Number.isSafeInteger(sequence) || sequence < 1) return null;
  return { shopPrefix, deviceCode, sequence };
}

/**
 * Suggests a prefix from the shop name: initials of the first words ("Rahim Store" → "RS"), or
 * the first letters of a single word ("Rahim" → "RAH"). Names without Latin letters or digits
 * (e.g. written in Bengali) get the default prefix; the owner can change it in settings.
 */
export function deriveShopPrefix(shopName: string): string {
  const words = shopName
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word.length > 0);
  const [first] = words;
  if (first === undefined) return DEFAULT_SHOP_PREFIX;
  if (words.length === 1) return first.slice(0, 3);
  return words
    .slice(0, 4)
    .map((word) => word.charAt(0))
    .join('');
}

/** Device code for the n-th device of a shop (0 → A, 25 → Z, 26 → AA, …). */
export function deviceCodeFromIndex(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new RangeError(`Device index must be a non-negative integer, received ${String(index)}`);
  }
  let code = '';
  let remaining = index;
  do {
    code = String.fromCharCode(65 + (remaining % 26)) + code;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  if (!isDeviceCode(code)) throw new RangeError(`Too many devices for a shop (index ${index})`);
  return code;
}
