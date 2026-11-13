import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Local database schema (SQLite + SQLCipher). Column names are snake_case; the TypeScript side
// uses the same camelCase field names as the shared entity schemas (src/shared/schemas).
//
// Every change here needs a new migration in ./migrations and is checked by the migration test.

/** Columns of every mutable synced record. */
const mutableColumns = {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  /** Soft delete marker. Rows are never physically removed, so deletes can sync. */
  deletedAt: integer('deleted_at'),
  deviceId: text('device_id').notNull(),
  /** Local only: true while the row has changes that were not pushed to the server yet. */
  isDirty: integer('is_dirty', { mode: 'boolean' }).notNull().default(true),
};

/** Columns of every append-only record. Triggers reject any UPDATE or DELETE on these tables. */
const appendOnlyColumns = {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull(),
  createdAt: integer('created_at').notNull(),
  deviceId: text('device_id').notNull(),
  /** Local only; the one column that may change (set to false after a successful push). */
  isDirty: integer('is_dirty', { mode: 'boolean' }).notNull().default(true),
};

export const shops = sqliteTable('shops', {
  ...mutableColumns,
  name: text('name').notNull(),
  address: text('address'),
  phone: text('phone'),
  logo: text('logo'),
  currencyCode: text('currency_code').notNull(),
  defaultLanguage: text('default_language').notNull(),
  invoicePrefix: text('invoice_prefix').notNull(),
});

export const customers = sqliteTable(
  'customers',
  {
    ...mutableColumns,
    name: text('name').notNull(),
    phone: text('phone'),
    notes: text('notes'),
    /** Minor units. Null = no limit. */
    creditLimit: integer('credit_limit'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('customers_name_idx').on(table.name)],
);

export const customerAliases = sqliteTable(
  'customer_aliases',
  {
    ...mutableColumns,
    customerId: text('customer_id').notNull(),
    alias: text('alias').notNull(),
    languageCode: text('language_code').notNull(),
  },
  (table) => [index('customer_aliases_customer_idx').on(table.customerId)],
);

export const products = sqliteTable(
  'products',
  {
    ...mutableColumns,
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    /** Minor units. Null = price is asked per sale. */
    defaultPrice: integer('default_price'),
    /** Thousandths. Reserved for later stock tracking. */
    stockQty: integer('stock_qty'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('products_name_idx').on(table.name)],
);

export const productAliases = sqliteTable(
  'product_aliases',
  {
    ...mutableColumns,
    productId: text('product_id').notNull(),
    alias: text('alias').notNull(),
    languageCode: text('language_code').notNull(),
  },
  (table) => [index('product_aliases_product_idx').on(table.productId)],
);

export const invoices = sqliteTable(
  'invoices',
  {
    ...mutableColumns,
    invoiceNumber: text('invoice_number').notNull(),
    /** Null = walk-in sale. */
    customerId: text('customer_id'),
    date: integer('date').notNull(),
    subtotal: integer('subtotal').notNull(),
    discount: integer('discount').notNull(),
    total: integer('total').notNull(),
    paidAmount: integer('paid_amount').notNull(),
    dueAmount: integer('due_amount').notNull(),
    status: text('status', { enum: ['ACTIVE', 'CANCELLED'] }).notNull(),
    sourceText: text('source_text'),
  },
  (table) => [
    uniqueIndex('invoices_number_idx').on(table.invoiceNumber),
    index('invoices_customer_idx').on(table.customerId),
    index('invoices_date_idx').on(table.date),
  ],
);

export const invoiceItems = sqliteTable(
  'invoice_items',
  {
    ...mutableColumns,
    invoiceId: text('invoice_id').notNull(),
    productId: text('product_id'),
    nameSnapshot: text('name_snapshot').notNull(),
    qtyMilli: integer('qty_milli').notNull(),
    unit: text('unit').notNull(),
    unitPrice: integer('unit_price').notNull(),
    lineTotal: integer('line_total').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [index('invoice_items_invoice_idx').on(table.invoiceId)],
);

export const payments = sqliteTable(
  'payments',
  {
    ...appendOnlyColumns,
    customerId: text('customer_id').notNull(),
    amount: integer('amount').notNull(),
    date: integer('date').notNull(),
    note: text('note'),
    invoiceId: text('invoice_id'),
  },
  (table) => [index('payments_customer_idx').on(table.customerId)],
);

export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    ...appendOnlyColumns,
    customerId: text('customer_id').notNull(),
    type: text('type', { enum: ['INVOICE_DUE', 'PAYMENT', 'REVERSAL', 'ADJUSTMENT'] }).notNull(),
    /** Signed minor units: positive = customer owes more. */
    amount: integer('amount').notNull(),
    refId: text('ref_id').notNull(),
  },
  (table) => [
    index('ledger_entries_customer_idx').on(table.customerId),
    index('ledger_entries_ref_idx').on(table.refId),
  ],
);

export const invoiceRevisions = sqliteTable(
  'invoice_revisions',
  {
    ...appendOnlyColumns,
    invoiceId: text('invoice_id').notNull(),
    previousJson: text('previous_json').notNull(),
    reason: text('reason').notNull(),
  },
  (table) => [index('invoice_revisions_invoice_idx').on(table.invoiceId)],
);

/** What the app learned from the user's fixes to voice drafts. Device-local, never synced. */
export const corrections = sqliteTable(
  'corrections',
  {
    id: text('id').primaryKey(),
    heardText: text('heard_text').notNull(),
    correctedText: text('corrected_text').notNull(),
    fieldType: text('field_type', { enum: ['customer', 'product'] }).notNull(),
    languageCode: text('language_code').notNull(),
    count: integer('count').notNull().default(1),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('corrections_heard_idx').on(table.heardText, table.fieldType, table.languageCode),
  ],
);

/** Device-local settings and state (device identity, invoice sequence, sync cursor, …). */
export const kv = sqliteTable('kv', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Every table, by the name used for change notifications. */
export const TABLES = {
  shops,
  customers,
  customerAliases,
  products,
  productAliases,
  invoices,
  invoiceItems,
  payments,
  ledgerEntries,
  invoiceRevisions,
  corrections,
  kv,
} as const;

export type TableName = keyof typeof TABLES;

/** Tables whose rows are never updated or deleted (AGENTS.md §1 rule 8). */
export const APPEND_ONLY_TABLES = ['payments', 'ledger_entries', 'invoice_revisions'] as const;

export type ShopRow = typeof shops.$inferSelect;
export type CustomerRow = typeof customers.$inferSelect;
export type CustomerAliasRow = typeof customerAliases.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductAliasRow = typeof productAliases.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceItemRow = typeof invoiceItems.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type InvoiceRevisionRow = typeof invoiceRevisions.$inferSelect;
export type CorrectionRow = typeof corrections.$inferSelect;
