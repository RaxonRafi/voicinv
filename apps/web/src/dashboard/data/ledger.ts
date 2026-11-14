import { z } from 'zod';

import { type LedgerEntry, type LedgerEntryType, LIMITS, Money, type Payment } from '@/domain';

import { customerBalances, findCustomer } from './selectors';
import {
  ChangeSet,
  DomainError,
  newAppendOnlyColumns,
  type ShopData,
  type WriteContext,
} from './shop-data';

// Ledger rules (AGENTS.md §8.3). The ledger is append-only: nothing here updates or deletes.
//
// A customer's balance is the sum of their entries' signed amounts:
//   INVOICE_DUE  +due      the unpaid part of a new invoice
//   PAYMENT      −amount   money received from the customer
//   REVERSAL     −due      a cancelled invoice no longer counts
//   ADJUSTMENT   ±diff     an edited invoice changed what is due
// Entries for an invoice all carry that invoice's ID as `refId`.

interface EntryInput {
  customerId: string;
  /** The invoice or payment this entry belongs to. */
  refId: string;
  amount: number;
}

function entry(ctx: WriteContext, type: LedgerEntryType, input: EntryInput): LedgerEntry {
  if (!Money.isMinorUnits(input.amount)) {
    throw new RangeError('A ledger amount must be an integer number of minor units');
  }
  return { ...newAppendOnlyColumns(ctx), type, ...input };
}

/** The unpaid part of a new invoice. `amount` must be positive. */
export function invoiceDueEntry(ctx: WriteContext, input: EntryInput): LedgerEntry {
  if (input.amount <= 0) throw new RangeError('An invoice due entry must be positive');
  return entry(ctx, 'INVOICE_DUE', input);
}

/** Removes what a cancelled invoice contributed. `amount` is the due amount to remove. */
export function reversalEntry(ctx: WriteContext, input: EntryInput): LedgerEntry {
  if (input.amount <= 0) throw new RangeError('A reversal must remove a positive due amount');
  return entry(ctx, 'REVERSAL', { ...input, amount: Money.negate(input.amount) });
}

/** The change in what is due after an invoice was edited. May be negative, never zero. */
export function adjustmentEntry(ctx: WriteContext, input: EntryInput): LedgerEntry {
  if (input.amount === 0) throw new RangeError('An adjustment of zero records nothing');
  return entry(ctx, 'ADJUSTMENT', input);
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
  payment: Payment;
  /** The customer's balance after the payment (negative = they have paid in advance). */
  balance: number;
}

/**
 * Records money received from a customer: one Payment and one PAYMENT ledger entry, together.
 * Paying more than is owed is allowed and leaves an advance (negative balance).
 */
export function recordPayment(
  data: ShopData,
  ctx: WriteContext,
  input: PaymentInput,
): { changes: ChangeSet; result: PaymentResult } {
  const parsed = paymentInputSchema.parse(input);
  if (!findCustomer(data, parsed.customerId)) throw new DomainError('notFound', 'customerId');

  const payment: Payment = {
    ...newAppendOnlyColumns(ctx),
    customerId: parsed.customerId,
    amount: parsed.amount,
    date: ctx.now(),
    note: parsed.note === '' ? null : parsed.note,
    invoiceId: parsed.invoiceId,
  };
  const changes = new ChangeSet().put('payments', payment).put(
    'ledgerEntries',
    entry(ctx, 'PAYMENT', {
      customerId: parsed.customerId,
      refId: payment.id,
      amount: Money.negate(parsed.amount),
    }),
  );
  const before = customerBalances(data).get(parsed.customerId) ?? 0;
  return { changes, result: { payment, balance: Money.subtract(before, parsed.amount) } };
}
