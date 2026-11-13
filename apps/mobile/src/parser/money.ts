import { type MinorUnits } from '@/shared';

import { parseNumberAt } from './numbers';
import { type LanguagePack, type ParsedItem } from './types';

// Spoken amounts of money ("500 taka", "৫০০ টাকা", "৳500", "Tk 500"). Which words mean money
// comes from each language pack's currency.json, so a new language is a data change only.

export function isCurrencyWord(token: string | undefined, packs: readonly LanguagePack[]): boolean {
  if (!token) return false;
  const word = token.toLowerCase();
  return packs.some(
    (pack) => pack.currency.words.includes(word) || pack.currency.symbols.includes(word),
  );
}

/** Puts spaces around currency signs, so "৳500" and "500৳" read as a sign and a number. */
export function separateCurrencySymbols(text: string, packs: readonly LanguagePack[]): string {
  let result = text;
  for (const symbol of new Set(packs.flatMap((pack) => pack.currency.symbols))) {
    result = result.split(symbol).join(` ${symbol} `);
  }
  return result.replace(/\s+/g, ' ').trim();
}

export interface MoneyAt {
  amount: MinorUnits;
  consumedTokens: number;
}

/** An amount of money starting at `index`: "<number> <currency>" or "<currency> <number>". */
export function parseMoneyAt(
  tokens: readonly string[],
  index: number,
  packs: readonly LanguagePack[],
): MoneyAt | null {
  const toMinor = (value: number): MinorUnits => Math.round(value * 100);
  const number = parseNumberAt(tokens, index, packs);
  if (number && isCurrencyWord(tokens[index + number.consumedTokens], packs)) {
    return { amount: toMinor(number.value), consumedTokens: number.consumedTokens + 1 };
  }
  if (isCurrencyWord(tokens[index], packs)) {
    const after = parseNumberAt(tokens, index + 1, packs);
    if (after) return { amount: toMinor(after.value), consumedTokens: 1 + after.consumedTokens };
  }
  return null;
}

/** Confidence of values the parser inferred rather than heard; below the highlight line. */
const INFERRED_CONFIDENCE = 0.7;

/**
 * Applies a spoken amount to a line.
 *
 * - With a spoken quantity ("2 kg rice 120 taka"), the amount is the line total: the unit
 *   price is total ÷ quantity. If that does not come out in whole paisa it is rounded and
 *   the line is marked for review.
 * - Without one ("500 taka of rice", "rice 500 taka"), the product is bought *worth* that
 *   amount: the quantity follows from its usual price when that divides exactly; otherwise
 *   the line is one unit at the amount.
 */
export function priceItem(
  item: ParsedItem,
  total: MinorUnits,
  quantitySpoken: boolean,
): ParsedItem {
  if (quantitySpoken) {
    const exact = (total * 1000) % item.qtyMilli === 0;
    return {
      ...item,
      unitPrice: exact
        ? (total * 1000) / item.qtyMilli
        : Math.round((total * 1000) / item.qtyMilli),
      confidence: exact ? item.confidence : Math.min(item.confidence, INFERRED_CONFIDENCE),
    };
  }
  const usual = item.unitPrice;
  if (usual !== null && usual > 0 && (total * 1000) % usual === 0) {
    return {
      ...item,
      qtyMilli: (total * 1000) / usual,
      confidence: Math.min(item.confidence, INFERRED_CONFIDENCE),
    };
  }
  return { ...item, qtyMilli: 1000, unitPrice: total };
}

/** A line made from an amount with no product ("500 taka"), named for the user to change. */
export function genericItem(amount: MinorUnits, pack: LanguagePack): ParsedItem {
  return {
    productId: null,
    name: pack.currency.genericItem,
    unit: 'piece',
    qtyMilli: 1000,
    unitPrice: amount,
    // Always reviewed: the product is unknown.
    confidence: 0.5,
    candidates: [],
  };
}
