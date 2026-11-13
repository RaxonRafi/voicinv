import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import {
  customers,
  type LedgerEntryRow,
  newAppendOnlyColumns,
  type Orm,
  type PaymentRow,
  type Tx,
  type WriteContext,
} from '@/core/db';
import { DomainError } from '@/core/utils';
import { type LedgerEntryType, LIMITS, Money } from '@/shared';

import {
  getBalance,
  insertLedgerEntry,
  insertPayment,
  listEntriesWithInvoices,
} from './repository';

// Ledger rules (AGENTS.md §8.3). The ledger is append-only: nothing here updates or deletes.
//
// A customer's balance is the sum of their entries' signed amounts:
//   INVOICE_DUE  +due      the unpaid part of a new invoice
//   PAYMENT      −amount   money received from the customer
//   REVERSAL     −due      a cancelled invoice no longer counts
//   ADJUSTMENT   ±diff     an edited invoice changed what is due
// Entries for an invoice all carry that invoice's ID as `refId`, so for an active invoice the
// entries with its ID always add up to its current due amount, and to zero once cancelled.

interface EntryInput {
  customerId: string;
  /** The invoice or payment this entry belongs to. */
  refId: string;
  amount: number;
}

async function addEntry(
  tx: Tx,
  ctx: WriteContext,
  type: LedgerEntryType,
  { customerId, refId, amount }: EntryInput,
): Promise<LedgerEntryRow> {
  if (!Money.isMinorUnits(amount)) {
    throw new RangeError('A ledger amount must be an integer number of minor units');
  }
  const row: LedgerEntryRow = { ...newAppendOnlyColumns(ctx), customerId, type, amount, refId };
  await insertLedgerEntry(tx, row);
  return row;
}

/** Records the unpaid part of a new invoice. `amount` must be positive. */
export function recordInvoiceDue(tx: Tx, ctx: WriteContext, input: EntryInput) {
  if (input.amount <= 0) throw new RangeError('An invoice due entry must be positive');
  return addEntry(tx, ctx, 'INVOICE_DUE', input);
}

/** Cancels what an invoice contributed to the balance. `amount` is the due amount to remove. */
export function recordReversal(tx: Tx, ctx: WriteContext, input: EntryInput) {
  if (input.amount <= 0) throw new RangeError('A reversal must remove a positive due amount');
  return addEntry(tx, ctx, 'REVERSAL', { ...input, amount: Money.negate(input.amount) });
}

/** Records the change in what is due after an invoice was edited. May be negative. */
export function recordAdjustment(tx: Tx, ctx: WriteContext, input: EntryInput) {
  if (input.amount === 0) throw new RangeError('An adjustment of zero records nothing');
  return addEntry(tx, ctx, 'ADJUSTMENT', input);
}

export const paymentInputSchema = z.object({
  customerId: z.string().min(1, 'required'),
  /** Minor units; must be positive. */
  amount: z.int('invalidAmount').min(1, 'invalidAmount'),
  note: z.string().trim().max(LIMITS.notes, 'tooLong'),
  /** The invoice this payment is for, when the customer says so. */
  invoiceId: z.string().min(1).nullable(),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export interface PaymentResult {
  payment: PaymentRow;
  /** The customer's balance after the payment (negative = they have paid in advance). */
  balance: number;
}

/**
 * Records money received from a customer: one Payment and one PAYMENT ledger entry, together.
 * Paying more than is owed is allowed and leaves an advance (negative balance).
 */
export async function recordPayment(
  ctx: WriteContext,
  input: PaymentInput,
): Promise<PaymentResult> {
  const data = paymentInputSchema.parse(input);
  return ctx.db.write(async (tx) => {
    const found = await tx.orm
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, data.customerId), isNull(customers.deletedAt)));
    if (found.length === 0) throw new DomainError('notFound', 'customerId');

    const payment: PaymentRow = {
      ...newAppendOnlyColumns(ctx),
      customerId: data.customerId,
      amount: data.amount,
      date: ctx.now(),
      note: data.note === '' ? null : data.note,
      invoiceId: data.invoiceId,
    };
    await insertPayment(tx, payment);
    await addEntry(tx, ctx, 'PAYMENT', {
      customerId: data.customerId,
      refId: payment.id,
      amount: Money.negate(data.amount),
    });
    return { payment, balance: await getBalance(tx.orm, data.customerId) };
  });
}

export interface StatementLine {
  entry: LedgerEntryRow;
  /** Number of the invoice the entry refers to; null for payments. */
  invoiceNumber: string | null;
  /** Balance right after this entry. */
  balance: number;
}

/** A customer's entries, oldest first, each with the running balance. */
export async function getStatement(orm: Orm, customerId: string): Promise<StatementLine[]> {
  let balance = 0;
  return (await listEntriesWithInvoices(orm, customerId)).map(({ entry, invoiceNumber }) => {
    balance = Money.add(balance, entry.amount);
    return { entry, invoiceNumber, balance };
  });
}

export type CreditStatus = 'none' | 'within' | 'over';

/** Whether a balance has passed the customer's credit limit. No limit means no warning. */
export function creditStatus(balance: number, creditLimit: number | null): CreditStatus {
  if (creditLimit === null) return 'none';
  return balance > creditLimit ? 'over' : 'within';
}

export interface OpenInvoice {
  id: string;
  /** Used for first-in-first-out order. */
  date: number;
  /** What was left unpaid at the time of sale (after later edits). */
  dueAmount: number;
}

export interface PaymentForAllocation {
  amount: number;
  /** Invoice the customer named when paying, if any. */
  invoiceId: string | null;
}

/**
 * Works out how much of each invoice's due amount has been settled by later payments.
 * Payments made for a specific invoice go to it first; everything else settles the oldest
 * invoices first. Derived on demand, never stored: the ledger entries stay the only truth.
 */
export function allocatePayments(
  invoices: readonly OpenInvoice[],
  paymentsMade: readonly PaymentForAllocation[],
): Map<string, number> {
  const settled = new Map<string, number>(invoices.map((invoice) => [invoice.id, 0]));
  const dueOf = new Map(invoices.map((invoice) => [invoice.id, invoice.dueAmount]));
  let pool = 0;

  for (const payment of paymentsMade) {
    const due = payment.invoiceId === null ? undefined : dueOf.get(payment.invoiceId);
    if (payment.invoiceId === null || due === undefined) {
      pool = Money.add(pool, payment.amount);
      continue;
    }
    const already = settled.get(payment.invoiceId) ?? 0;
    const applied = Money.min(payment.amount, Money.subtract(due, already));
    settled.set(payment.invoiceId, Money.add(already, applied));
    pool = Money.add(pool, Money.subtract(payment.amount, applied));
  }

  const oldestFirst = [...invoices].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  for (const invoice of oldestFirst) {
    if (pool === 0) break;
    const already = settled.get(invoice.id) ?? 0;
    const applied = Money.min(pool, Money.subtract(invoice.dueAmount, already));
    settled.set(invoice.id, Money.add(already, applied));
    pool = Money.subtract(pool, applied);
  }
  return settled;
}
