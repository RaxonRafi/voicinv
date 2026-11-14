import { type FractionDef, type LanguagePack } from './types';

export interface ParsedNumberResult {
  value: number;
  consumedTokens: number;
  rawText: string;
  isFraction?: boolean;
  fractionDef?: FractionDef;
}

/**
 * Checks if a token is a numeric literal (e.g. "12", "3.5", "0.25").
 */
export function parseNumericLiteral(token: string): number | null {
  const cleaned = token.replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    const num = Number.parseFloat(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

/**
 * Tries to parse a number (including digits, words, multipliers, and fractions)
 * starting from `startIndex` in a list of tokens.
 * Data-driven: inspects numbers, fractions, and multipliers from the given language pack(s).
 */
export function parseNumberAt(
  tokens: readonly string[],
  startIndex: number,
  packs: readonly LanguagePack[],
): ParsedNumberResult | null {
  if (startIndex >= tokens.length) return null;

  // First, check multi-token fraction definitions (e.g. "one and a half", "three quarters", "পৌনে এক", "তিন পোয়া")
  for (const pack of packs) {
    for (const [phrase, def] of Object.entries(pack.fractions.standalone)) {
      const phraseTokens = phrase.toLowerCase().split(/\s+/);
      const match = phraseTokens.every((pt, i) => {
        const token = tokens[startIndex + i];
        return token && token.toLowerCase() === pt;
      });
      if (match) {
        return {
          value: def.value,
          consumedTokens: phraseTokens.length,
          rawText: phrase,
          isFraction: true,
          fractionDef: def,
        };
      }
    }
  }

  // Next, check fraction prefixes (e.g. "সোয়া দুই" = 2.25, "পৌনে দুই" = 1.75, "সাড়ে তিন" = 3.5)
  for (const pack of packs) {
    for (const [prefix, pDef] of Object.entries(pack.fractions.prefixes)) {
      const prefixTokens = prefix.toLowerCase().split(/\s+/);
      const matchPrefix = prefixTokens.every((pt, i) => {
        const token = tokens[startIndex + i];
        return token && token.toLowerCase() === pt;
      });
      if (matchPrefix) {
        // Try parsing the number following the prefix
        const nextIndex = startIndex + prefixTokens.length;
        const nextNum = parseSimpleNumberAt(tokens, nextIndex, packs);
        if (nextNum) {
          const totalVal =
            pDef.type === 'add' ? nextNum.value + pDef.value : nextNum.value - pDef.value;
          return {
            value: totalVal,
            consumedTokens: prefixTokens.length + nextNum.consumedTokens,
            rawText: tokens
              .slice(startIndex, startIndex + prefixTokens.length + nextNum.consumedTokens)
              .join(' '),
            isFraction: true,
          };
        }
      }
    }
  }

  // Parse standard simple or composite number (e.g. "two bags", "2.5", "২ লাখ", "five thousand", "twenty five")
  return parseCompositeNumberAt(tokens, startIndex, packs);
}

/**
 * Parses a simple single-word or literal number.
 */
function parseSimpleNumberAt(
  tokens: readonly string[],
  index: number,
  packs: readonly LanguagePack[],
): { value: number; consumedTokens: number } | null {
  const token = tokens[index];
  if (!token) return null;
  const lower = token.toLowerCase();

  // Literal digit?
  const literal = parseNumericLiteral(lower);
  if (literal !== null) {
    return { value: literal, consumedTokens: 1 };
  }

  // Lookup in language packs
  for (const pack of packs) {
    const wordVal = pack.numbers.words[lower];
    if (wordVal !== undefined) {
      return { value: wordVal, consumedTokens: 1 };
    }
    const digitVal = pack.numbers.digits[lower];
    if (digitVal !== undefined) {
      return { value: digitVal, consumedTokens: 1 };
    }
  }

  return null;
}

/**
 * Parses composite numbers, e.g. "twenty five", "2 লাখ", "5 thousand 2 hundred", "এক শ বিশ".
 */
function parseCompositeNumberAt(
  tokens: readonly string[],
  startIndex: number,
  packs: readonly LanguagePack[],
): ParsedNumberResult | null {
  let index = startIndex;
  let total = 0;
  let currentGroup = 0;
  let matchedAny = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    const lower = token.toLowerCase();

    // Check multipliers (hundred, thousand, lakh, crore, শ, হাজার, লাখ)
    let multiplierValue: number | null = null;
    for (const pack of packs) {
      const multVal = pack.numbers.multipliers[lower];
      if (multVal !== undefined) {
        multiplierValue = multVal;
        break;
      }
    }

    if (multiplierValue !== null) {
      matchedAny = true;
      if (currentGroup === 0) currentGroup = 1;
      currentGroup *= multiplierValue;
      if (multiplierValue >= 1000) {
        total += currentGroup;
        currentGroup = 0;
      }
      index++;
      continue;
    }

    // Check simple number
    const simple = parseSimpleNumberAt(tokens, index, packs);
    if (simple !== null) {
      matchedAny = true;
      currentGroup += simple.value;
      index += simple.consumedTokens;
      continue;
    }

    // Check "and a half" / "and a quarter" suffixes
    let suffixFraction: FractionDef | null = null;
    let suffixConsumed = 0;
    for (const pack of packs) {
      for (const [suffix, sDef] of Object.entries(pack.fractions.prefixes)) {
        if (sDef.type === 'add') {
          const sTokens = suffix.toLowerCase().split(/\s+/);
          const matchSuffix = sTokens.every((st, i) => {
            const t = tokens[index + i];
            return t && t.toLowerCase() === st;
          });
          if (matchSuffix) {
            suffixFraction = {
              value: sDef.value,
              numerator: sDef.numerator,
              denominator: sDef.denominator,
            };
            suffixConsumed = sTokens.length;
            break;
          }
        }
      }
      if (suffixFraction) break;
    }

    if (suffixFraction && matchedAny) {
      currentGroup += suffixFraction.value;
      index += suffixConsumed;
      break;
    }

    break;
  }

  if (!matchedAny) return null;

  total += currentGroup;
  return {
    value: total,
    consumedTokens: index - startIndex,
    rawText: tokens.slice(startIndex, index).join(' '),
  };
}
