import { type PaymentStatus } from '../constants.js';
import {
  add,
  assertMinorUnits,
  clamp,
  fraction,
  type MinorUnits,
  multiplyByQuantity,
  subtract,
} from '../money/money.js';

/** How much the customer pays at the time of sale, as said or typed by the shopkeeper. */
export type PaymentInstruction =
  | { type: 'FULL' }
  | { type: 'NONE' }
  | { type: 'AMOUNT'; amount: MinorUnits }
  | { type: 'FRACTION'; numerator: number; denominator: number };

export interface InvoiceLineInput {
  unitPrice: MinorUnits;
  /** Quantity in thousandths. */
  qtyMilli: number;
}

export interface InvoiceTotalsInput {
  lines: readonly InvoiceLineInput[];
  discount?: MinorUnits;
  payment: PaymentInstruction;
}

export interface InvoiceTotals {
  lineTotals: MinorUnits[];
  subtotal: MinorUnits;
  discount: MinorUnits;
  total: MinorUnits;
  paidAmount: MinorUnits;
  dueAmount: MinorUnits;
  /** Money handed over beyond the total (only for `AMOUNT` payments). Not stored. */
  change: MinorUnits;
}

export function lineTotal(line: InvoiceLineInput): MinorUnits {
  assertMinorUnits(line.unitPrice, 'unitPrice');
  if (line.unitPrice < 0) throw new RangeError('unitPrice cannot be negative');
  if (!Number.isSafeInteger(line.qtyMilli) || line.qtyMilli <= 0) {
    throw new RangeError('qtyMilli must be a positive integer');
  }
  return multiplyByQuantity(line.unitPrice, line.qtyMilli);
}

/** Amount paid for a given total. Never negative and never more than the total. */
export function resolvePayment(total: MinorUnits, payment: PaymentInstruction): MinorUnits {
  assertMinorUnits(total, 'total');
  switch (payment.type) {
    case 'FULL':
      return total;
    case 'NONE':
      return 0;
    case 'AMOUNT':
      assertMinorUnits(payment.amount, 'payment amount');
      return clamp(payment.amount, 0, total);
    case 'FRACTION':
      if (payment.denominator <= 0 || payment.numerator < 0) {
        throw new RangeError('Payment fraction must be non-negative with a positive denominator');
      }
      return clamp(fraction(total, payment.numerator, payment.denominator), 0, total);
  }
}

/**
 * The single place invoice arithmetic happens: line totals, subtotal, discount, total and the
 * paid/due split. `total = subtotal − discount` and `paidAmount + dueAmount = total` always hold.
 */
export function computeInvoiceTotals({
  lines,
  discount = 0,
  payment,
}: InvoiceTotalsInput): InvoiceTotals {
  const lineTotals = lines.map(lineTotal);
  const subtotal = add(...lineTotals);
  assertMinorUnits(discount, 'discount');
  if (discount < 0 || discount > subtotal) {
    throw new RangeError('discount must be between zero and the subtotal');
  }
  const total = subtract(subtotal, discount);
  const paidAmount = resolvePayment(total, payment);
  const dueAmount = subtract(total, paidAmount);
  const change =
    payment.type === 'AMOUNT' && payment.amount > total ? subtract(payment.amount, total) : 0;
  return { lineTotals, subtotal, discount, total, paidAmount, dueAmount, change };
}

/** Paid / Partly paid / Due for an amount settled against a total. */
export function paymentStatus(total: MinorUnits, settled: MinorUnits): PaymentStatus {
  assertMinorUnits(total, 'total');
  assertMinorUnits(settled, 'settled');
  if (settled >= total) return 'PAID';
  return settled > 0 ? 'PARTLY_PAID' : 'DUE';
}
