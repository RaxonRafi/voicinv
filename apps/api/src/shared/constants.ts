/** Languages shipped in v1. New languages are added as data (language packs, translations). */
export const SUPPORTED_LANGUAGES = ['en', 'bn'] as const;
export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number];

export const INVOICE_STATUSES = ['ACTIVE', 'CANCELLED'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** How much of an invoice has been settled. Derived, never stored. */
export const PAYMENT_STATUSES = ['PAID', 'PARTLY_PAID', 'DUE'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Ledger entry types. A customer's balance is the sum of their entries' signed amounts:
 * positive = the customer owes the shop, negative = the shop owes the customer.
 */
export const LEDGER_ENTRY_TYPES = ['INVOICE_DUE', 'PAYMENT', 'REVERSAL', 'ADJUSTMENT'] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const VOICE_INTENTS = ['SALE', 'PAYMENT', 'QUERY'] as const;
export type VoiceIntent = (typeof VOICE_INTENTS)[number];

/** Draft fields below this confidence are highlighted on the confirmation screen. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export const PLANS = ['FREE', 'PRO'] as const;
export type Plan = (typeof PLANS)[number];

/** Invoices a shop on the free plan may create per calendar month. */
export const FREE_INVOICES_PER_MONTH = 30;

/** Automatic local backups kept on the device. */
export const LOCAL_BACKUPS_TO_KEEP = 7;

export const PLATFORMS = ['android', 'ios'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Field length limits shared by forms, the local database and the API. */
export const LIMITS = {
  name: 120,
  phone: 20,
  notes: 1000,
  address: 300,
  unit: 20,
  alias: 120,
  reason: 300,
  sourceText: 1000,
  invoiceItems: 200,
} as const;
