import { type LanguagePack } from './types';

const BENGALI_DIGITS: Record<string, string> = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

/**
 * Replaces Bengali digits with ASCII digits.
 */
export function normalizeDigits(text: string): string {
  return text.replace(/[০-৯]/g, (char) => BENGALI_DIGITS[char] ?? char);
}

/**
 * Normalizes Bengali character variants:
 * - NFC composition
 * - Decomposed Nukta forms (ড় -> ড়, ঢ় -> ঢ়, য় -> য়)
 * - Strips zero-width characters (ZWJ, ZWNJ)
 * - Normalizes Bengali Dari (।) and punctuation
 */
export function normalizeBengaliVariants(text: string): string {
  let normalized = text.normalize('NFC');

  // Remove zero-width spaces, joiners, and non-joiners
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF]/g, '');

  // Normalize decomposed Nukta forms to atomic characters
  normalized = normalized
    .replace(/\u09A1\u09BC/g, '\u09DC') // ড + ় -> ড়
    .replace(/\u09A2\u09BC/g, '\u09DD') // ঢ + ় -> ঢ়
    .replace(/\u09AF\u09BC/g, '\u09DF'); // য + ় -> য়

  return normalized;
}

/**
 * Normalizes punctuation, whitespace, and curly quotes.
 */
export function normalizePunctuation(text: string): string {
  return (
    text
      // Curly quotes to straight
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      // Bengali Dari to space/period
      .replace(/।/g, ' ')
      // Standardize hyphens
      .replace(/[–—]/g, '-')
      // Punctuation (commas, question marks, exclamation marks) to space
      .replace(/[,!?;:]/g, ' ')
      // Multiple whitespace to single space
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Removes filler words defined in the language pack(s).
 */
export function removeFillers(text: string, languagePacks: readonly LanguagePack[]): string {
  let result = text;
  for (const pack of languagePacks) {
    for (const filler of pack.fillers) {
      if (!filler) continue;
      // Word boundary matching for ASCII and Bengali scripts
      const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$|[.,!?])`, 'gi');
      result = result.replace(regex, ' ');
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Full normalization pipeline:
 * 1. Unicode NFC & Bengali character variants
 * 2. Bengali digits to ASCII
 * 3. Punctuation & whitespace normalization
 * 4. Filler removal
 */
export function normalizeVoiceInput(text: string, languagePacks: readonly LanguagePack[]): string {
  if (!text) return '';
  const withVariants = normalizeBengaliVariants(text);
  const withAsciiDigits = normalizeDigits(withVariants);
  const withCleanPunc = normalizePunctuation(withAsciiDigits);
  return removeFillers(withCleanPunc, languagePacks);
}
