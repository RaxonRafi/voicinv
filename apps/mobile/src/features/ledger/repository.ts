import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  customers,
  invoices,
  type LedgerEntryRow,
  ledgerEntries,
  type Orm,
  type PaymentRow,
  payments,
  type Tx,
} from '@/core/db';
import { Money } from '@/shared';

// All database access of the ledger feature. Both tables are append-only: this file contains
// inserts and reads only, and the database rejects anything else (AGENTS.md §1 rule 8).

export async function insertLedgerEntry(tx: Tx, row: LedgerEntryRow): Promise<void> {
  await tx.orm.insert(ledgerEntries).values(row);
  tx.touch('ledgerEntries');
}

export async function insertPayment(tx: Tx, row: PaymentRow): Promise<void> {
  await tx.orm.insert(payments).values(row);
  tx.touch('payments');
}

/** A customer's balance: the sum of their ledger entries. Positive = they owe the shop. */
export async function getBalance(orm: Orm, customerId: string): Promise<number> {
  const rows = await orm
    .select({ balance: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId));
  return rows[0]?.balance ?? 0;
}

/** Net effect of everything recorded against one reference (an invoice) for a customer. */
export async function sumForReference(
  orm: Orm,
  customerId: string,
  refId: string,
): Promise<number> {
  const rows = await orm
    .select({ total: sql<number>`coalesce(sum(${ledgerEntries.amount}), 0)` })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.customerId, customerId), eq(ledgerEntries.refId, refId)));
  return rows[0]?.total ?? 0;
}

/** A customer's entries, oldest first (IDs are UUIDv7, so they sort by creation time). */
export async function listEntries(orm: Orm, customerId: string): Promise<LedgerEntryRow[]> {
  return orm
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.customerId, customerId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
}

export interface EntryWithInvoice {
  entry: LedgerEntryRow;
  /** Number of the invoice the entry refers to; null for payments. */
  invoiceNumber: string | null;
}

/** A customer's entries, oldest first, with the invoice number each one refers to. */
export async function listEntriesWithInvoices(
  orm: Orm,
  customerId: string,
): Promise<EntryWithInvoice[]> {
  return orm
    .select({ entry: ledgerEntries, invoiceNumber: invoices.invoiceNumber })
    .from(ledgerEntries)
    .leftJoin(invoices, eq(invoices.id, ledgerEntries.refId))
    .where(eq(ledgerEntries.customerId, customerId))
    .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
}

export async function listPayments(orm: Orm, customerId: string): Promise<PaymentRow[]> {
  return orm
    .select()
    .from(payments)
    .where(eq(payments.customerId, customerId))
    .orderBy(asc(payments.date), asc(payments.id));
}

export async function findPayment(orm: Orm, id: string): Promise<PaymentRow | null> {
  const rows = await orm.select().from(payments).where(eq(payments.id, id));
  return rows[0] ?? null;
}

export interface DebtorRow {
  customerId: string;
  name: string;
  phone: string | null;
  balance: number;
}

/** Customers who owe money, largest balance first. */
export async function listDebtors(orm: Orm, limit: number): Promise<DebtorRow[]> {
  const balance = sql<number>`sum(${ledgerEntries.amount})`;
  return orm
    .select({
      customerId: customers.id,
      name: customers.name,
      phone: customers.phone,
      balance,
    })
    .from(ledgerEntries)
    .innerJoin(customers, eq(customers.id, ledgerEntries.customerId))
    .where(isNull(customers.deletedAt))
    .groupBy(customers.id)
    .having(sql`${balance} > 0`)
    .orderBy(desc(balance), asc(customers.name))
    .limit(limit);
}

/** Total owed to the shop by all customers with a positive balance. */
export async function totalReceivable(orm: Orm): Promise<number> {
  const balance = sql<number>`sum(${ledgerEntries.amount})`;
  const rows = await orm
    .select({ balance })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.customerId)
    .having(sql`${balance} > 0`);
  return Money.sum(rows.map((row) => row.balance));
}
