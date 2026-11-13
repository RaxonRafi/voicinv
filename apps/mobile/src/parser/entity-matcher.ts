import { compareEntities, stripSuffix } from './string-similarity';
import {
  type CustomerCandidate,
  type LanguagePack,
  type LearnedCorrection,
  type ProductCandidate,
} from './types';

export const RESERVED_WORDS = new Set([
  'to',
  'for',
  'of',
  'and',
  'in',
  'on',
  'at',
  'with',
  'from',
  'paid',
  'due',
  'cash',
  'credit',
  'all',
  'full',
  'half',
  'quarter',
  'give',
  'bill',
  'sold',
  'sell',
  'take',
  'please',
  'balance',
  'sales',
  'today',
  'todays',
  "today's",
  'summary',
  'how',
  'much',
  'what',
  'is',
  'the',
  'payment',
  'received',
  'debt',
  'installment',
  'কে',
  'এর',
  'ের',
  'রে',
  'তে',
  'এ',
  'দাও',
  'দিল',
  'দিছে',
  'দিয়েছে',
  'নিল',
  'নিয়েছে',
  'বিক্রি',
  'বেচলাম',
  'বাকি',
  'সব',
  'পুরো',
  'নগদ',
  'ক্যাশ',
  'জমা',
  'টাকা',
  'পরিশোধ',
  'হিসাব',
  'কত',
  'কি',
  'দেখাও',
  'আজকের',
  'আজকে',
  'আজ',
  'মোট',
  'দেনা',
  'এবং',
  'ও',
  'আর',
  'করে',
  'পাবে',
  'আছে',
  'বেচা',
  'বেচাকেনা',
]);

export interface EntityMatch<T> {
  item: T;
  score: number;
  matchedName: string;
  matchedText: string;
  consumedTokens: number;
  startIndex: number;
}

export interface ScoredCandidate {
  id: string | null;
  name: string;
  score: number;
}

function getMinScoreForTarget(name: string): number {
  if (name.length <= 3) return 0.88;
  if (name.length <= 4) return 0.8;
  return 0.75;
}

/**
 * Normalizes customer objects from either string or CustomerCandidate.
 */
function normalizeCustomer(c: CustomerCandidate | string): CustomerCandidate {
  if (typeof c === 'string') {
    return { id: null, name: c, aliases: [] };
  }
  return {
    id: c.id ?? null,
    name: c.name,
    aliases: c.aliases ?? [],
  };
}

/**
 * Matches customer names from the input tokens.
 * Checks learned corrections first, then customer names & aliases with suffix stripping and fuzzy scoring.
 * Returns best match and top 3 candidate suggestions.
 */
export function matchCustomerInTokens(
  tokens: readonly string[],
  customers: readonly (CustomerCandidate | string)[],
  corrections: readonly LearnedCorrection[] = [],
  packs: readonly LanguagePack[],
): {
  match: EntityMatch<CustomerCandidate> | null;
  topCandidates: ScoredCandidate[];
} {
  const normCustomers = customers.map(normalizeCustomer);
  if (normCustomers.length === 0) {
    return { match: null, topCandidates: [] };
  }

  // 1. Learned corrections checked first
  const customerCorrections = corrections.filter((c) => c.fieldType === 'customer');
  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const sliceText = tokens.slice(i, i + len).join(' ');
      const strippedSlice = stripSuffix(sliceText, packs);

      for (const corr of customerCorrections) {
        if (
          corr.heardText.toLowerCase() === sliceText.toLowerCase() ||
          corr.heardText.toLowerCase() === strippedSlice.toLowerCase()
        ) {
          // Find the customer matching correctedText
          const target = normCustomers.find(
            (c) =>
              c.name.toLowerCase() === corr.correctedText.toLowerCase() ||
              c.aliases?.some((a) => a.toLowerCase() === corr.correctedText.toLowerCase()),
          );
          if (target) {
            return {
              match: {
                item: target,
                score: 1.0,
                matchedName: target.name,
                matchedText: sliceText,
                consumedTokens: len,
                startIndex: i,
              },
              topCandidates: [{ id: target.id ?? null, name: target.name, score: 1.0 }],
            };
          }
        }
      }
    }
  }

  // 2. Score customers across n-grams (1 to 3 words)
  const matches: EntityMatch<CustomerCandidate>[] = [];

  for (let len = Math.min(3, tokens.length); len >= 1; len--) {
    for (let i = 0; i <= tokens.length - len; i++) {
      const sliceText = tokens.slice(i, i + len).join(' ');
      const strippedSlice = stripSuffix(sliceText, packs);

      // Do not match reserved/stop words as customer names
      if (
        RESERVED_WORDS.has(strippedSlice.toLowerCase()) ||
        RESERVED_WORDS.has(sliceText.toLowerCase())
      ) {
        continue;
      }

      for (const customer of normCustomers) {
        const minScore = getMinScoreForTarget(customer.name);
        // Compare with main name
        const nameScore = compareEntities(strippedSlice, customer.name, packs);
        if (nameScore >= minScore) {
          matches.push({
            item: customer,
            score: nameScore,
            matchedName: customer.name,
            matchedText: sliceText,
            consumedTokens: len,
            startIndex: i,
          });
        }

        // Compare with aliases
        if (customer.aliases) {
          for (const alias of customer.aliases) {
            const aliasMin = getMinScoreForTarget(alias);
            const aliasScore = compareEntities(strippedSlice, alias, packs);
            if (aliasScore >= aliasMin) {
              matches.push({
                item: customer,
                score: aliasScore,
                matchedName: alias,
                matchedText: sliceText,
                consumedTokens: len,
                startIndex: i,
              });
            }
          }
        }
      }
    }
  }

  if (matches.length === 0) {
    return { match: null, topCandidates: [] };
  }

  // Sort by score descending, then longer token length descending
  matches.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
    return b.consumedTokens - a.consumedTokens;
  });

  const bestMatch = matches[0];
  if (!bestMatch) {
    return { match: null, topCandidates: [] };
  }

  // Collect unique top candidates (up to 3)
  const seen = new Set<string>();
  const topCandidates: ScoredCandidate[] = [];

  for (const m of matches) {
    if (!seen.has(m.item.name)) {
      seen.add(m.item.name);
      topCandidates.push({
        id: m.item.id ?? null,
        name: m.item.name,
        score: Math.round(m.score * 100) / 100,
      });
      if (topCandidates.length >= 3) break;
    }
  }

  return { match: bestMatch, topCandidates };
}

function isNumberToken(text: string, packs: readonly LanguagePack[]): boolean {
  const norm = text.toLowerCase().trim();
  if (/^-?\d+(\.\d+)?$/.test(norm)) return true;
  for (const pack of packs) {
    if (pack.numbers.words[norm] !== undefined) return true;
    if (pack.numbers.digits[norm] !== undefined) return true;
    if (pack.numbers.multipliers[norm] !== undefined) return true;
    if (pack.fractions.standalone[norm] !== undefined) return true;
  }
  return false;
}

/**
 * Matches products from tokens starting at or containing a region.
 */
export function matchProductAt(
  tokens: readonly string[],
  startIndex: number,
  products: readonly ProductCandidate[],
  corrections: readonly LearnedCorrection[] = [],
  packs: readonly LanguagePack[],
): {
  match: EntityMatch<ProductCandidate> | null;
  topCandidates: ScoredCandidate[];
} {
  if (products.length === 0 || startIndex >= tokens.length) {
    return { match: null, topCandidates: [] };
  }

  // 1. Learned corrections
  const productCorrections = corrections.filter((c) => c.fieldType === 'product');
  for (let len = Math.min(3, tokens.length - startIndex); len >= 1; len--) {
    const sliceText = tokens.slice(startIndex, startIndex + len).join(' ');
    const strippedSlice = stripSuffix(sliceText, packs);

    for (const corr of productCorrections) {
      if (
        corr.heardText.toLowerCase() === sliceText.toLowerCase() ||
        corr.heardText.toLowerCase() === strippedSlice.toLowerCase()
      ) {
        const target = products.find(
          (p) =>
            p.name.toLowerCase() === corr.correctedText.toLowerCase() ||
            p.aliases?.some((a) => a.toLowerCase() === corr.correctedText.toLowerCase()),
        );
        if (target) {
          return {
            match: {
              item: target,
              score: 1.0,
              matchedName: target.name,
              matchedText: sliceText,
              consumedTokens: len,
              startIndex,
            },
            topCandidates: [{ id: target.id ?? null, name: target.name, score: 1.0 }],
          };
        }
      }
    }
  }

  // 2. Score products
  const matches: EntityMatch<ProductCandidate>[] = [];

  for (let len = Math.min(3, tokens.length - startIndex); len >= 1; len--) {
    const sliceText = tokens.slice(startIndex, startIndex + len).join(' ');
    const strippedSlice = stripSuffix(sliceText, packs);

    // Do not match reserved/stop words or number words as products
    if (
      RESERVED_WORDS.has(strippedSlice.toLowerCase()) ||
      RESERVED_WORDS.has(sliceText.toLowerCase()) ||
      isNumberToken(strippedSlice, packs) ||
      isNumberToken(sliceText, packs)
    ) {
      continue;
    }

    for (const product of products) {
      const minScore = getMinScoreForTarget(product.name);
      const nameScore = compareEntities(strippedSlice, product.name, packs);
      if (nameScore >= minScore) {
        matches.push({
          item: product,
          score: nameScore,
          matchedName: product.name,
          matchedText: sliceText,
          consumedTokens: len,
          startIndex,
        });
      }

      if (product.aliases) {
        for (const alias of product.aliases) {
          const aliasMin = getMinScoreForTarget(alias);
          const aliasScore = compareEntities(strippedSlice, alias, packs);
          if (aliasScore >= aliasMin) {
            matches.push({
              item: product,
              score: aliasScore,
              matchedName: alias,
              matchedText: sliceText,
              consumedTokens: len,
              startIndex,
            });
          }
        }
      }
    }
  }

  if (matches.length === 0) {
    return { match: null, topCandidates: [] };
  }

  matches.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) return b.score - a.score;
    return b.consumedTokens - a.consumedTokens;
  });

  const bestMatch = matches[0];
  if (!bestMatch) {
    return { match: null, topCandidates: [] };
  }
  const seen = new Set<string>();
  const topCandidates: ScoredCandidate[] = [];

  for (const m of matches) {
    if (!seen.has(m.item.name)) {
      seen.add(m.item.name);
      topCandidates.push({
        id: m.item.id ?? null,
        name: m.item.name,
        score: Math.round(m.score * 100) / 100,
      });
      if (topCandidates.length >= 3) break;
    }
  }

  return { match: bestMatch, topCandidates };
}

/**
 * Resolves a unit token/word against language pack units.
 * Returns the canonical unit name or null.
 */
export function resolveUnit(token: string, packs: readonly LanguagePack[]): string | null {
  const raw = token.toLowerCase().trim();

  // 1. Check direct match first without stripping
  for (const pack of packs) {
    for (const [canonical, aliases] of Object.entries(pack.units.canonical)) {
      if (canonical.toLowerCase() === raw) return canonical;
      for (const alias of aliases) {
        if (alias.toLowerCase() === raw) return canonical;
      }
    }
  }

  // 2. If direct match fails, try stripping suffixes (e.g. "লিটারের" -> "লিটার", "কেজির" -> "কেজি")
  const norm = stripSuffix(raw, packs);
  for (const pack of packs) {
    for (const [canonical, aliases] of Object.entries(pack.units.canonical)) {
      if (canonical.toLowerCase() === norm) return canonical;
      for (const alias of aliases) {
        if (alias.toLowerCase() === norm) return canonical;
      }
    }
  }

  return null;
}
