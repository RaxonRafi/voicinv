import { type LanguageCode, type MinorUnits, type PaymentInstruction } from '@/shared';

export type VoiceIntent = 'SALE' | 'PAYMENT' | 'QUERY';

export interface CustomerCandidate {
  id?: string | null;
  name: string;
  aliases?: string[];
}

export interface ProductCandidate {
  id?: string | null;
  name: string;
  unit: string;
  defaultPrice?: MinorUnits | null;
  aliases?: string[];
}

export interface LearnedCorrection {
  heardText: string;
  correctedText: string;
  fieldType: 'customer' | 'product';
  count?: number;
}

export interface ParserContext {
  customers: readonly (CustomerCandidate | string)[];
  products: readonly ProductCandidate[];
  corrections?: readonly LearnedCorrection[];
  language?: LanguageCode;
}

export interface MatchScore<T> {
  target: T;
  score: number;
  matchedName: string;
  matchedInput: string;
}

export interface CandidateScore {
  id: string | null;
  name: string;
  score: number;
}

export interface ParsedItem {
  productId: string | null;
  name: string;
  unit: string;
  /** Quantity in thousandths (e.g. 2 bags = 2000 milli). */
  qtyMilli: number;
  /** Price in minor units per unit; null if unknown. */
  unitPrice: MinorUnits | null;
  confidence: number;
  candidates?: CandidateScore[];
}

export interface ParsedCustomer {
  id: string | null;
  name: string;
  confidence: number;
  candidates?: CandidateScore[];
}

export interface ParsedPaymentInstruction {
  payment: PaymentInstruction;
  confidence: number;
  value?: number;
}

export interface ParsedSale {
  intent: 'SALE';
  customer: ParsedCustomer | null;
  items: ParsedItem[];
  discount: MinorUnits;
  payment: PaymentInstruction;
  customerConfidence?: number;
  paymentConfidence?: number;
  confidence: number;
  sourceText: string;
}

export interface ParsedPayment {
  intent: 'PAYMENT';
  customer: ParsedCustomer | null;
  amount: MinorUnits | null;
  note?: string | null;
  confidence: number;
  sourceText: string;
}

export interface ParsedQuery {
  intent: 'QUERY';
  queryType: 'CUSTOMER_BALANCE' | 'TODAYS_SALES' | 'UNKNOWN';
  customer?: ParsedCustomer | null;
  confidence: number;
  sourceText: string;
}

export type ParseResult = ParsedSale | ParsedPayment | ParsedQuery;

export interface LanguagePackNumbers {
  digits: Record<string, number>;
  words: Record<string, number>;
  multipliers: Record<string, number>;
}

export interface FractionDef {
  value: number;
  numerator: number;
  denominator: number;
}

export interface LanguagePackFractions {
  standalone: Record<string, FractionDef>;
  prefixes: Record<
    string,
    { type: 'add' | 'subtract'; value: number; numerator: number; denominator: number }
  >;
}

export interface LanguagePackUnits {
  canonical: Record<string, string[]>;
}

export interface FractionPaymentPhrase {
  phrase: string;
  value: number;
  numerator: number;
  denominator: number;
}

export interface LanguagePackPaymentPhrases {
  full: string[];
  none: string[];
  fraction: FractionPaymentPhrase[];
  amountPatterns: string[];
}

export interface LanguagePackIntentPhrases {
  sale: string[];
  payment: string[];
  queryBalance: string[];
  querySales: string[];
}

export interface LanguagePack {
  code: LanguageCode;
  numbers: LanguagePackNumbers;
  fractions: LanguagePackFractions;
  units: LanguagePackUnits;
  paymentPhrases: LanguagePackPaymentPhrases;
  intentPhrases: LanguagePackIntentPhrases;
  suffixes: string[];
  fillers: string[];
  translit: {
    words: Record<string, string>;
    phoneticMap?: Record<string, string>;
  };
}

export interface DraftItemShape {
  key: string;
  productId: string | null;
  name: string;
  unit: string;
  qtyMilli: number | null;
  unitPrice: MinorUnits | null;
  confidence?: number;
}

export interface InvoiceDraftShape {
  customerId: string | null;
  customerName: string | null;
  customerConfidence?: number;
  items: DraftItemShape[];
  discount: MinorUnits;
  payment: PaymentInstruction;
  paymentConfidence?: number;
  sourceText: string | null;
}
