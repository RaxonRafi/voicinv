import { type Migration } from '../migrator';

const MUTABLE = `
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  device_id TEXT NOT NULL,
  is_dirty INTEGER NOT NULL DEFAULT 1`;

const APPEND_ONLY = `
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  is_dirty INTEGER NOT NULL DEFAULT 1`;

/**
 * Financial records are append-only (AGENTS.md §1 rule 8). These triggers make the database
 * itself refuse to change or remove them; only the local `is_dirty` sync flag may be updated.
 */
function appendOnlyTriggers(table: string, columns: readonly string[]): string[] {
  const guarded = ['id', 'shop_id', 'created_at', 'device_id', ...columns].join(', ');
  return [
    `CREATE TRIGGER ${table}_no_update BEFORE UPDATE OF ${guarded} ON ${table}
     BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
    `CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table}
     BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END`,
  ];
}

export const initial: Migration = {
  id: '0001-initial',
  statements: [
    `CREATE TABLE shops (${MUTABLE},
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      logo TEXT,
      currency_code TEXT NOT NULL,
      default_language TEXT NOT NULL,
      invoice_prefix TEXT NOT NULL
    )`,

    `CREATE TABLE customers (${MUTABLE},
      name TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      credit_limit INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX customers_name_idx ON customers (name)`,

    `CREATE TABLE customer_aliases (${MUTABLE},
      customer_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      language_code TEXT NOT NULL
    )`,
    `CREATE INDEX customer_aliases_customer_idx ON customer_aliases (customer_id)`,

    `CREATE TABLE products (${MUTABLE},
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      default_price INTEGER,
      stock_qty INTEGER,
      is_archived INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX products_name_idx ON products (name)`,

    `CREATE TABLE product_aliases (${MUTABLE},
      product_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      language_code TEXT NOT NULL
    )`,
    `CREATE INDEX product_aliases_product_idx ON product_aliases (product_id)`,

    `CREATE TABLE invoices (${MUTABLE},
      invoice_number TEXT NOT NULL,
      customer_id TEXT,
      date INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      discount INTEGER NOT NULL,
      total INTEGER NOT NULL,
      paid_amount INTEGER NOT NULL,
      due_amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      source_text TEXT,
      CHECK (status IN ('ACTIVE', 'CANCELLED')),
      CHECK (subtotal - discount = total),
      CHECK (paid_amount + due_amount = total),
      CHECK (subtotal >= 0 AND discount >= 0 AND paid_amount >= 0 AND due_amount >= 0)
    )`,
    `CREATE UNIQUE INDEX invoices_number_idx ON invoices (invoice_number)`,
    `CREATE INDEX invoices_customer_idx ON invoices (customer_id)`,
    `CREATE INDEX invoices_date_idx ON invoices (date)`,

    `CREATE TABLE invoice_items (${MUTABLE},
      invoice_id TEXT NOT NULL,
      product_id TEXT,
      name_snapshot TEXT NOT NULL,
      qty_milli INTEGER NOT NULL,
      unit TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      position INTEGER NOT NULL,
      CHECK (qty_milli > 0 AND unit_price >= 0 AND line_total >= 0)
    )`,
    `CREATE INDEX invoice_items_invoice_idx ON invoice_items (invoice_id)`,

    `CREATE TABLE payments (${APPEND_ONLY},
      customer_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      date INTEGER NOT NULL,
      note TEXT,
      invoice_id TEXT,
      CHECK (amount > 0)
    )`,
    `CREATE INDEX payments_customer_idx ON payments (customer_id)`,
    ...appendOnlyTriggers('payments', ['customer_id', 'amount', 'date', 'note', 'invoice_id']),

    `CREATE TABLE ledger_entries (${APPEND_ONLY},
      customer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      ref_id TEXT NOT NULL,
      CHECK (type IN ('INVOICE_DUE', 'PAYMENT', 'REVERSAL', 'ADJUSTMENT'))
    )`,
    `CREATE INDEX ledger_entries_customer_idx ON ledger_entries (customer_id)`,
    `CREATE INDEX ledger_entries_ref_idx ON ledger_entries (ref_id)`,
    ...appendOnlyTriggers('ledger_entries', ['customer_id', 'type', 'amount', 'ref_id']),

    `CREATE TABLE invoice_revisions (${APPEND_ONLY},
      invoice_id TEXT NOT NULL,
      previous_json TEXT NOT NULL,
      reason TEXT NOT NULL
    )`,
    `CREATE INDEX invoice_revisions_invoice_idx ON invoice_revisions (invoice_id)`,
    ...appendOnlyTriggers('invoice_revisions', ['invoice_id', 'previous_json', 'reason']),

    `CREATE TABLE corrections (
      id TEXT PRIMARY KEY NOT NULL,
      heard_text TEXT NOT NULL,
      corrected_text TEXT NOT NULL,
      field_type TEXT NOT NULL,
      language_code TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      CHECK (field_type IN ('customer', 'product'))
    )`,
    `CREATE UNIQUE INDEX corrections_heard_idx
      ON corrections (heard_text, field_type, language_code)`,

    `CREATE TABLE kv (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
  ],
};
