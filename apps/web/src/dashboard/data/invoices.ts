import { z } from 'zod';

import {
  computeInvoiceTotals,
  type Invoice,
  type InvoiceItem,
  type InvoiceTotals,
  LIMITS,
} from '@/domain';

import { adjustmentEntry, invoiceDueEntry, reversalEntry } from './ledger';
import { findCustomer, listInvoiceItems } from './selectors';
import {
  ChangeSet,
  changedColumns,
  deletedColumns,
  DomainError,
  newAppendOnlyColumns,
  newMutableColumns,
  type ShopData,
  type WriteContext,
} from './shop-data';
import { cleanName } from './text';

// Invoice rules, the same as on the phone. Each use case returns one change set, pushed to the
// server in a single transaction, so an invoice, its lines, its audit record and its ledger
// entry are saved together or not at all.

export const invoiceItemInputSchema = z.object({
  /** The product this line was picked from; null for a line typed or spoken freely. */
  productId: z.string().min(1).nullable(),
  name: z.string().trim().min(1, 'required').max(LIMITS.name, 'tooLong'),
  unit: z.string().trim().min(1, 'required').max(LIMITS.unit, 'tooLong'),
  /** Quantity in thousandths. */
  qtyMilli: z.int('invalidQuantity').min(1, 'invalidQuantity'),
  /** Price per unit in minor units. */
  unitPrice: z.int('invalidAmount').min(0, 'invalidAmount'),
});

export const paymentInstructionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FULL') }),
  z.object({ type: z.literal('NONE') }),
  z.object({ type: z.literal('AMOUNT'), amount: z.int().min(0) }),
  z.object({
    type: z.literal('FRACTION'),
    numerator: z.int().min(0),
    denominator: z.int().min(1),
  }),
]);

export const invoiceInputSchema = z.object({
  /** Null = walk-in sale, which must be paid in full. */
  customerId: z.string().min(1).nullable(),
  items: z.array(invoiceItemInputSchema).min(1, 'required').max(LIMITS.invoiceItems, 'tooLong'),
  discount: z.int('invalidAmount').min(0, 'invalidAmount'),
  /** How much the customer pays now. */
  payment: paymentInstructionSchema,
  /** What the shopkeeper said or typed, kept with the invoice for the audit trail. */
  sourceText: z.string().max(LIMITS.sourceText).nullable(),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

function totalsOf(input: InvoiceInput): InvoiceTotals {
  let totals: InvoiceTotals;
  try {
    totals = computeInvoiceTotals({
      lines: input.items,
      discount: input.discount,
      payment: input.payment,
    });
  } catch (error) {
    if (error instanceof RangeError) throw new DomainError('invalidTotals', 'discount');
    throw error;
  }
  // Nobody to owe the money: a walk-in sale has to be paid in full.
  if (input.customerId === null && totals.dueAmount > 0) {
    throw new DomainError('walkInDue', 'payment');
  }
  return totals;
}

function assertCustomerExists(data: ShopData, customerId: string | null): void {
  if (customerId !== null && !findCustomer(data, customerId)) {
    throw new DomainError('notFound', 'customerId');
  }
}

function itemRecords(
  ctx: WriteContext,
  invoiceId: string,
  input: InvoiceInput,
  totals: InvoiceTotals,
): InvoiceItem[] {
  return input.items.map((item, position) => ({
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

/**
 * Creates an invoice with its lines and, when something is left unpaid, the INVOICE_DUE
 * ledger entry. `invoiceNumber` is the next number of this browser's own sequence.
 */
export function createInvoice(
  data: ShopData,
  ctx: WriteContext,
  input: InvoiceInput,
  invoiceNumber: string,
): { changes: ChangeSet; result: Invoice } {
  const parsed = invoiceInputSchema.parse(input);
  const totals = totalsOf(parsed);
  assertCustomerExists(data, parsed.customerId);

  const invoice: Invoice = {
    ...newMutableColumns(ctx),
    invoiceNumber,
    customerId: parsed.customerId,
    date: ctx.now(),
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    paidAmount: totals.paidAmount,
    dueAmount: totals.dueAmount,
    status: 'ACTIVE',
    sourceText: parsed.sourceText,
  };
  const changes = new ChangeSet().put('invoices', invoice);
  for (const item of itemRecords(ctx, invoice.id, parsed, totals)) changes.put('invoiceItems', item);
  if (parsed.customerId !== null && totals.dueAmount > 0) {
    changes.put(
      'ledgerEntries',
      invoiceDueEntry(ctx, {
        customerId: parsed.customerId,
        refId: invoice.id,
        amount: totals.dueAmount,
      }),
    );
  }
  return { changes, result: invoice };
}

function cleanReason(reason: string): string {
  const text = reason.trim().slice(0, LIMITS.reason);
  if (text === '') throw new DomainError('required', 'reason');
  return text;
}

function loadActiveInvoice(data: ShopData, id: string): Invoice {
  const invoice = data.invoices.get(id);
  if (!invoice || invoice.deletedAt !== null) throw new DomainError('notFound');
  if (invoice.status !== 'ACTIVE') throw new DomainError('alreadyCancelled');
  return invoice;
}

/** Snapshot of an invoice before a change, stored in its InvoiceRevision. */
function snapshot(data: ShopData, invoice: Invoice): string {
  return JSON.stringify({ invoice, items: listInvoiceItems(data, invoice.id) });
}

/**
 * Cancels an invoice. Nothing is deleted: the invoice is marked CANCELLED, an InvoiceRevision
 * keeps what it looked like and why, and a REVERSAL entry removes its due amount from the
 * customer's balance. Payments already received stay in the ledger as the customer's credit.
 */
export function cancelInvoice(
  data: ShopData,
  ctx: WriteContext,
  id: string,
  reason: string,
): { changes: ChangeSet; result: Invoice } {
  const why = cleanReason(reason);
  const invoice = loadActiveInvoice(data, id);
  const cancelled: Invoice = { ...invoice, ...changedColumns(ctx), status: 'CANCELLED' };
  const changes = new ChangeSet()
    .put('invoiceRevisions', {
      ...newAppendOnlyColumns(ctx),
      invoiceId: id,
      previousJson: snapshot(data, invoice),
      reason: why,
    })
    .put('invoices', cancelled);
  if (invoice.customerId !== null && invoice.dueAmount > 0) {
    changes.put(
      'ledgerEntries',
      reversalEntry(ctx, { customerId: invoice.customerId, refId: id, amount: invoice.dueAmount }),
    );
  }
  return { changes, result: cancelled };
}

/**
 * Changes an active invoice. The previous version is kept in an InvoiceRevision, the lines are
 * replaced, and the ledger receives ADJUSTMENT entries for the difference in what is due (for
 * the old and the new customer, when the customer changed). The invoice number never changes.
 */
export function editInvoice(
  data: ShopData,
  ctx: WriteContext,
  id: string,
  input: InvoiceInput,
  reason: string,
): { changes: ChangeSet; result: Invoice } {
  const parsed = invoiceInputSchema.parse(input);
  const totals = totalsOf(parsed);
  const why = cleanReason(reason);
  const invoice = loadActiveInvoice(data, id);
  assertCustomerExists(data, parsed.customerId);

  const changes = new ChangeSet().put('invoiceRevisions', {
    ...newAppendOnlyColumns(ctx),
    invoiceId: id,
    previousJson: snapshot(data, invoice),
    reason: why,
  });
  for (const item of listInvoiceItems(data, id)) {
    changes.put('invoiceItems', { ...item, ...deletedColumns(ctx) });
  }
  for (const item of itemRecords(ctx, id, parsed, totals)) changes.put('invoiceItems', item);

  const edited: Invoice = {
    ...invoice,
    ...changedColumns(ctx),
    customerId: parsed.customerId,
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
    paidAmount: totals.paidAmount,
    dueAmount: totals.dueAmount,
    sourceText: parsed.sourceText,
  };
  changes.put('invoices', edited);

  if (invoice.customerId === parsed.customerId) {
    const difference = totals.dueAmount - invoice.dueAmount;
    if (parsed.customerId !== null && difference !== 0) {
      changes.put(
        'ledgerEntries',
        adjustmentEntry(ctx, { customerId: parsed.customerId, refId: id, amount: difference }),
      );
    }
    return { changes, result: edited };
  }
  // The invoice moved to another customer: take it off the old one, put it on the new one.
  if (invoice.customerId !== null && invoice.dueAmount > 0) {
    changes.put(
      'ledgerEntries',
      adjustmentEntry(ctx, {
        customerId: invoice.customerId,
        refId: id,
        amount: -invoice.dueAmount,
      }),
    );
  }
  if (parsed.customerId !== null && totals.dueAmount > 0) {
    changes.put(
      'ledgerEntries',
      adjustmentEntry(ctx, { customerId: parsed.customerId, refId: id, amount: totals.dueAmount }),
    );
  }
  return { changes, result: edited };
}
