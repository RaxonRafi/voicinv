import { type LanguageCode, toAsciiDigits } from '@/domain';

// Text rules shared by the use cases. They match the mobile app's, so a name saved on the web
// and on a phone is stored and compared the same way.

/** Canonical form of a name for storage: NFC, trimmed, inner whitespace collapsed. */
export function cleanName(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/** Key for comparing names regardless of case and spacing. */
export function nameKey(text: string): string {
  return cleanName(text).toLocaleLowerCase();
}

const BENGALI = /[ঀ-৿]/;

/** Guesses the language of a name or alias from its script. */
export function languageOf(text: string): LanguageCode {
  return BENGALI.test(text) ? 'bn' : 'en';
}

/**
 * Normalizes a typed phone number to digits with an optional leading plus. Accepts Bengali
 * digits, spaces, dashes, dots and brackets. Returns null when it is not a phone number.
 */
export function normalizePhone(text: string): string | null {
  const phone = toAsciiDigits(text).replace(/[\s\-().]/g, '');
  return /^\+?[0-9]{7,15}$/.test(phone) ? phone : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes an account identifier the way the API does: emails are lowercased, phone numbers
 * lose separators (and Bengali digits become ASCII). Null when it is neither.
 */
export function normalizeIdentifier(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return EMAIL.test(email) && email.length <= 254 ? email : null;
  }
  return normalizePhone(trimmed);
}

/** Splits a comma- or line-separated list of alternative names, dropping blanks and repeats. */
export function parseAliasList(text: string): string[] {
  const seen = new Set<string>();
  const aliases: string[] = [];
  for (const part of text.split(/[,،\n]/)) {
    const alias = cleanName(part);
    const key = nameKey(alias);
    if (alias === '' || seen.has(key)) continue;
    seen.add(key);
    aliases.push(alias);
  }
  return aliases;
}

/** Aliases that add something: not blank, not the record's own name, no repeats. */
export function usefulAliases(name: string, aliases: readonly string[]): string[] {
  const seen = new Set([nameKey(name)]);
  const result: string[] = [];
  for (const alias of aliases) {
    const key = nameKey(alias);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(cleanName(alias));
  }
  return result;
}

/** Which stored aliases to remove and which new ones to add so the set equals `next`. */
export function diffAliases(
  existing: readonly { id: string; alias: string }[],
  next: readonly string[],
): { removeIds: string[]; add: string[] } {
  const wanted = new Map(next.map((alias) => [nameKey(alias), cleanName(alias)]));
  const removeIds: string[] = [];
  for (const row of existing) {
    const key = nameKey(row.alias);
    if (wanted.has(key)) wanted.delete(key);
    else removeIds.push(row.id);
  }
  return { removeIds, add: [...wanted.values()] };
}

/** First letter of a name, for avatars and letter tiles. */
export function initialOf(name: string): string {
  const [first] = [...cleanName(name)];
  return first === undefined ? '?' : first.toLocaleUpperCase();
}
