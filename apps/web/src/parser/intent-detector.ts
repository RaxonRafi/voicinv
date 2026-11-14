import { normalizeBengaliVariants } from './normalizer';
import { type LanguagePack, type VoiceIntent } from './types';

/** Phrases are matched against normalized input, so they are normalized the same way. */
const phraseKey = (phrase: string) => normalizeBengaliVariants(phrase).toLowerCase();

/**
 * Detects the voice intent based on phrases and structure in the input.
 */
export function detectVoiceIntent(
  text: string,
  hasItems: boolean,
  packs: readonly LanguagePack[],
): {
  intent: VoiceIntent;
  confidence: number;
  queryType?: 'CUSTOMER_BALANCE' | 'TODAYS_SALES' | 'UNKNOWN';
} {
  const lower = text.toLowerCase();

  // 1. Check QUERY intent first (explicit balance/sales queries)
  // If the text contains "towards balance" or "paid towards balance", it is a payment, not a balance query.
  const isTowardsBalance = lower.includes('towards balance') || lower.includes('paid towards');

  if (!isTowardsBalance) {
    for (const pack of packs) {
      for (const phrase of pack.intentPhrases.querySales) {
        if (lower.includes(phraseKey(phrase))) {
          return { intent: 'QUERY', confidence: 0.95, queryType: 'TODAYS_SALES' };
        }
      }
      for (const phrase of pack.intentPhrases.queryBalance) {
        if (lower.includes(phraseKey(phrase))) {
          return { intent: 'QUERY', confidence: 0.95, queryType: 'CUSTOMER_BALANCE' };
        }
      }
    }
  }

  // 2. Check PAYMENT intent (payments to ledger, not a sale invoice)
  // If there are explicit items (product + qty), it is a SALE even if money is paid.
  if (!hasItems) {
    for (const pack of packs) {
      for (const phrase of pack.intentPhrases.payment) {
        if (lower.includes(phraseKey(phrase))) {
          return { intent: 'PAYMENT', confidence: 0.9 };
        }
      }
    }
  }

  // 3. Check SALE intent
  if (hasItems) {
    return { intent: 'SALE', confidence: 0.95 };
  }

  for (const pack of packs) {
    for (const phrase of pack.intentPhrases.sale) {
      if (lower.includes(phraseKey(phrase))) {
        return { intent: 'SALE', confidence: 0.8 };
      }
    }
  }

  // Default to SALE with lower confidence
  return { intent: 'SALE', confidence: 0.6 };
}
