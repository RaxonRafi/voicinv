import { type MinorUnits, type PaymentInstruction } from '@/shared';

import { matchCustomerInTokens, matchProductAt, resolveUnit } from './entity-matcher';
import { detectVoiceIntent } from './intent-detector';
import { getAllLanguagePacks, getLanguagePack } from './lang';
import { normalizeVoiceInput } from './normalizer';
import { parseNumberAt } from './numbers';
import { stripSuffix } from './string-similarity';
import {
  type LanguagePack,
  type ParsedCustomer,
  type ParsedItem,
  type ParserContext,
  type ParseResult,
  type ProductCandidate,
} from './types';

export function parseVoice(
  rawText: string,
  context: ParserContext,
  customPacks?: readonly LanguagePack[],
): ParseResult {
  const packs =
    customPacks ??
    (context.language
      ? [
          getLanguagePack(context.language),
          ...getAllLanguagePacks().filter((p) => p.code !== context.language),
        ]
      : getAllLanguagePacks());

  const normalized = normalizeVoiceInput(rawText, packs);
  const initialTokens = normalized.split(/\s+/).filter(Boolean);

  // 1. Check for payment phrases (FRACTION, FULL, NONE, AMOUNT)
  const { payment, paymentTokensConsumed, paymentConfidence } = extractPaymentInstruction(
    initialTokens,
    packs,
  );

  // Filter out consumed payment tokens so they don't interfere with entity parsing
  const tokensWithoutPayment =
    paymentTokensConsumed.size > 0
      ? initialTokens.filter((_, idx) => !paymentTokensConsumed.has(idx))
      : initialTokens;

  // 2. Extract Customer
  const customerResult = matchCustomerInTokens(
    tokensWithoutPayment,
    context.customers,
    context.corrections ?? [],
    packs,
  );

  let parsedCustomer: ParsedCustomer | null = null;
  const customerTokensConsumed = new Set<number>();

  const matchedCustomer = customerResult.match;
  if (matchedCustomer && matchedCustomer.score >= 0.75) {
    // If the matched text is actually an exact/high match for a product, do not mistake it for a customer
    const isActuallyProduct =
      matchedCustomer.score < 0.95 &&
      context.products.some((p) => {
        const prodMatch = matchProductAt(
          tokensWithoutPayment,
          matchedCustomer.startIndex,
          [p],
          context.corrections ?? [],
          packs,
        );
        return prodMatch.match && prodMatch.match.score >= 0.95;
      });

    if (!isActuallyProduct) {
      parsedCustomer = {
        id: matchedCustomer.item.id ?? null,
        name: matchedCustomer.item.name,
        confidence: matchedCustomer.score,
        candidates: customerResult.topCandidates,
      };
      for (
        let i = matchedCustomer.startIndex;
        i < matchedCustomer.startIndex + matchedCustomer.consumedTokens;
        i++
      ) {
        customerTokensConsumed.add(i);
      }
    }
  }

  // Tokens available for items / queries / amounts
  const remainingTokens = tokensWithoutPayment.filter((_, idx) => !customerTokensConsumed.has(idx));

  // 3. Extract Items
  const items = extractItems(remainingTokens, context.products, packs, context.corrections ?? []);

  // 4. Extract Discount (if any)
  const discount = extractDiscount(remainingTokens, packs);

  // 5. Detect Intent
  const intentInfo = detectVoiceIntent(normalized, items.length > 0, packs);

  if (intentInfo.intent === 'QUERY') {
    return {
      intent: 'QUERY',
      queryType: intentInfo.queryType ?? 'UNKNOWN',
      customer: parsedCustomer,
      confidence: intentInfo.confidence,
      sourceText: rawText,
    };
  }

  if (intentInfo.intent === 'PAYMENT') {
    // If it's a payment, try to extract amount from remaining tokens if not already found
    let paymentAmount: MinorUnits | null = null;
    if (payment.type === 'AMOUNT') {
      paymentAmount = payment.amount;
    } else {
      for (let i = 0; i < remainingTokens.length; i++) {
        const num = parseNumberAt(remainingTokens, i, packs);
        if (num && !num.isFraction) {
          // Multiply by 100 to get minor units (paisa) if it's typical currency integer
          paymentAmount = Math.round(num.value * 100);
          break;
        }
      }
    }

    return {
      intent: 'PAYMENT',
      customer: parsedCustomer,
      amount: paymentAmount,
      confidence: Math.min(parsedCustomer?.confidence ?? 0.7, intentInfo.confidence),
      sourceText: rawText,
    };
  }

  // SALE Intent
  const overallConfidence = calculateSaleConfidence(parsedCustomer, items, paymentConfidence);

  return {
    intent: 'SALE',
    customer: parsedCustomer,
    items,
    discount,
    payment,
    customerConfidence: parsedCustomer?.confidence,
    paymentConfidence,
    confidence: overallConfidence,
    sourceText: rawText,
  };
}

/**
 * Extracts payment instructions from tokens.
 */
function extractPaymentInstruction(
  tokens: readonly string[],
  packs: readonly LanguagePack[],
): {
  payment: PaymentInstruction & { value?: number };
  paymentTokensConsumed: Set<number>;
  paymentConfidence: number;
} {
  const consumed = new Set<number>();

  // Check fraction payments (e.g. "paid half", "half paid", "অর্ধেক দিল")
  for (const pack of packs) {
    for (const frac of pack.paymentPhrases.fraction) {
      const phraseTokens = frac.phrase.toLowerCase().split(/\s+/);
      const startIdx = findSubsequence(tokens, phraseTokens);
      if (startIdx !== -1) {
        for (let i = startIdx; i < startIdx + phraseTokens.length; i++) consumed.add(i);
        return {
          payment: {
            type: 'FRACTION',
            numerator: frac.numerator,
            denominator: frac.denominator,
            value: frac.value,
          },
          paymentTokensConsumed: consumed,
          paymentConfidence: 1.0,
        };
      }
    }
  }

  // Check full payments (e.g. "paid full", "cash", "নগদ", "ফুল পেইড")
  for (const pack of packs) {
    for (const phrase of pack.paymentPhrases.full) {
      const phraseTokens = phrase.toLowerCase().split(/\s+/);
      const startIdx = findSubsequence(tokens, phraseTokens);
      if (startIdx !== -1) {
        for (let i = startIdx; i < startIdx + phraseTokens.length; i++) consumed.add(i);
        return {
          payment: { type: 'FULL' },
          paymentTokensConsumed: consumed,
          paymentConfidence: 1.0,
        };
      }
    }
  }

  // Check none / credit payments (e.g. "all due", "due", "on credit", "বাকি", "সব বাকি")
  for (const pack of packs) {
    for (const phrase of pack.paymentPhrases.none) {
      const phraseTokens = phrase.toLowerCase().split(/\s+/);
      const startIdx = findSubsequence(tokens, phraseTokens);
      if (startIdx !== -1) {
        for (let i = startIdx; i < startIdx + phraseTokens.length; i++) consumed.add(i);
        return {
          payment: { type: 'NONE' },
          paymentTokensConsumed: consumed,
          paymentConfidence: 1.0,
        };
      }
    }
  }

  // Check amount payments (e.g. "paid 500", "500 paid", "৫০০ টাকা দিল")
  for (let i = 0; i < tokens.length; i++) {
    const tokenStr = tokens[i];
    if (!tokenStr) continue;
    const t = tokenStr.toLowerCase();
    if (t === 'paid' || t === 'দিল' || t === 'দিছে' || t === 'টাকা' || t === 'জমা') {
      // Look before or after for a number
      const numBefore = i > 0 ? parseNumberAt(tokens, i - 1, packs) : null;
      const numAfter = i + 1 < tokens.length ? parseNumberAt(tokens, i + 1, packs) : null;

      if (numAfter && !numAfter.isFraction) {
        consumed.add(i);
        for (let k = 0; k < numAfter.consumedTokens; k++) consumed.add(i + 1 + k);
        // Convert to minor units (e.g. 500 taka -> 50000 paisa)
        const minorUnits = Math.round(numAfter.value * 100);
        return {
          payment: { type: 'AMOUNT', amount: minorUnits },
          paymentTokensConsumed: consumed,
          paymentConfidence: 0.95,
        };
      } else if (numBefore && !numBefore.isFraction) {
        consumed.add(i);
        for (let k = 0; k < numBefore.consumedTokens; k++) consumed.add(i - 1 - k);
        const minorUnits = Math.round(numBefore.value * 100);
        return {
          payment: { type: 'AMOUNT', amount: minorUnits },
          paymentTokensConsumed: consumed,
          paymentConfidence: 0.95,
        };
      }
    }
  }

  // Default payment: FULL (per product core loop assumption when not specified)
  return {
    payment: { type: 'FULL' },
    paymentTokensConsumed: consumed,
    paymentConfidence: 0.7,
  };
}

/**
 * Extracts line items (product, quantity, unit, price) from remaining tokens.
 */
function extractItems(
  tokens: readonly string[],
  products: readonly ProductCandidate[],
  packs: readonly LanguagePack[],
  corrections: readonly {
    heardText: string;
    correctedText: string;
    fieldType: 'customer' | 'product';
  }[],
): ParsedItem[] {
  const items: ParsedItem[] = [];
  const consumed = new Set<number>();

  let i = 0;
  while (i < tokens.length) {
    if (consumed.has(i)) {
      i++;
      continue;
    }

    // Check if tokens at `i` represent a number/quantity
    const numResult = parseNumberAt(tokens, i, packs);

    if (numResult) {
      const qtyMilli = Math.round(numResult.value * 1000);
      let nextIdx = i + numResult.consumedTokens;

      // Check if next token is a unit (e.g. "bags", "kg", "বস্তা", "কেজি")
      let matchedUnit: string | null = null;
      if (nextIdx < tokens.length) {
        const nextTok = tokens[nextIdx];
        if (nextTok) {
          matchedUnit = resolveUnit(nextTok, packs);
          if (matchedUnit) {
            nextIdx++;
          }
        }
      }

      // Skip preposition "of" / "এর"
      if (nextIdx < tokens.length) {
        const prep = tokens[nextIdx]?.toLowerCase();
        if (prep === 'of' || prep === 'এর') {
          nextIdx++;
        }
      }

      // Now match product
      const productMatch = matchProductAt(tokens, nextIdx, products, corrections, packs);
      if (productMatch.match && productMatch.match.score >= 0.65) {
        const prod = productMatch.match.item;
        const unit = matchedUnit ?? prod.unit;
        items.push({
          productId: prod.id ?? null,
          name: prod.name,
          unit,
          qtyMilli,
          unitPrice: prod.defaultPrice ?? null,
          confidence: productMatch.match.score,
          candidates: productMatch.topCandidates,
        });

        for (let k = i; k < nextIdx + productMatch.match.consumedTokens; k++) {
          consumed.add(k);
        }
        i = nextIdx + productMatch.match.consumedTokens;
        continue;
      }
    }

    // Or check if product comes first: "<product> <quantity> [unit]"
    const prodFirst = matchProductAt(tokens, i, products, corrections, packs);
    if (prodFirst.match && prodFirst.match.score >= 0.65) {
      const prod = prodFirst.match.item;
      let nextIdx = i + prodFirst.match.consumedTokens;

      // Check number after product
      const numAfter = parseNumberAt(tokens, nextIdx, packs);
      let qtyMilli = 1000;
      let matchedUnit: string | null = null;

      if (numAfter) {
        qtyMilli = Math.round(numAfter.value * 1000);
        nextIdx += numAfter.consumedTokens;

        if (nextIdx < tokens.length) {
          const nextTok = tokens[nextIdx];
          if (nextTok) {
            matchedUnit = resolveUnit(nextTok, packs);
            if (matchedUnit) nextIdx++;
          }
        }
      }

      items.push({
        productId: prod.id ?? null,
        name: prod.name,
        unit: matchedUnit ?? prod.unit,
        qtyMilli,
        unitPrice: prod.defaultPrice ?? null,
        confidence: prodFirst.match.score,
        candidates: prodFirst.topCandidates,
      });

      for (let k = i; k < nextIdx; k++) consumed.add(k);
      i = nextIdx;
      continue;
    }

    i++;
  }

  return items;
}

/**
 * Extracts discount amount if present in tokens.
 */
function extractDiscount(tokens: readonly string[], packs: readonly LanguagePack[]): MinorUnits {
  for (let i = 0; i < tokens.length; i++) {
    const tokenStr = tokens[i];
    if (!tokenStr) continue;
    const t = tokenStr.toLowerCase();
    if (t === 'discount' || t === 'ছাড়' || t === 'ডিসকাউন্ট' || t === 'কম') {
      const numAfter = i + 1 < tokens.length ? parseNumberAt(tokens, i + 1, packs) : null;
      if (numAfter && !numAfter.isFraction) {
        return Math.round(numAfter.value * 100);
      }
      const numBefore = i > 0 ? parseNumberAt(tokens, i - 1, packs) : null;
      if (numBefore && !numBefore.isFraction) {
        return Math.round(numBefore.value * 100);
      }
    }
  }
  return 0;
}

function calculateSaleConfidence(
  customer: ParsedCustomer | null,
  items: readonly ParsedItem[],
  paymentConfidence: number,
): number {
  if (items.length === 0) return 0.4;
  const customerConf = customer ? customer.confidence : 0.9; // walk-in is normal
  const itemsConf = items.reduce((acc, it) => acc + it.confidence, 0) / items.length;
  return Math.round((customerConf * 0.4 + itemsConf * 0.4 + paymentConfidence * 0.2) * 100) / 100;
}

function findSubsequence(tokens: readonly string[], sub: readonly string[]): number {
  if (sub.length === 0 || tokens.length < sub.length) return -1;
  for (let i = 0; i <= tokens.length - sub.length; i++) {
    let match = true;
    for (let j = 0; j < sub.length; j++) {
      const tokI = tokens[i + j];
      const subJ = sub[j];
      if (!tokI || !subJ) {
        match = false;
        break;
      }
      const tokenClean = stripSuffix(tokI.toLowerCase(), []);
      const subClean = stripSuffix(subJ.toLowerCase(), []);
      if (tokenClean !== subClean && tokI.toLowerCase() !== subJ.toLowerCase()) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
