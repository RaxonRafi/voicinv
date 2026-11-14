import { type MinorUnits, type PaymentInstruction } from '@/domain';

import { matchCustomerInTokens, matchProductAt, resolveUnit } from './entity-matcher';
import { detectVoiceIntent } from './intent-detector';
import { getAllLanguagePacks, getLanguagePack } from './lang';
import {
  genericItem,
  isCurrencyWord,
  parseMoneyAt,
  priceItem,
  separateCurrencySymbols,
} from './money';
import { normalizeBengaliVariants, normalizeVoiceInput } from './normalizer';
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

  const normalized = normalizeVoiceInput(separateCurrencySymbols(rawText, packs), packs);
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
  const { items, amounts } = extractItems(
    remainingTokens,
    context.products,
    packs,
    context.corrections ?? [],
  );

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

  // SALE Intent. An amount with no product ("500 taka") becomes a line for the user to name.
  const primaryPack = packs[0];
  const saleItems = primaryPack
    ? [...items, ...amounts.map((amount) => genericItem(amount, primaryPack))]
    : items;
  const overallConfidence = calculateSaleConfidence(parsedCustomer, saleItems, paymentConfidence);

  return {
    intent: 'SALE',
    customer: parsedCustomer,
    items: saleItems,
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

  // Check amount payments with each pack's own patterns ("paid {amount}", "{amount} টাকা দিল").
  // A currency word next to the amount is optional, so "paid 500" and "paid 500 taka" both
  // match. A bare "500 taka" is NOT a payment: with no payment word it is the price of a sale.
  for (const pack of packs) {
    for (const pattern of pack.paymentPhrases.amountPatterns) {
      const match = matchAmountPattern(tokens, pattern, packs);
      if (match) {
        for (let k = match.start; k < match.end; k++) consumed.add(k);
        return {
          payment: { type: 'AMOUNT', amount: match.amount },
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
 * Finds a payment-amount pattern such as "paid {amount}" or "{amount} টাকা দিল". Currency
 * words are optional around the amount (and so are dropped from the pattern itself). Returns
 * the token range and the amount in minor units.
 */
function matchAmountPattern(
  tokens: readonly string[],
  pattern: string,
  packs: readonly LanguagePack[],
): { start: number; end: number; amount: MinorUnits } | null {
  const parts = pattern
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part !== '' && !isCurrencyWord(part, packs));
  for (let start = 0; start < tokens.length; start++) {
    let position = start;
    let amount: MinorUnits | null = null;
    let matched = true;
    for (const part of parts) {
      if (part === '{amount}') {
        if (isCurrencyWord(tokens[position], packs)) position++;
        const number = parseNumberAt(tokens, position, packs);
        if (!number || number.isFraction) {
          matched = false;
          break;
        }
        position += number.consumedTokens;
        if (isCurrencyWord(tokens[position], packs)) position++;
        amount = Math.round(number.value * 100);
      } else if (tokens[position]?.toLowerCase() === part) {
        position++;
      } else {
        matched = false;
        break;
      }
    }
    if (matched && amount !== null) return { start, end: position, amount };
  }
  return null;
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
): { items: ParsedItem[]; amounts: MinorUnits[] } {
  const items: ParsedItem[] = [];
  /** Spoken amounts that belong to no product. */
  const amounts: MinorUnits[] = [];
  const consumed = new Set<number>();
  /** The last line, and whether its quantity was spoken and its amount already given. */
  let last: { index: number; quantitySpoken: boolean; priced: boolean } | null = null;
  const isOf = (token: string | undefined) => token === 'of' || token === 'এর';

  let i = 0;
  while (i < tokens.length) {
    if (consumed.has(i)) {
      i++;
      continue;
    }

    // Money is never a quantity: "500 taka", "৫০০ টাকা", "৳500".
    const money = parseMoneyAt(tokens, i, packs);
    if (money) {
      let next = i + money.consumedTokens;
      if (isOf(tokens[next]?.toLowerCase())) next++;
      // "৫০০ টাকার চাল" / "500 taka of rice": a product worth the amount.
      const worth = matchProductAt(tokens, next, products, corrections, packs);
      if (worth.match && worth.match.score >= 0.65) {
        const prod = worth.match.item;
        items.push(
          priceItem(
            {
              productId: prod.id ?? null,
              name: prod.name,
              unit: prod.unit,
              qtyMilli: 1000,
              unitPrice: prod.defaultPrice ?? null,
              confidence: worth.match.score,
              candidates: worth.topCandidates,
            },
            money.amount,
            false,
          ),
        );
        last = { index: items.length - 1, quantitySpoken: false, priced: true };
        for (let k = i; k < next + worth.match.consumedTokens; k++) consumed.add(k);
        i = next + worth.match.consumedTokens;
        continue;
      }
      // "চাল ২ কেজি ১২০ টাকা" / "rice 120 taka": the amount of the line just spoken.
      const target = last && !last.priced ? items[last.index] : undefined;
      if (last && target) {
        items[last.index] = priceItem(target, money.amount, last.quantitySpoken);
        last.priced = true;
      } else {
        amounts.push(money.amount);
      }
      for (let k = i; k < i + money.consumedTokens; k++) consumed.add(k);
      i += money.consumedTokens;
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
        last = { index: items.length - 1, quantitySpoken: true, priced: false };

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
      // A number followed by a currency word is the price, handled on the next pass.
      const numAfter = parseMoneyAt(tokens, nextIdx, packs)
        ? null
        : parseNumberAt(tokens, nextIdx, packs);
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
      last = { index: items.length - 1, quantitySpoken: numAfter !== null, priced: false };

      for (let k = i; k < nextIdx; k++) consumed.add(k);
      i = nextIdx;
      continue;
    }

    i++;
  }

  return { items, amounts };
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
      // Phrases come from the language packs as written; the input was normalized, so the
      // phrase must be too, or a word with য় / ড় / ঢ় ("দিয়েছে") could never match.
      const subNormal = normalizeBengaliVariants(subJ).toLowerCase();
      const tokenClean = stripSuffix(tokI.toLowerCase(), []);
      const subClean = stripSuffix(subNormal, []);
      if (tokenClean !== subClean && tokI.toLowerCase() !== subNormal) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
