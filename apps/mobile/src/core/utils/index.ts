import { type LanguageCode, toAsciiDigits } from '@/shared';

/**
 * A business rule was violated (duplicate name, limit reached, …). `code` is stable and is what
 * screens translate; `field` names the form field at fault, when there is one.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

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
