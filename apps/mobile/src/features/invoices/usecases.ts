import { and, eq, isNull } from 'drizzle-orm';

import {
  changedColumns,
  customers,
  deletedColumns,
  getCounter,
  getValue,
  type InvoiceItemRow,
  type InvoiceRow,
  newAppendOnlyColumns,
  newMutableColumns,
  type Orm,
  setValue,
  type Tx,
  type WriteContext,
} from '@/core/db';
import { findCurrentShop, SETTINGS } from '@/core/services';
import { cleanName, DomainError } from '@/core/utils';
import {
  allocatePayments,
  recordAdjustment,
  recordInvoiceDue,
  recordReversal,
} from '@/features/ledger';
import {
  computeInvoiceTotals,
  DEFAULT_DEVICE_CODE,
  formatInvoiceNumber,
  type InvoiceTotals,
  LIMITS,
  paymentStatus,
} from '@/shared';

import {
  findInvoice,
  findInvoiceWithCustomer,
  insertInvoice,
  insertInvoiceItems,
  insertInvoiceRevision,
  listInvoiceItems,
  listInvoiceRevisions,
  listOpenInvoices,
  listPaymentsForAllocation,
  updateInvoice,
  updateInvoiceItems,
} from './repository';
import {
  type InvoiceBadgeStatus,
  type InvoiceDetails,
  type InvoiceInput,
  invoiceInputSchema,
} from './types';

// Invoice rules. Platform-free. Every use case runs in one transaction, so an invoice, its
// items, its number, its audit record and its ledger entry are saved together or not at all.

/** Runs inside the creating transaction; throw a DomainError to refuse the invoice. */
export type InvoiceGuard = (tx: Tx) => Promise<void>;

function totalsOf(data: InvoiceInput): InvoiceTotals {
  let totals: InvoiceTotals;
  try {
    totals = computeInvoiceTotals({
      lines: data.items,
      discount: data.discount,
      payment: data.payment,
    });
  } catch (error) {
    if (error instanceof RangeError) throw new DomainError('invalidTotals', 'discount');
    throw error;
  }
  // Nobody to owe the money: a walk-in sale has to be paid in full.
  if (data.customerId === null && totals.dueAmount > 0)
    throw new DomainError('walkInDue', 'payment');
  return totals;
}

async function assertCustomerExists(orm: Orm, customerId: string | null): Promise<void> {
  if (customerId === null) return;
  const rows = await orm
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)));
  if (rows.length === 0) throw new DomainError('notFound', 'customerId');
}

/**
 * Takes the next number of this device's own sequence (AGENTS.md §8.4). The sequence only ever
 * moves forward, so a number is never reused even if the invoice is cancelled later.
 */
async function nextInvoiceNumber(tx: Tx): Promise<string> {
  const shop = await findCurrentShop(tx.orm);
  if (!shop) throw new DomainError('noShop');
  const sequence = (await getCounter(tx.orm, SETTINGS.invoiceSequence)) + 1;
  await setValue(tx, SETTINGS.invoiceSequence, String(sequence));
  return formatInvoiceNumber({
    shopPrefix: shop.invoicePrefix,
    deviceCode: (await getValue(tx.orm, SETTINGS.deviceCode)) ?? DEFAULT_DEVICE_CODE,
    sequence,
  });
}

function itemRows(
  ctx: WriteContext,
  invoiceId: string,
  data: InvoiceInput,
  totals: InvoiceTotals,
): InvoiceItemRow[] {
  return data.items.map((item, position) => ({
    ...newMutableColumns(ctx),
    invoiceId,
    productId: item.productId,
    nameSnapshot: cleanName(item.name),
    qtyMilli: item.qtyMilli,
    unit: cleanName(item.unit),
    unitPrice: item.unitPrice,
    lineTotal: totals.lineTotals[position] ?? 0,
    position,
  }));
}

export async function createInvoice(
  ctx: WriteContext,
  input: InvoiceInput,
  guard?: InvoiceGuard,
): Promise<InvoiceRow> {
  const data = invoiceInputSchema.parse(input);
  const totals = totalsOf(data);

  return ctx.db.write(async (tx) => {
    await guard?.(tx);
    await assertCustomerExists(tx.orm, data.customerId);

    const invoice: InvoiceRow = {
      ...newMutableColumns(ctx),
      invoiceNumber: await nextInvoiceNumber(tx),
      customerId: data.customerId,
      date: ctx.now(),
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paidAmount: totals.paidAmount,
      dueAmount: totals.dueAmount,
      status: 'ACTIVE',
      sourceText: data.sourceText,
    };
    await insertInvoice(tx, invoice);
    await insertInvoiceItems(tx, itemRows(ctx, invoice.id, data, totals));

    if (data.customerId !== null && totals.dueAmount > 0) {
      await recordInvoiceDue(tx, ctx, {
        customerId: data.customerId,
        refId: invoice.id,
        amount: totals.dueAmount,
      });
    }
    return invoice;
  });
}

/** Snapshot of an invoice before a change, stored in its InvoiceRevision. */
async function snapshot(tx: Tx, invoice: InvoiceRow): Promise<string> {
  const { isDirty: _invoiceDirty, ...invoiceEntity } = invoice;
  const items = (await listInvoiceItems(tx.orm, invoice.id)).map(
    ({ isDirty: _itemDirty, ...item }) => item,
  );
  return JSON.stringify({ invoice: invoiceEntity, items });
}

function cleanReason(reason: string): string {
  const text = reason.trim().slice(0, LIMITS.reason);
  if (text === '') throw new DomainError('required', 'reason');
  return text;
}

async function loadActiveInvoice(tx: Tx, id: string): Promise<InvoiceRow> {
  const invoice = await findInvoice(tx.orm, id);
  if (!invoice) throw new DomainError('notFound');
  if (invoice.status !== 'ACTIVE') throw new DomainError('alreadyCancelled');
  return invoice;
}

/**
 * Cancels an invoice. Nothing is deleted: the invoice is marked CANCELLED, an InvoiceRevision
 * keeps what it looked like and why, and a REVERSAL entry removes its due amount from the
 * customer's balance. Payments already received stay in the ledger as the customer's credit.
 */
export async function cancelInvoice(ctx: WriteContext, id: string, reason: string): Promise<void> {
  const why = cleanReason(reason);
  await ctx.db.write(async (tx) => {
    const invoice = await loadActiveInvoice(tx, id);
    await insertInvoiceRevision(tx, {
      ...newAppendOnlyColumns(ctx),
      invoiceId: id,
      previousJson: await snapshot(tx, invoice),
      reason: why,
    });
    await updateInvoice(tx, id, { ...changedColumns(ctx), status: 'CANCELLED' });
    if (invoice.customerId !== null && invoice.dueAmount > 0) {
      await recordReversal(tx, ctx, {
        customerId: invoice.customerId,
        refId: id,
        amount: invoice.dueAmount,
      });
    }
  });
}

/**
 * Changes an active invoice. The previous version is kept in an InvoiceRevision, the lines are
 * replaced, and the ledger receives ADJUSTMENT entries for the difference in what is due (for
 * the old and the new customer, when the customer changed). The invoice number never changes.
 */
export async function editInvoice(
  ctx: WriteContext,
  id: string,
  input: InvoiceInput,
  reason: string,
): Promise<void> {
  const data = invoiceInputSchema.parse(input);
  const totals = totalsOf(data);
  const why = cleanReason(reason);

  await ctx.db.write(async (tx) => {
    const invoice = await loadActiveInvoice(tx, id);
    await assertCustomerExists(tx.orm, data.customerId);

    await insertInvoiceRevision(tx, {
      ...newAppendOnlyColumns(ctx),
      invoiceId: id,
      previousJson: await snapshot(tx, invoice),
      reason: why,
    });

    await updateInvoiceItems(tx, id, deletedColumns(ctx));
    await insertInvoiceItems(tx, itemRows(ctx, id, data, totals));
    await updateInvoice(tx, id, {
      ...changedColumns(ctx),
      customerId: data.customerId,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      paidAmount: totals.paidAmount,
      dueAmount: totals.dueAmount,
      sourceText: data.sourceText,
    });

    if (invoice.customerId === data.customerId) {
      const difference = totals.dueAmount - invoice.dueAmount;
      if (data.customerId !== null && difference !== 0) {
        await recordAdjustment(tx, ctx, {
          customerId: data.customerId,
          refId: id,
          amount: difference,
        });
      }
      return;
    }
    // The invoice moved to another customer: take it off the old one, put it on the new one.
    if (invoice.customerId !== null && invoice.dueAmount > 0) {
      await recordAdjustment(tx, ctx, {
        customerId: invoice.customerId,
        refId: id,
        amount: -invoice.dueAmount,
      });
    }
    if (data.customerId !== null && totals.dueAmount > 0) {
      await recordAdjustment(tx, ctx, {
        customerId: data.customerId,
        refId: id,
        amount: totals.dueAmount,
      });
    }
  });
}

/**
 * How much of each open invoice's due amount later payments have settled, keyed by invoice ID.
 * Derived from payments on demand (first in, first out); see `allocatePayments`.
 */
export async function getSettledAmounts(
  orm: Orm,
  customerIds?: readonly string[],
): Promise<Map<string, number>> {
  const open = await listOpenInvoices(orm, customerIds);
  const paid = await listPaymentsForAllocation(orm, customerIds);
  const settled = new Map<string, number>();
  for (const customerId of new Set(open.map((invoice) => invoice.customerId))) {
    const allocation = allocatePayments(
      open.filter((invoice) => invoice.customerId === customerId),
      paid.filter((payment) => payment.customerId === customerId),
    );
    allocation.forEach((amount, invoiceId) => settled.set(invoiceId, amount));
  }
  return settled;
}

/** Paid / Partly paid / Due / Cancelled, counting payments received after the sale. */
export function invoiceBadgeStatus(
  invoice: Pick<InvoiceRow, 'status' | 'total' | 'paidAmount'>,
  settledLater: number,
): InvoiceBadgeStatus {
  if (invoice.status === 'CANCELLED') return 'CANCELLED';
  return paymentStatus(invoice.total, invoice.paidAmount + settledLater);
}

export async function getInvoiceDetails(orm: Orm, id: string): Promise<InvoiceDetails | null> {
  const found = await findInvoiceWithCustomer(orm, id);
  if (!found) return null;
  const { customerId } = found.invoice;
  const settled = customerId === null ? undefined : await getSettledAmounts(orm, [customerId]);
  return {
    ...found,
    items: await listInvoiceItems(orm, id),
    revisions: await listInvoiceRevisions(orm, id),
    settledLater: settled?.get(id) ?? 0,
  };
}
