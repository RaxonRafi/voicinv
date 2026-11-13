import { type Locale } from './locales';

// Client side of `POST /api/v1/waitlist` — the landing site's only API call (AGENTS.md §6.4).
// The API re-validates everything; these checks only give the visitor an immediate answer.

/** Shop types offered in the form. Sent to the API as a free-text `shopType`. */
export const SHOP_TYPES = [
  'grocery',
  'wholesale',
  'pharmacy',
  'hardware',
  'clothing',
  'other',
] as const;
export type ShopType = (typeof SHOP_TYPES)[number];

export interface WaitlistFormValues {
  /** A phone number or an email address, exactly as typed. */
  contact: string;
  name: string;
  shopType: string;
  /** Honeypot: hidden from people, so only automated submissions fill it. */
  website: string;
}

export interface WaitlistPayload {
  email?: string;
  phone?: string;
  name?: string;
  shopType?: string;
  website?: string;
  locale: Locale;
}

export type WaitlistInputError = 'CONTACT_REQUIRED' | 'CONTACT_INVALID';

export type WaitlistPayloadResult =
  { ok: true; payload: WaitlistPayload } | { ok: false; error: WaitlistInputError };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9]{7,15}$/;
const BENGALI_ZERO = 0x09e6;

/** Shop owners often type phone numbers with Bengali digits (০–৯); the API expects ASCII. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BENGALI_ZERO));
}

/** Turns what the visitor typed into the request body, or says what is wrong with it. */
export function buildWaitlistPayload(
  values: WaitlistFormValues,
  locale: Locale,
): WaitlistPayloadResult {
  const contact = values.contact.trim();
  if (contact === '') return { ok: false, error: 'CONTACT_REQUIRED' };

  const payload: WaitlistPayload = { locale };
  if (contact.includes('@')) {
    if (!EMAIL.test(contact) || contact.length > 254) {
      return { ok: false, error: 'CONTACT_INVALID' };
    }
    payload.email = contact.toLowerCase();
  } else {
    const phone = toAsciiDigits(contact).replace(/[\s\-().]/g, '');
    if (!PHONE.test(phone)) return { ok: false, error: 'CONTACT_INVALID' };
    payload.phone = phone;
  }

  const name = values.name.trim().slice(0, 120);
  if (name !== '') payload.name = name;
  const shopType = values.shopType.trim();
  if (shopType !== '') payload.shopType = shopType;
  const website = values.website.trim();
  if (website !== '') payload.website = website.slice(0, 200);

  return { ok: true, payload };
}

export type WaitlistSubmitResult = 'JOINED' | 'INVALID' | 'RATE_LIMITED' | 'UNAVAILABLE';

export interface SubmitWaitlistOptions {
  /** API origin without a trailing slash, e.g. `https://api.example.com`. */
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends the signup to the API and reduces every outcome to one the form can explain.
 * Never throws: network failures, timeouts and unexpected responses become `UNAVAILABLE`.
 */
export async function submitWaitlist(
  payload: WaitlistPayload,
  { apiBaseUrl, fetchFn = fetch, timeoutMs = 15_000 }: SubmitWaitlistOptions,
): Promise<WaitlistSubmitResult> {
  try {
    const response = await fetchFn(`${apiBaseUrl}/api/v1/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return 'JOINED';
    if (response.status === 429) return 'RATE_LIMITED';
    if (response.status === 400) return 'INVALID';
    return 'UNAVAILABLE';
  } catch {
    return 'UNAVAILABLE';
  }
}
