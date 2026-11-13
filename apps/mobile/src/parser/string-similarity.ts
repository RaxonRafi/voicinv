import { type LanguagePack } from './types';

/**
 * Standard Jaro-Winkler string similarity (returns 0 to 1).
 */
export function jaroWinkler(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 1.0;
  if (str1.length === 0 || str2.length === 0) return 0.0;

  const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
  const str1Matches = new Array<boolean>(str1.length).fill(false);
  const str2Matches = new Array<boolean>(str2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < str1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, str2.length);

    for (let j = start; j < end; j++) {
      if (str2Matches[j] || str1[i] !== str2[j]) continue;
      str1Matches[i] = true;
      str2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let k = 0;
  for (let i = 0; i < str1.length; i++) {
    if (!str1Matches[i]) continue;
    while (!str2Matches[k]) k++;
    if (str1[i] !== str2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix scale (max 4 chars, prefix scale factor 0.1)
  let prefix = 0;
  const maxPrefix = Math.min(4, Math.min(str1.length, str2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (str1[i] === str2[i]) {
      prefix++;
    } else {
      break;
    }
  }

  return Math.min(1.0, jaro + prefix * 0.1 * (1 - jaro));
}

/**
 * Strips suffixes like "-কে", "-এর", "-র", "-রে", "'s" from a word using language pack suffixes.
 */
export function stripSuffix(word: string, packs: readonly LanguagePack[]): string {
  let cleaned = word.trim();
  let changed = true;

  // Collect all suffixes and sort by length descending
  const allSuffixes: string[] = [];
  for (const pack of packs) {
    for (const suffix of pack.suffixes) {
      if (!suffix) continue;
      const s = suffix.startsWith('-') ? suffix.slice(1) : suffix;
      allSuffixes.push(s);
    }
  }
  allSuffixes.sort((a, b) => b.length - a.length);

  while (changed) {
    changed = false;
    for (const s of allSuffixes) {
      if (cleaned.length > s.length + 1 && cleaned.endsWith(s)) {
        cleaned = cleaned.slice(0, cleaned.length - s.length).trim();
        changed = true;
        break;
      }
    }
  }

  return cleaned;
}

/**
 * Phonetically normalizes Latin text for cross-spelling similarity
 * (e.g. Comal -> komal, Alee -> ali, Kareem -> karim, Rohim -> rohim).
 */
export function phoneticNormalizeLatin(text: string): string {
  let s = text.toLowerCase().trim();

  // Replace 'ph' with 'f'
  s = s.replace(/ph/g, 'f');
  // Replace 'ch' preservation, then 'c' -> 'k'
  s = s.replace(/c(?![h])/g, 'k');
  // 'ee' -> 'i', 'ea' -> 'i'
  s = s.replace(/ee|ea/g, 'i');
  // 'oo' -> 'u'
  s = s.replace(/oo/g, 'u');
  // Collapse double consonants
  s = s.replace(/([a-z])\1+/g, '$1');

  return s;
}

/**
 * Normalizes Bengali vowel variants (ী -> ি, ূ -> ু, ৎ -> ত) for phonetic comparison.
 */
export function normalizeBengaliPhonetic(text: string): string {
  return text
    .replace(/\u09C0/g, '\u09BF') // ী -> ি
    .replace(/\u09C2/g, '\u09C1') // ূ -> ু
    .replace(/\u09CE/g, '\u09A4'); // ৎ -> ত
}

/**
 * Checks if a word is written in Bengali script.
 */
export function isBengaliScript(text: string): boolean {
  return /[\u0980-\u09FF]/.test(text);
}

/**
 * Transliterates a word using the transliteration table from packs.
 */
export function transliterateWord(word: string, packs: readonly LanguagePack[]): string[] {
  const lower = word.toLowerCase().trim();
  const results: string[] = [lower];

  if (!isBengaliScript(lower)) {
    results.push(phoneticNormalizeLatin(lower));
  } else {
    results.push(normalizeBengaliPhonetic(lower));
  }

  for (const pack of packs) {
    const translit = pack.translit;
    if (!translit) continue;

    // Check exact word dictionary (e.g. karim -> করিম or করিম -> karim)
    const translitWord = translit.words[lower];
    if (translitWord) {
      results.push(translitWord.toLowerCase());
    }

    // Check reverse lookup
    for (const [key, val] of Object.entries(translit.words)) {
      if (val.toLowerCase() === lower) {
        results.push(key.toLowerCase());
      }
    }
  }

  return Array.from(new Set(results));
}

/**
 * Compares two strings using:
 * 1. Exact match
 * 2. Suffix-stripped match
 * 3. Transliteration match
 * 4. Jaro-Winkler fuzzy match
 * Returns highest score between 0 and 1.
 */
export function compareEntities(
  input: string,
  target: string,
  packs: readonly LanguagePack[],
): number {
  const normInput = input.toLowerCase().trim();
  const normTarget = target.toLowerCase().trim();

  if (normInput === normTarget) return 1.0;

  // Suffix stripped comparisons
  const strippedInput = stripSuffix(normInput, packs);
  const strippedTarget = stripSuffix(normTarget, packs);

  if (strippedInput === normTarget || strippedInput === strippedTarget) return 0.98;

  // Transliteration variants comparison
  const inputVariants = transliterateWord(strippedInput, packs);
  const targetVariants = transliterateWord(strippedTarget, packs);

  for (const iv of inputVariants) {
    for (const tv of targetVariants) {
      if (iv === tv) return 0.95;
    }
  }

  // Jaro-Winkler comparison across variants
  let bestScore = jaroWinkler(strippedInput, strippedTarget);
  for (const iv of inputVariants) {
    for (const tv of targetVariants) {
      const score = jaroWinkler(iv, tv);
      if (score > bestScore) bestScore = score;
    }
  }

  return bestScore;
}
