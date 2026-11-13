import { and, asc, count, desc, eq, gte, inArray, isNull, like, lt, or } from 'drizzle-orm';

import {
  customers,
  type InvoiceItemRow,
  invoiceItems,
  type InvoiceRevisionRow,
  invoiceRevisions,
  type InvoiceRow,
  invoices,
  type Orm,
  payments,
  type Tx,
} from '@/core/db';

import { type InvoiceListRow } from './types';

// All database access of the invoices feature. Invoices and their items are mutable (edits
// and cancellations); every change is preceded by an append-only InvoiceRevision.

export async function insertInvoice(tx: Tx, row: InvoiceRow): Promise<void> {
  await tx.orm.insert(invoices).values(row);
  tx.touch('invoices');
}

export async function updateInvoice(
  tx: Tx,
  id: string,
  changes: Partial<typeof invoices.$inferInsert>,
): Promise<void> {
  await tx.orm.update(invoices).set(changes).where(eq(invoices.id, id));
  tx.touch('invoices');
}

export async function insertInvoiceItems(tx: Tx, rows: InvoiceItemRow[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.orm.insert(invoiceItems).values(rows);
  tx.touch('invoiceItems');
}

export async function updateInvoiceItems(
  tx: Tx,
  invoiceId: string,
  changes: Partial<typeof invoiceItems.$inferInsert>,
): Promise<void> {
  await tx.orm
    .update(invoiceItems)
    .set(changes)
    .where(and(eq(invoiceItems.invoiceId, invoiceId), isNull(invoiceItems.deletedAt)));
  tx.touch('invoiceItems');
}

export async function insertInvoiceRevision(tx: Tx, row: InvoiceRevisionRow): Promise<void> {
  await tx.orm.insert(invoiceRevisions).values(row);
  tx.touch('invoiceRevisions');
}

export async function findInvoice(orm: Orm, id: string): Promise<InvoiceRow | null> {
  const rows = await orm
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)));
  return rows[0] ?? null;
}

export async function findInvoiceWithCustomer(
  orm: Orm,
  id: string,
): Promise<InvoiceListRow | null> {
  const rows = await orm
    .select({ invoice: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)));
  return rows[0] ?? null;
}

export async function listInvoiceItems(orm: Orm, invoiceId: string): Promise<InvoiceItemRow[]> {
  return orm
    .select()
    .from(invoiceItems)
    .where(and(eq(invoiceItems.invoiceId, invoiceId), isNull(invoiceItems.deletedAt)))
    .orderBy(asc(invoiceItems.position));
}

export async function listInvoiceRevisions(
  orm: Orm,
  invoiceId: string,
): Promise<InvoiceRevisionRow[]> {
  return orm
    .select()
    .from(invoiceRevisions)
    .where(eq(invoiceRevisions.invoiceId, invoiceId))
    .orderBy(asc(invoiceRevisions.createdAt), asc(invoiceRevisions.id));
}

export interface InvoiceFilter {
  customerId?: string;
  /** Matches the invoice number or the customer's name. */
  search?: string;
  limit?: number;
}

/** Invoices, newest first. */
export async function listInvoices(
  orm: Orm,
  filter: InvoiceFilter = {},
): Promise<InvoiceListRow[]> {
  const term = filter.search?.trim();
  const pattern = term ? `%${term}%` : undefined;
  const query = orm
    .select({ invoice: invoices, customerName: customers.name })
    .from(invoices)
    .leftJoin(customers, eq(customers.id, invoices.customerId))
    .where(
      and(
        isNull(invoices.deletedAt),
        filter.customerId ? eq(invoices.customerId, filter.customerId) : undefined,
        pattern
          ? or(like(invoices.invoiceNumber, pattern), like(customers.name, pattern))
          : undefined,
      ),
    )
    .orderBy(desc(invoices.date), desc(invoices.id));
  return filter.limit ? query.limit(filter.limit) : query;
}

/** Number of invoices created in `[from, to)`, cancelled ones included (free-plan limit). */
export async function countInvoicesBetween(orm: Orm, from: number, to: number): Promise<number> {
  const rows = await orm
    .select({ total: count() })
    .from(invoices)
    .where(
      and(isNull(invoices.deletedAt), gte(invoices.createdAt, from), lt(invoices.createdAt, to)),
    );
  return rows[0]?.total ?? 0;
}

export interface OpenInvoiceRow {
  id: string;
  customerId: string;
  date: number;
  dueAmount: number;
}

/** Active invoices that left something due, for one customer or for all. */
export async function listOpenInvoices(
  orm: Orm,
  customerIds?: readonly string[],
): Promise<OpenInvoiceRow[]> {
  const rows = await orm
    .select({
      id: invoices.id,
      customerId: invoices.customerId,
      date: invoices.date,
      dueAmount: invoices.dueAmount,
    })
    .from(invoices)
    .where(
      and(
        isNull(invoices.deletedAt),
        eq(invoices.status, 'ACTIVE'),
        customerIds ? inArray(invoices.customerId, [...customerIds]) : undefined,
      ),
    );
  return rows.flatMap((row) =>
    row.customerId !== null && row.dueAmount > 0 ? [{ ...row, customerId: row.customerId }] : [],
  );
}

export interface PaymentRowForAllocation {
  customerId: string;
  amount: number;
  invoiceId: string | null;
}

/** Payments received, oldest first, for one or more customers or for all. */
export async function listPaymentsForAllocation(
  orm: Orm,
  customerIds?: readonly string[],
): Promise<PaymentRowForAllocation[]> {
  return orm
    .select({
      customerId: payments.customerId,
      amount: payments.amount,
      invoiceId: payments.invoiceId,
    })
    .from(payments)
    .where(customerIds ? inArray(payments.customerId, [...customerIds]) : undefined)
    .orderBy(asc(payments.date), asc(payments.id));
}
