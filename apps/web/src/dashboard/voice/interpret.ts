import { type AppContent } from '@/content';
import { type LanguageCode } from '@/domain';
import { fill } from '@/lib/format';
import {
  type CustomerCandidate,
  type LearnedCorrection,
  parsedSaleToDraft,
  type ParseResult,
  type ParsedQuery,
  parseVoice,
  type ProductCandidate,
} from '@/parser';

import { type InvoiceDraft } from '../data/draft';
import { calculateDateRange, customerBalances, getSalesSummary } from '../data/selectors';
import { type ShopData } from '../data/shop-data';
import { type Formatters } from '../format';

// What a spoken or typed sentence means, worked out in the browser with the same parser and
// language packs as the phone. Nothing is sent anywhere to understand it.

/** Corrections learned in this browser tab. Like on the phone they are never synced. */
const corrections: LearnedCorrection[] = [];

/** Remembers that the user changed what was heard into something else. */
export function learnCorrection(
  heardText: string,
  correctedText: string,
  fieldType: LearnedCorrection['fieldType'],
): void {
  const heard = heardText.trim();
  const corrected = correctedText.trim();
  if (!heard || !corrected || heard.toLowerCase() === corrected.toLowerCase()) return;
  const existing = corrections.find(
    (entry) => entry.heardText === heard && entry.fieldType === fieldType,
  );
  if (existing) {
    existing.correctedText = corrected;
    existing.count = (existing.count ?? 1) + 1;
  } else {
    corrections.push({ heardText: heard, correctedText: corrected, fieldType, count: 1 });
  }
}

export function interpret(data: ShopData, text: string, language: LanguageCode): ParseResult {
  const customerAliases = new Map<string, string[]>();
  for (const alias of data.customerAliases.values()) {
    if (alias.deletedAt !== null) continue;
    customerAliases.set(alias.customerId, [
      ...(customerAliases.get(alias.customerId) ?? []),
      alias.alias,
    ]);
  }
  const productAliases = new Map<string, string[]>();
  for (const alias of data.productAliases.values()) {
    if (alias.deletedAt !== null) continue;
    productAliases.set(alias.productId, [
      ...(productAliases.get(alias.productId) ?? []),
      alias.alias,
    ]);
  }
  const customers: CustomerCandidate[] = [...data.customers.values()]
    .filter((customer) => customer.deletedAt === null && !customer.isArchived)
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      aliases: customerAliases.get(customer.id) ?? [],
    }));
  const products: ProductCandidate[] = [...data.products.values()]
    .filter((product) => product.deletedAt === null && !product.isArchived)
    .map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.unit,
      defaultPrice: product.defaultPrice,
      aliases: productAliases.get(product.id) ?? [],
    }));
  return parseVoice(text, {
    customers,
    products,
    corrections: [...corrections].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
    language,
  });
}

/** The invoice draft for a spoken sale, ready for the invoice screen. */
export function draftFromSale(result: Extract<ParseResult, { intent: 'SALE' }>): InvoiceDraft {
  return parsedSaleToDraft(result);
}

/** The answer to a question: a customer's balance or today's sales. */
export function answerQuery(
  data: ShopData,
  query: ParsedQuery,
  t: AppContent,
  fmt: Formatters,
  now: number,
): string {
  switch (query.queryType) {
    case 'CUSTOMER_BALANCE': {
      const customer = query.customer;
      if (!customer?.id) return t.voice.queryCustomerNotFound;
      const balance = customerBalances(data).get(customer.id) ?? 0;
      if (balance > 0)
        return fill(t.voice.queryBalance, { name: customer.name, balance: fmt.money(balance) });
      if (balance < 0) {
        return fill(t.voice.queryAdvance, { name: customer.name, balance: fmt.money(-balance) });
      }
      return fill(t.voice.queryBalanceZero, { name: customer.name });
    }
    case 'TODAYS_SALES': {
      const { start, end } = calculateDateRange('today', now);
      const { totalSales } = getSalesSummary(data, start, end);
      return totalSales > 0
        ? fill(t.voice.querySales, { total: fmt.money(totalSales) })
        : t.voice.querySalesZero;
    }
    default:
      return t.voice.unrecognized;
  }
}

// The draft of a spoken sale travels from the voice box to the invoice screen in memory.
let pendingDraft: InvoiceDraft | null = null;

export function setPendingDraft(draft: InvoiceDraft | null): void {
  pendingDraft = draft;
}

/** Takes the waiting draft (once). */
export function takePendingDraft(): InvoiceDraft | null {
  const draft = pendingDraft;
  pendingDraft = null;
  return draft;
}
